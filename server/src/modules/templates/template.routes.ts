import { createHash, randomBytes } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import QRCode from "qrcode";
import { Router } from "express";
import type { Request, Response } from "express";
import type { ResultSetHeader, RowDataPacket } from "mysql2/promise";
import { z } from "zod";
import { env } from "../../config/env";
import { pool } from "../../db/mysql";
import { requireAnyRole, requireAuth } from "../../middleware/auth";
import { asyncHandler } from "../../shared/async-handler";
import { writeAuditLog } from "../../shared/audit";
import { assertDocumentAccess, getActiveAssignment, isAdmin } from "../../shared/document-access";
import { calculateDocumentContentHash } from "../../shared/document-hash";
import { AppError, forbidden, notFound } from "../../shared/errors";
import { created, ok } from "../../shared/http";
import { uuid } from "../../shared/ids";
import { documentContentToPlainText, normalizeDocumentContent, normalizeTemplateFieldRecord } from "../documents/document-content";
import { signatureEventsWithAssets } from "./final-render-service";
import { renderHtmlToPdf } from "./pdf-renderer";
import { defaultTemplateLayout, renderTemplateHtml } from "./template-renderer";
import type { TemplateLayout } from "./template-renderer";

export const templateRouter = Router();
export const adminTemplateRouter = Router();

templateRouter.use(requireAuth);
adminTemplateRouter.use(requireAuth, requireAnyRole(["system_admin", "admin_staff"]));

const templateIdSchema = z.object({ templateId: z.coerce.number().int().positive() });
const versionIdSchema = z.object({
  templateId: z.coerce.number().int().positive(),
  versionId: z.coerce.number().int().positive()
});
const bindingIdSchema = z.object({ bindingId: z.coerce.number().int().positive() });
const documentIdSchema = z.object({ documentId: z.coerce.number().int().positive() });
const assetIdSchema = z.object({ assetId: z.coerce.number().int().positive() });
const optionalNullableString = z.string().trim().min(1).nullable().optional();
const localeSchema = z.enum(["all", "en", "fa-AF", "ps-AF"]).default("all");
const variantSchema = z.enum(["official", "internal", "archive", "routing_sheet"]).default("official");
const layoutSchema = z.record(z.string(), z.unknown());
const maxTemplateLogoAssets = 10;
const templateLogoPurpose = "template_logo";

const createTemplateSchema = z.object({
  name: z.string().trim().min(1).max(180),
  description: optionalNullableString,
  layout_definition: layoutSchema.optional()
});

const updateTemplateSchema = z.object({
  name: z.string().trim().min(1).max(180).optional(),
  description: optionalNullableString,
  layout_definition: layoutSchema.optional()
});

const rejectSchema = z.object({
  review_note: z.string().trim().min(1).max(1000)
});

const bindingSchema = z.object({
  document_type_id: z.coerce.number().int().positive().nullable().optional(),
  locale: localeSchema,
  variant: variantSchema,
  template_id: z.coerce.number().int().positive(),
  template_version_id: z.coerce.number().int().positive().optional()
});

const activeTemplatesQuerySchema = z.object({
  document_type_id: z.coerce.number().int().positive().nullable().optional(),
  locale: localeSchema,
  variant: variantSchema
});

const assetUploadSchema = z.object({
  original_filename: z.string().trim().min(1).max(255),
  mime_type: z.enum(["image/png", "image/jpeg", "image/webp", "image/svg+xml"]),
  data_base64: z.string().trim().min(1)
});

const renderSchema = z.object({
  template_id: z.coerce.number().int().positive().nullable().optional(),
  template_version_id: z.coerce.number().int().positive().nullable().optional(),
  layout_draft_id: z.coerce.number().int().positive().nullable().optional(),
  layout_definition: layoutSchema.optional(),
  variant: variantSchema,
  locale: localeSchema,
  output: z.enum(["html", "pdf"]).default("pdf"),
  signature_visibility: z.array(z.object({
    signature_event_id: z.coerce.number().int().positive().nullable().optional(),
    is_visible: z.boolean(),
    visibility_reason: optionalNullableString
  })).default([])
});
const pdfRenderSchema = renderSchema.extend({
  download: z.boolean().default(false)
});

const templateFieldKeySchema = z.string().trim().min(1).max(80).regex(/^[a-zA-Z0-9_.-]+$/);
const templateFieldValueSchema = z.string().max(10_000);
const draftPreviewSchema = z.object({
  template_id: z.coerce.number().int().positive().nullable().optional(),
  template_version_id: z.coerce.number().int().positive().nullable().optional(),
  layout_definition: layoutSchema.optional(),
  document_type_id: z.coerce.number().int().positive().nullable().optional(),
  confidentiality_level_id: z.coerce.number().int().positive().nullable().optional(),
  priority_level_id: z.coerce.number().int().positive().nullable().optional(),
  document_date: z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  subject: z.string().trim().max(255).optional(),
  summary: z.string().trim().max(1000).nullable().optional(),
  body: z.string().max(200_000).default(""),
  document_content: z.unknown().optional(),
  template_fields: z.record(templateFieldKeySchema, templateFieldValueSchema).optional(),
  variant: variantSchema,
  locale: localeSchema
}).superRefine((input, context) => {
  if (!input.layout_definition && !input.template_id && !input.template_version_id) {
    context.addIssue({
      code: "custom",
      message: "Select a template to preview.",
      path: ["template_id"]
    });
  }
});

function parseJson<T>(value: unknown, fallback: T): T {
  if (!value) {
    return fallback;
  }

  if (typeof value === "string") {
    try {
      return JSON.parse(value) as T;
    } catch {
      return fallback;
    }
  }

  return value as T;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function assertTemplateLayout(value: unknown, message = "Template layout is invalid."): TemplateLayout {
  if (!isRecord(value) || !isRecord(value.page)) {
    throw new AppError(422, "invalid_template_layout", message);
  }

  const isWordTemplate = value.mode === "word_template" || value.schemaVersion === 2;
  if (!Array.isArray(value.blocks) && !(isWordTemplate && isRecord(value.document))) {
    throw new AppError(422, "invalid_template_layout", message);
  }

  return value as TemplateLayout;
}

function parseTemplateLayoutDefinition(value: unknown, message = "Template layout is invalid.") {
  return assertTemplateLayout(parseJson<TemplateLayout | null>(value, null), message);
}

function activeBindingPayload(row: RowDataPacket) {
  return {
    ...row,
    layout_definition: parseTemplateLayoutDefinition(row.layoutDefinition, "The active published template layout is invalid.")
  };
}

function extensionForMimeType(mimeType: string) {
  return mimeType === "image/png" ? "png"
    : mimeType === "image/webp" ? "webp"
      : mimeType === "image/svg+xml" ? "svg"
        : "jpg";
}

function base64ImageBuffer(value: string) {
  return Buffer.from(value.replace(/^data:[^;]+;base64,/, ""), "base64");
}

function logoAssetPayload(row: RowDataPacket) {
  return {
    id: Number(row.id),
    storage_path: String(row.storage_path),
    original_filename: String(row.original_filename),
    mime_type: String(row.mime_type),
    byte_size: Number(row.byte_size),
    created_at: row.created_at,
    preview_url: `/api/admin/templates/logo-assets/${Number(row.id)}/content`
  };
}

function templateAssetAbsolutePath(storagePath: string) {
  const storageRoot = path.resolve(process.cwd(), "storage/template-assets");
  const absolute = path.resolve(process.cwd(), storagePath);
  if (!absolute.startsWith(`${storageRoot}${path.sep}`)) {
    throw forbidden();
  }
  return absolute;
}

function isTemplateOwner(template: RowDataPacket, userId: number | undefined) {
  return Boolean(userId && Number(template.owner_user_id) === userId);
}

async function fetchTemplate(templateId: number) {
  const [rows] = await pool.execute<RowDataPacket[]>(
    `SELECT
      document_templates.*,
      users.username AS ownerUsername,
      persons.display_name AS ownerDisplayName,
      active_versions.version_number AS currentVersionNumber,
      active_versions.status AS currentVersionStatus
     FROM document_templates
     INNER JOIN users ON document_templates.owner_user_id = users.id
     INNER JOIN persons ON users.person_id = persons.id
     LEFT JOIN document_template_versions AS active_versions ON document_templates.current_version_id = active_versions.id
     WHERE document_templates.id = ? AND document_templates.deleted_at IS NULL
     LIMIT 1`,
    [templateId]
  );
  return rows[0] || null;
}

async function fetchTemplateVersion(versionId: number) {
  const [rows] = await pool.execute<RowDataPacket[]>(
    "SELECT * FROM document_template_versions WHERE id = ? LIMIT 1",
    [versionId]
  );
  return rows[0] || null;
}

async function fetchLatestTemplateVersion(templateId: number) {
  const [rows] = await pool.execute<RowDataPacket[]>(
    `SELECT *
     FROM document_template_versions
     WHERE template_id = ?
     ORDER BY version_number DESC
     LIMIT 1`,
    [templateId]
  );
  return rows[0] || null;
}

async function listTemplateVersions(templateId: number) {
  const [rows] = await pool.execute<RowDataPacket[]>(
    `SELECT
      document_template_versions.*,
      reviewers.username AS reviewedByUsername,
      submitters.username AS submittedByUsername
     FROM document_template_versions
     LEFT JOIN users AS reviewers ON document_template_versions.reviewed_by_user_id = reviewers.id
     LEFT JOIN users AS submitters ON document_template_versions.submitted_by_user_id = submitters.id
     WHERE template_id = ?
     ORDER BY version_number DESC`,
    [templateId]
  );
  return rows.map((row) => ({
    ...row,
    layout_definition: parseJson(row.layout_definition, defaultTemplateLayout())
  }));
}

async function assertTemplateReadable(templateId: number, request: Request, response: Response) {
  const template = await fetchTemplate(templateId);
  if (!template) {
    throw notFound("Template");
  }

  if (template.status === "published" || template.visibility === "public" || isTemplateOwner(template, request.session.userId) || isAdmin(response)) {
    return template;
  }

  throw forbidden();
}

async function assertTemplateEditable(templateId: number, request: Request, response: Response) {
  const template = await fetchTemplate(templateId);
  if (!template) {
    throw notFound("Template");
  }

  if (isTemplateOwner(template, request.session.userId) || isAdmin(response)) {
    return template;
  }

  throw forbidden();
}

async function templatePayload(templateId: number, request: Request, response: Response) {
  const template = await assertTemplateReadable(templateId, request, response);
  return {
    template,
    versions: await listTemplateVersions(templateId)
  };
}

async function findActiveTemplateBindings(input: {
  documentTypeId?: number | null;
  limit?: number;
  locale: z.infer<typeof localeSchema>;
  variant: z.infer<typeof variantSchema>;
}) {
  const params: any[] = [
    input.documentTypeId || null,
    input.documentTypeId || null,
    input.locale,
    input.locale,
    input.variant
  ];
  const limitSql = String(Number(input.limit || 1));
  const [rows] = await pool.execute<RowDataPacket[]>(
    `SELECT
      document_template_bindings.*,
      document_types.name AS documentTypeName,
      document_templates.name AS templateName,
      document_templates.description AS templateDescription,
      document_template_versions.version_number AS templateVersionNumber,
      document_template_versions.layout_definition AS layoutDefinition
     FROM document_template_bindings
     LEFT JOIN document_types ON document_template_bindings.document_type_id = document_types.id
     INNER JOIN document_templates ON document_template_bindings.template_id = document_templates.id
     INNER JOIN document_template_versions ON document_template_bindings.template_version_id = document_template_versions.id
     WHERE document_template_bindings.status = 'active'
       AND document_templates.status = 'published'
       AND document_template_versions.status = 'active'
       AND (document_template_bindings.document_type_id <=> ? OR document_template_bindings.document_type_id IS NULL OR ? IS NULL)
       AND (document_template_bindings.locale = ? OR document_template_bindings.locale = 'all' OR ? = 'all')
       AND document_template_bindings.variant = ?
     ORDER BY
       document_template_bindings.document_type_id IS NULL ASC,
       document_template_bindings.locale = 'all' ASC,
       document_template_bindings.id DESC
     LIMIT ${limitSql}`,
    params
  );
  return rows;
}

async function fetchDocumentLayoutSnapshot(documentId: number) {
  const [rows] = await pool.execute<RowDataPacket[]>(
    `SELECT *
     FROM document_layout_drafts
     WHERE document_id = ?
       AND deleted_at IS NULL
     ORDER BY updated_at DESC, id DESC
     LIMIT 1`,
    [documentId]
  );
  return rows[0] || null;
}

async function getRenderableLayout(input: z.infer<typeof renderSchema>, options: { documentId?: number; documentTypeId?: number | null } = {}) {
  if (input.layout_definition) {
    return { layout: assertTemplateLayout(input.layout_definition), template: null, version: null, layoutDraft: null };
  }

  if (input.layout_draft_id) {
    const where = ["id = ?", "deleted_at IS NULL"];
    const params: any[] = [input.layout_draft_id];
    if (options.documentId) {
      where.push("document_id = ?");
      params.push(options.documentId);
    }
    const [rows] = await pool.execute<RowDataPacket[]>(
      `SELECT * FROM document_layout_drafts WHERE ${where.join(" AND ")} LIMIT 1`,
      params
    );
    const layoutDraft = rows[0];
    if (!layoutDraft) {
      throw notFound("Layout draft");
    }
    return {
      layout: parseTemplateLayoutDefinition(layoutDraft.layout_definition, "The saved document layout draft is invalid."),
      template: null,
      version: null,
      layoutDraft
    };
  }

  if (options.documentId) {
    const layoutDraft = await fetchDocumentLayoutSnapshot(options.documentId);
    if (layoutDraft) {
      return {
        layout: parseTemplateLayoutDefinition(layoutDraft.layout_definition, "The saved document layout snapshot is invalid."),
        template: null,
        version: null,
        layoutDraft
      };
    }
  }

  const versionId = input.template_version_id;
  if (versionId) {
    const version = await fetchTemplateVersion(versionId);
    if (!version || version.status !== "active") {
      throw new AppError(422, "invalid_template_version", "Selected template version is not active.");
    }
    const template = await fetchTemplate(Number(version.template_id));
    return {
      layout: parseTemplateLayoutDefinition(version.layout_definition, "The selected template version layout is invalid."),
      template,
      version,
      layoutDraft: null
    };
  }

  if (input.template_id) {
    const template = await fetchTemplate(Number(input.template_id));
    if (!template || template.status !== "published" || !template.current_version_id) {
      throw new AppError(422, "invalid_template", "Selected template has no active published version.");
    }
    const version = await fetchTemplateVersion(Number(template.current_version_id));
    if (!version || version.status !== "active") {
      throw new AppError(422, "invalid_template", "Selected template has no active published version.");
    }
    return {
      layout: parseTemplateLayoutDefinition(version.layout_definition, "The selected template layout is invalid."),
      template,
      version,
      layoutDraft: null
    };
  }

  if (options.documentTypeId) {
    const binding = (await findActiveTemplateBindings({
      documentTypeId: options.documentTypeId,
      locale: input.locale,
      variant: input.variant
    }))[0];
    if (!binding) {
      throw new AppError(422, "template_required", "No active published template is bound to this document type.");
    }
    const [template, version] = await Promise.all([
      fetchTemplate(Number(binding.template_id)),
      fetchTemplateVersion(Number(binding.template_version_id))
    ]);
    return {
      layout: parseTemplateLayoutDefinition(binding.layoutDefinition, "The active published template layout is invalid."),
      template,
      version,
      layoutDraft: null
    };
  }

  throw new AppError(422, "template_required", "Select a template, template version, layout draft, or direct layout definition.");
}

type RenderSignatureVisibilityInput = z.infer<typeof renderSchema>["signature_visibility"];

type RenderableLayout = {
  layout: TemplateLayout;
  layoutDraft: RowDataPacket | null;
  template: RowDataPacket | null;
  version: RowDataPacket | null;
};

const lockedOfficialPdfStatuses = new Set(["finalized", "archived", "closed", "serial_assigned"]);

function tokenHash(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

function urlOrigin(value: string) {
  try {
    return new URL(value).origin;
  } catch {
    return "";
  }
}

function localOrigin(value: string) {
  const origin = urlOrigin(value);
  if (!origin) {
    return false;
  }
  const hostname = new URL(origin).hostname.toLowerCase();
  return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1";
}

function requestHeaderOrigin(request: Request) {
  const origin = request.get("origin");
  if (origin) {
    return urlOrigin(origin);
  }
  const referer = request.get("referer");
  if (referer) {
    return urlOrigin(referer);
  }
  const host = request.get("host");
  return host ? urlOrigin(`${request.protocol}://${host}`) : "";
}

export function verificationOriginForRequest(request: Request, configuredOrigin = env.APP_ORIGIN) {
  const configured = urlOrigin(configuredOrigin) || urlOrigin(env.APP_ORIGIN);
  if (configured && !localOrigin(configured)) {
    return configured;
  }

  return requestHeaderOrigin(request) || configured || "http://localhost:5173";
}

export function verificationUrlForToken(token: string, origin: string) {
  return new URL(`/verify/${token}`, origin).toString();
}

export function verificationUrlMatchesOrigin(url: string, origin: string) {
  const expectedOrigin = urlOrigin(origin);
  return Boolean(expectedOrigin && urlOrigin(url) === expectedOrigin);
}

function metadataRecord(value: unknown) {
  return parseJson<Record<string, unknown>>(value, {});
}

async function activePublicVerificationUrl(documentId: number, documentHash: string, origin: string) {
  const [rows] = await pool.execute<RowDataPacket[]>(
    `SELECT *
     FROM document_verification_tokens
     WHERE document_id = ?
       AND verification_scope = 'public_minimal'
       AND status = 'active'
       AND revoked_at IS NULL
       AND (expires_at IS NULL OR expires_at > CURRENT_TIMESTAMP)
     ORDER BY created_at DESC, id DESC
     LIMIT 25`,
    [documentId]
  );

  for (const row of rows) {
    const metadata = metadataRecord(row.metadata);
    const url = typeof metadata.verificationUrl === "string" ? metadata.verificationUrl : "";
    if (
      metadata.documentHash === documentHash
      && metadata.publicRouteEnabled === true
      && url
      && verificationUrlMatchesOrigin(url, origin)
    ) {
      return url;
    }
  }

  return "";
}

async function ensurePublicVerificationForPdf(request: Request, input: {
  assignmentId: number;
  documentHash: string;
  documentId: number;
}) {
  const verificationOrigin = verificationOriginForRequest(request);
  const existingUrl = await activePublicVerificationUrl(input.documentId, input.documentHash, verificationOrigin);
  if (existingUrl) {
    return {
      qrDataUrl: await QRCode.toDataURL(existingUrl, { errorCorrectionLevel: "M", margin: 1, width: 180 }),
      url: existingUrl
    };
  }

  const rawToken = randomBytes(32).toString("hex");
  const verificationUrl = verificationUrlForToken(rawToken, verificationOrigin);
  const [result] = await pool.execute<ResultSetHeader>(
    `INSERT INTO document_verification_tokens (
      uuid, document_id, document_render_id, token_hash, verification_scope,
      status, expires_at, created_by_assignment_id, metadata
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      uuid(),
      input.documentId,
      null,
      tokenHash(rawToken),
      "public_minimal",
      "active",
      null,
      input.assignmentId,
      JSON.stringify({
        documentHash: input.documentHash,
        publicRouteEnabled: true,
        verificationOrigin,
        verificationUrl
      })
    ]
  );
  await writeAuditLog(request, { action: "document.verification_token.create", entityType: "document_verification_token", entityId: result.insertId });

  return {
    qrDataUrl: await QRCode.toDataURL(verificationUrl, { errorCorrectionLevel: "M", margin: 1, width: 180 }),
    url: verificationUrl
  };
}

async function verificationForPdf(request: Request, input: {
  assignmentId: number;
  documentHash: string;
  documentId: number;
  status: string;
  variant: z.infer<typeof variantSchema>;
}) {
  if (input.variant !== "official" || !lockedOfficialPdfStatuses.has(input.status)) {
    return null;
  }

  return ensurePublicVerificationForPdf(request, input);
}

function pdfFilename(documentId: number, document: RowDataPacket) {
  const serial = String(document.official_serial || document.internal_reference || documentId)
    .replace(/[^a-zA-Z0-9_.-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
  return `document-${serial || documentId}.pdf`;
}

function renderSignatureVisibilityRecord(input: RenderSignatureVisibilityInput) {
  const visibility: Record<string, boolean> = {};
  for (const item of input) {
    if (item.signature_event_id) {
      visibility[`event:${item.signature_event_id}`] = item.is_visible;
    }
  }
  return visibility;
}

async function documentRenderContext(documentId: number, signatureVisibility: RenderSignatureVisibilityInput = []) {
  const [documentRows] = await pool.execute<RowDataPacket[]>(
    `SELECT
      documents.*,
      document_types.name AS documentTypeName,
      confidentiality_levels.name AS confidentialityName,
      priority_levels.name AS priorityName,
      origin_units.name AS originUnitName,
      owner_units.name AS ownerUnitName,
      holder_units.name AS currentHolderUnitName
     FROM documents
     INNER JOIN document_types ON documents.document_type_id = document_types.id
     INNER JOIN confidentiality_levels ON documents.confidentiality_level_id = confidentiality_levels.id
     INNER JOIN priority_levels ON documents.priority_level_id = priority_levels.id
     INNER JOIN units AS origin_units ON documents.origin_unit_id = origin_units.id
     INNER JOIN units AS owner_units ON documents.owner_unit_id = owner_units.id
     INNER JOIN units AS holder_units ON documents.current_holder_unit_id = holder_units.id
     WHERE documents.id = ? AND documents.deleted_at IS NULL
     LIMIT 1`,
    [documentId]
  );
  const document = documentRows[0];
  if (!document) {
    throw notFound("Document");
  }

  const [signatureEvents, workflowEvents, serialRows] = await Promise.all([
    signatureEventsWithAssets(documentId),
    pool.execute<RowDataPacket[]>(
      "SELECT * FROM document_workflow_events WHERE document_id = ? ORDER BY created_at DESC",
      [documentId]
    ).then(([rows]) => rows),
    pool.execute<RowDataPacket[]>(
      "SELECT * FROM serial_assignments WHERE document_id = ? LIMIT 1",
      [documentId]
    ).then(([rows]) => rows)
  ]);

  return {
    document,
    signatureVisibility: renderSignatureVisibilityRecord(signatureVisibility),
    signatureEvents,
    workflowEvents,
    serialAssignment: serialRows[0] || null
  };
}

export async function renderOfficialDocumentHtml(documentId: number, options: {
  locale?: z.infer<typeof localeSchema>;
  signatureVisibility?: RenderSignatureVisibilityInput;
  variant?: z.infer<typeof variantSchema>;
} = {}) {
  const signatureVisibility = options.signatureVisibility || [];
  const context = await documentRenderContext(documentId, signatureVisibility);
  const renderInput: z.infer<typeof renderSchema> = {
    layout_draft_id: null,
    locale: options.locale || "all",
    output: "html",
    signature_visibility: signatureVisibility,
    template_id: null,
    template_version_id: null,
    variant: options.variant || "official"
  };
  const renderable = await getRenderableLayout(renderInput, {
    documentId,
    documentTypeId: Number(context.document.document_type_id) || null
  });
  const html = renderTemplateHtml(renderable.layout, context);

  return { context, html, layout_definition: renderable.layout };
}

async function lookupReferenceName(table: string, id: number | null | undefined) {
  if (!id) {
    return null;
  }

  const [rows] = await pool.execute<RowDataPacket[]>(
    `SELECT code, name FROM ${table} WHERE id = ? LIMIT 1`,
    [id]
  );
  return rows[0] || null;
}

async function draftRenderContext(request: Request, input: z.infer<typeof draftPreviewSchema>) {
  const assignment = await getActiveAssignment(request, "previewing a document");
  const [unitRows] = await pool.execute<RowDataPacket[]>(
    `SELECT
      units.name AS unitName,
      units.code AS unitCode,
      organizations.name AS organizationName,
      positions.title AS positionTitle
     FROM assignments
     INNER JOIN positions ON assignments.position_id = positions.id
     INNER JOIN units ON positions.unit_id = units.id
     INNER JOIN organizations ON units.organization_id = organizations.id
     WHERE assignments.id = ?
     LIMIT 1`,
    [assignment.id]
  );
  const assignmentContext = unitRows[0] || {};
  const [documentType, confidentiality, priority] = await Promise.all([
    lookupReferenceName("document_types", input.document_type_id),
    lookupReferenceName("confidentiality_levels", input.confidentiality_level_id),
    lookupReferenceName("priority_levels", input.priority_level_id)
  ]);
  const templateFields = normalizeTemplateFieldRecord(input.template_fields);
  const documentContent = normalizeDocumentContent(input.document_content, {
    body: input.body,
    date: input.document_date || null,
    subject: input.subject || "Draft subject",
    summary: input.summary || null,
    templateFields
  });
  const body = documentContentToPlainText(documentContent) || input.body || "";
  const now = new Date().toISOString();

  return {
    document: {
      id: 0,
      uuid: "draft-preview",
      internal_reference: "DRAFT",
      official_serial: null,
      document_type_id: input.document_type_id || null,
      confidentiality_level_id: input.confidentiality_level_id || null,
      priority_level_id: input.priority_level_id || null,
      document_date: input.document_date || null,
      subject: input.subject?.trim() || "Draft subject",
      summary: input.summary || null,
      body,
      document_content: documentContent,
      template_fields: templateFields,
      status: "draft",
      created_at: now,
      updated_at: now,
      documentTypeName: documentType?.name || "",
      documentTypeCode: documentType?.code || "",
      confidentialityName: confidentiality?.name || "",
      confidentialityCode: confidentiality?.code || "",
      priorityName: priority?.name || "",
      priorityCode: priority?.code || "",
      originUnitName: assignmentContext.unitName || "",
      ownerUnitName: assignmentContext.unitName || "",
      currentHolderUnitName: assignmentContext.unitName || "",
      originUnitCode: assignmentContext.unitCode || "",
      organizationName: assignmentContext.organizationName || "",
      creatorPositionTitle: assignmentContext.positionTitle || ""
    },
    signatureVisibility: {},
    signatureEvents: [],
    workflowEvents: [],
    serialAssignment: null
  };
}

templateRouter.get("/", asyncHandler(async (request, response) => {
  const query = z.object({
    scope: z.enum(["visible", "mine", "published", "submitted"]).default("visible")
  }).parse(request.query);
  const userId = request.session.userId!;
  const where = ["document_templates.deleted_at IS NULL"];
  const params: any[] = [];

  if (query.scope === "mine") {
    where.push("document_templates.owner_user_id = ?");
    params.push(userId);
  } else if (query.scope === "published") {
    where.push("document_templates.status = 'published'");
  } else if (query.scope === "submitted") {
    where.push("(document_templates.owner_user_id = ? OR document_templates.status = 'submitted')");
    params.push(userId);
  } else {
    where.push("(document_templates.owner_user_id = ? OR document_templates.status = 'published')");
    params.push(userId);
  }

  const [rows] = await pool.execute<RowDataPacket[]>(
    `SELECT
      document_templates.*,
      persons.display_name AS ownerDisplayName,
      current_versions.version_number AS currentVersionNumber,
      current_versions.status AS currentVersionStatus
     FROM document_templates
     INNER JOIN users ON document_templates.owner_user_id = users.id
     INNER JOIN persons ON users.person_id = persons.id
     LEFT JOIN document_template_versions AS current_versions ON document_templates.current_version_id = current_versions.id
     WHERE ${where.join(" AND ")}
     ORDER BY document_templates.updated_at DESC, document_templates.id DESC
     LIMIT 250`,
    params
  );
  ok(response, rows);
}));

templateRouter.post("/", asyncHandler(async (request, response) => {
  const input = createTemplateSchema.parse(request.body);
  const assignment = await getActiveAssignment(request, "creating a document template").catch(() => null);
  let templateId = 0;

  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const [templateResult] = await connection.execute<ResultSetHeader>(
      `INSERT INTO document_templates (
        uuid, owner_user_id, owner_assignment_id, name, description,
        status, visibility
      ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        uuid(),
        request.session.userId!,
        assignment?.id || null,
        input.name,
        input.description || null,
        "private_draft",
        "private"
      ]
    );
    templateId = Number(templateResult.insertId);

    await connection.execute<ResultSetHeader>(
      `INSERT INTO document_template_versions (
        uuid, template_id, version_number, status, layout_definition, created_by_user_id
      ) VALUES (?, ?, ?, ?, ?, ?)`,
      [
        uuid(),
        templateId,
        1,
        "draft",
        JSON.stringify(input.layout_definition || defaultTemplateLayout()),
        request.session.userId!
      ]
    );

    await writeAuditLog(request, { action: "template.create", entityType: "document_template", entityId: templateId }, connection);
    await connection.commit();
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }

  created(response, await templatePayload(templateId, request, response));
}));

templateRouter.get("/default", asyncHandler(async (request, response) => {
  const query = z.object({
    document_type_id: z.coerce.number().int().positive().nullable().optional(),
    locale: localeSchema,
    variant: variantSchema
  }).parse(request.query);

  const rows = await findActiveTemplateBindings({
    documentTypeId: query.document_type_id || null,
    locale: query.locale,
    variant: query.variant
  });
  ok(response, rows[0] ? activeBindingPayload(rows[0]) : null);
}));

templateRouter.get("/active", asyncHandler(async (request, response) => {
  const query = activeTemplatesQuerySchema.parse(request.query);
  const rows = await findActiveTemplateBindings({
    documentTypeId: query.document_type_id || null,
    limit: 100,
    locale: query.locale,
    variant: query.variant
  });
  ok(response, rows.map(activeBindingPayload));
}));

templateRouter.post("/assets", asyncHandler(async (request, response) => {
  const input = assetUploadSchema.parse(request.body);
  const assignment = await getActiveAssignment(request, "uploading a template asset").catch(() => null);
  const extension = extensionForMimeType(input.mime_type);
  const buffer = base64ImageBuffer(input.data_base64);
  if (!buffer.length || buffer.length > 2 * 1024 * 1024) {
    throw new AppError(422, "invalid_asset", "Template assets must be valid images up to 2MB.");
  }
  const checksum = createHash("sha256").update(buffer).digest("hex");
  const dir = path.resolve(process.cwd(), "storage/template-assets");
  await fs.mkdir(dir, { recursive: true });
  const storedFilename = `${uuid()}.${extension}`;
  const storagePath = path.join("storage/template-assets", storedFilename);
  await fs.writeFile(path.resolve(process.cwd(), storagePath), buffer);

  const [result] = await pool.execute<ResultSetHeader>(
    `INSERT INTO file_assets (
      uuid, uploaded_by_user_id, uploaded_by_assignment_id, purpose,
      storage_disk, storage_path, original_filename, stored_filename,
      mime_type, byte_size, checksum_sha256, encryption_status, status, metadata
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      uuid(),
      request.session.userId!,
      assignment?.id || null,
      "template_asset",
      "local",
      storagePath,
      input.original_filename,
      storedFilename,
      input.mime_type,
      buffer.length,
      checksum,
      "not_encrypted",
      "active",
      JSON.stringify({})
    ]
  );

  await writeAuditLog(request, { action: "template.asset.upload", entityType: "file_asset", entityId: result.insertId });
  created(response, {
    id: Number(result.insertId),
    storage_path: storagePath,
    data_url: `data:${input.mime_type};base64,${buffer.toString("base64")}`
  });
}));

templateRouter.post("/preview", asyncHandler(async (request, response) => {
  const input = draftPreviewSchema.parse(request.body);
  const renderable = await getRenderableLayout({
    layout_draft_id: null,
    layout_definition: input.layout_definition,
    locale: input.locale,
    output: "html",
    signature_visibility: [],
    template_id: input.template_id || null,
    template_version_id: input.template_version_id || null,
    variant: input.variant
  });
  if (!renderable.template && !input.layout_definition) {
    throw new AppError(422, "invalid_template", "Selected template is not available.");
  }
  if (renderable.template) {
    await assertTemplateReadable(Number(renderable.template.id), request, response);
  }
  const context = await draftRenderContext(request, input);
  const html = renderTemplateHtml(renderable.layout, context);
  ok(response, { html, layout_definition: renderable.layout });
}));

templateRouter.get("/:templateId", asyncHandler(async (request, response) => {
  const { templateId } = templateIdSchema.parse(request.params);
  ok(response, await templatePayload(templateId, request, response));
}));

templateRouter.patch("/:templateId", asyncHandler(async (request, response) => {
  const { templateId } = templateIdSchema.parse(request.params);
  const input = updateTemplateSchema.parse(request.body);
  const template = await assertTemplateEditable(templateId, request, response);
  const latest = await fetchLatestTemplateVersion(templateId);
  if (latest?.status === "submitted") {
    throw new AppError(409, "template_submitted", "Submitted templates are locked until review.");
  }

  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    if (input.name !== undefined || input.description !== undefined) {
      await connection.execute<ResultSetHeader>(
        `UPDATE document_templates
         SET name = COALESCE(?, name),
             description = ?,
             status = CASE WHEN status = 'published' THEN status ELSE 'private_draft' END,
             visibility = CASE WHEN status = 'published' THEN visibility ELSE 'private' END,
             updated_at = CURRENT_TIMESTAMP
         WHERE id = ?`,
        [input.name || null, input.description === undefined ? template.description : input.description, templateId]
      );
    }

    if (input.layout_definition) {
      if (latest && ["draft", "rejected"].includes(String(latest.status))) {
        await connection.execute<ResultSetHeader>(
          `UPDATE document_template_versions
           SET layout_definition = ?, status = 'draft', review_note = NULL, updated_at = CURRENT_TIMESTAMP
           WHERE id = ?`,
          [JSON.stringify(input.layout_definition), latest.id]
        );
      } else {
        const nextVersion = Number(latest?.version_number || 0) + 1;
        await connection.execute<ResultSetHeader>(
          `INSERT INTO document_template_versions (
            uuid, template_id, version_number, status, layout_definition, created_by_user_id
          ) VALUES (?, ?, ?, ?, ?, ?)`,
          [uuid(), templateId, nextVersion, "draft", JSON.stringify(input.layout_definition), request.session.userId!]
        );
      }
    }

    await writeAuditLog(request, { action: "template.update", entityType: "document_template", entityId: templateId }, connection);
    await connection.commit();
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }

  ok(response, await templatePayload(templateId, request, response));
}));

templateRouter.delete("/:templateId", asyncHandler(async (request, response) => {
  const { templateId } = templateIdSchema.parse(request.params);
  const template = await assertTemplateEditable(templateId, request, response);
  if (template.status === "published" || template.current_version_id) {
    throw new AppError(409, "template_archive_required", "Published templates cannot be deleted. Archive them instead.");
  }

  await pool.execute<ResultSetHeader>(
    "UPDATE document_templates SET deleted_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
    [templateId]
  );
  await writeAuditLog(request, { action: "template.delete", entityType: "document_template", entityId: templateId });
  ok(response, { deleted: true });
}));

templateRouter.post("/:templateId/submit", asyncHandler(async (request, response) => {
  const { templateId } = templateIdSchema.parse(request.params);
  await assertTemplateEditable(templateId, request, response);
  const latest = await fetchLatestTemplateVersion(templateId);
  if (!latest || !["draft", "rejected"].includes(String(latest.status))) {
    throw new AppError(409, "template_not_submittable", "Only draft or rejected template versions can be submitted.");
  }

  await pool.execute<ResultSetHeader>(
    `UPDATE document_template_versions
     SET status = 'submitted', submitted_at = CURRENT_TIMESTAMP, submitted_by_user_id = ?, updated_at = CURRENT_TIMESTAMP
     WHERE id = ?`,
    [request.session.userId!, latest.id]
  );
  await pool.execute<ResultSetHeader>(
    "UPDATE document_templates SET status = 'submitted', updated_at = CURRENT_TIMESTAMP WHERE id = ?",
    [templateId]
  );
  await writeAuditLog(request, { action: "template.submit", entityType: "document_template", entityId: templateId, metadata: { versionId: latest.id } });
  ok(response, await templatePayload(templateId, request, response));
}));

templateRouter.post("/:templateId/clone", asyncHandler(async (request, response) => {
  const { templateId } = templateIdSchema.parse(request.params);
  const template = await assertTemplateReadable(templateId, request, response);
  const version = template.current_version_id
    ? await fetchTemplateVersion(Number(template.current_version_id))
    : await fetchLatestTemplateVersion(templateId);
  if (!version) {
    throw new AppError(422, "template_has_no_version", "Template has no version to clone.");
  }

  const assignment = await getActiveAssignment(request, "cloning a template").catch(() => null);
  let clonedTemplateId = 0;
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const [templateResult] = await connection.execute<ResultSetHeader>(
      `INSERT INTO document_templates (
        uuid, owner_user_id, owner_assignment_id, name, description, status, visibility
      ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        uuid(),
        request.session.userId!,
        assignment?.id || null,
        `${template.name} Copy`,
        template.description || null,
        "private_draft",
        "private"
      ]
    );
    clonedTemplateId = Number(templateResult.insertId);
    await connection.execute<ResultSetHeader>(
      `INSERT INTO document_template_versions (
        uuid, template_id, version_number, status, layout_definition, created_by_user_id
      ) VALUES (?, ?, ?, ?, ?, ?)`,
      [uuid(), clonedTemplateId, 1, "draft", JSON.stringify(parseJson(version.layout_definition, defaultTemplateLayout())), request.session.userId!]
    );
    await writeAuditLog(request, { action: "template.clone", entityType: "document_template", entityId: clonedTemplateId, metadata: { sourceTemplateId: templateId } }, connection);
    await connection.commit();
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }

  created(response, await templatePayload(clonedTemplateId, request, response));
}));

templateRouter.get("/documents/:documentId/layout-draft", asyncHandler(async (request, response) => {
  const { documentId } = documentIdSchema.parse(request.params);
  await assertDocumentAccess(documentId, request, response);
  const [rows] = await pool.execute<RowDataPacket[]>(
    `SELECT *
     FROM document_layout_drafts
     WHERE document_id = ? AND owner_user_id = ? AND deleted_at IS NULL
     LIMIT 1`,
    [documentId, request.session.userId!]
  );
  const row = rows[0];
  ok(response, row ? { ...row, layout_definition: parseJson(row.layout_definition, defaultTemplateLayout()) } : null);
}));

templateRouter.put("/documents/:documentId/layout-draft", asyncHandler(async (request, response) => {
  const { documentId } = documentIdSchema.parse(request.params);
  const input = z.object({
    base_template_version_id: z.coerce.number().int().positive().nullable().optional(),
    layout_definition: layoutSchema
  }).parse(request.body);
  const { assignment } = await assertDocumentAccess(documentId, request, response);
  const [existingRows] = await pool.execute<RowDataPacket[]>(
    "SELECT id FROM document_layout_drafts WHERE document_id = ? AND owner_user_id = ? AND deleted_at IS NULL LIMIT 1",
    [documentId, request.session.userId!]
  );
  const existing = existingRows[0];

  if (existing) {
    await pool.execute<ResultSetHeader>(
      `UPDATE document_layout_drafts
       SET base_template_version_id = ?, layout_definition = ?, updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [input.base_template_version_id || null, JSON.stringify(input.layout_definition), existing.id]
    );
  } else {
    await pool.execute<ResultSetHeader>(
      `INSERT INTO document_layout_drafts (
        uuid, document_id, owner_user_id, owner_assignment_id, base_template_version_id, layout_definition
      ) VALUES (?, ?, ?, ?, ?, ?)`,
      [uuid(), documentId, request.session.userId!, assignment.id, input.base_template_version_id || null, JSON.stringify(input.layout_definition)]
    );
  }
  await writeAuditLog(request, { action: "document.layout_draft.save", entityType: "document", entityId: documentId });
  const [rows] = await pool.execute<RowDataPacket[]>(
    "SELECT * FROM document_layout_drafts WHERE document_id = ? AND owner_user_id = ? AND deleted_at IS NULL LIMIT 1",
    [documentId, request.session.userId!]
  );
  ok(response, { ...rows[0], layout_definition: parseJson(rows[0].layout_definition, defaultTemplateLayout()) });
}));

templateRouter.post("/documents/:documentId/pdf", asyncHandler(async (request, response) => {
  const { documentId } = documentIdSchema.parse(request.params);
  const input = pdfRenderSchema.parse(request.body);
  const { assignment } = await assertDocumentAccess(documentId, request, response);
  const signatureVisibility = input.signature_visibility || [];
  const context = await documentRenderContext(documentId, signatureVisibility);
  const renderInput: z.infer<typeof renderSchema> = {
    layout_definition: input.layout_definition,
    layout_draft_id: input.layout_draft_id || null,
    locale: input.locale,
    output: "pdf",
    signature_visibility: signatureVisibility,
    template_id: input.template_id || null,
    template_version_id: input.template_version_id || null,
    variant: input.variant
  };
  const renderable = await getRenderableLayout(renderInput, {
    documentId,
    documentTypeId: Number(context.document.document_type_id) || null
  }) as RenderableLayout;
  const documentHash = calculateDocumentContentHash(context.document);
  const verification = await verificationForPdf(request, {
    assignmentId: assignment.id,
    documentHash,
    documentId,
    status: String(context.document.status || "draft"),
    variant: input.variant
  });
  const html = renderTemplateHtml(renderable.layout, { ...context, verification });
  const pdfBuffer = await renderHtmlToPdf(html);
  const filename = pdfFilename(documentId, context.document);
  const disposition = input.download ? "attachment" : "inline";

  response.setHeader("content-type", "application/pdf");
  response.setHeader("content-length", String(pdfBuffer.length));
  response.setHeader("content-disposition", `${disposition}; filename="${filename.replaceAll("\"", "")}"`);
  response.send(pdfBuffer);
}));

templateRouter.post("/documents/:documentId/render", asyncHandler(async (request, response) => {
  const { documentId } = documentIdSchema.parse(request.params);
  const input = renderSchema.parse(request.body);
  await assertDocumentAccess(documentId, request, response);
  if (input.output === "pdf") {
    throw new AppError(410, "pdf_render_endpoint_changed", "Use the document PDF endpoint for PDF output.");
  }

  const context = await documentRenderContext(documentId, input.signature_visibility);
  const renderable = await getRenderableLayout(input, {
    documentId,
    documentTypeId: Number(context.document.document_type_id) || null
  });
  const html = renderTemplateHtml(renderable.layout, context);

  ok(response, { html, layout_definition: renderable.layout });
}));

adminTemplateRouter.get("/", asyncHandler(async (_request, response) => {
  const [rows] = await pool.execute<RowDataPacket[]>(
    `SELECT
      document_templates.*,
      persons.display_name AS ownerDisplayName,
      current_versions.version_number AS currentVersionNumber,
      current_versions.status AS currentVersionStatus
     FROM document_templates
     INNER JOIN users ON document_templates.owner_user_id = users.id
     INNER JOIN persons ON users.person_id = persons.id
     LEFT JOIN document_template_versions AS current_versions ON document_templates.current_version_id = current_versions.id
     WHERE document_templates.deleted_at IS NULL
     ORDER BY document_templates.updated_at DESC, document_templates.id DESC
     LIMIT 500`
  );
  ok(response, rows);
}));

adminTemplateRouter.get("/review-queue", asyncHandler(async (_request, response) => {
  const [rows] = await pool.execute<RowDataPacket[]>(
    `SELECT
      document_template_versions.*,
      document_templates.name AS templateName,
      persons.display_name AS ownerDisplayName
     FROM document_template_versions
     INNER JOIN document_templates ON document_template_versions.template_id = document_templates.id
     INNER JOIN users ON document_templates.owner_user_id = users.id
     INNER JOIN persons ON users.person_id = persons.id
     WHERE document_template_versions.status = 'submitted'
       AND document_templates.deleted_at IS NULL
     ORDER BY document_template_versions.submitted_at ASC, document_template_versions.id ASC`
  );
  ok(response, rows.map((row) => ({ ...row, layout_definition: parseJson(row.layout_definition, defaultTemplateLayout()) })));
}));

adminTemplateRouter.get("/logo-assets", asyncHandler(async (_request, response) => {
  const [rows] = await pool.execute<RowDataPacket[]>(
    `SELECT id, storage_path, original_filename, mime_type, byte_size, created_at
     FROM file_assets
     WHERE purpose = ?
       AND status = 'active'
       AND deleted_at IS NULL
     ORDER BY created_at DESC, id DESC
     LIMIT ${maxTemplateLogoAssets}`,
    [templateLogoPurpose]
  );
  ok(response, rows.map(logoAssetPayload));
}));

adminTemplateRouter.post("/logo-assets", asyncHandler(async (request, response) => {
  const input = assetUploadSchema.parse(request.body);
  const [[countRow]] = await pool.execute<RowDataPacket[]>(
    "SELECT COUNT(*) AS activeCount FROM file_assets WHERE purpose = ? AND status = 'active' AND deleted_at IS NULL",
    [templateLogoPurpose]
  );
  if (Number(countRow?.activeCount || 0) >= maxTemplateLogoAssets) {
    throw new AppError(409, "template_logo_limit_reached", `Only ${maxTemplateLogoAssets} active template logos are allowed.`);
  }

  const assignment = await getActiveAssignment(request, "uploading a template logo").catch(() => null);
  const buffer = base64ImageBuffer(input.data_base64);
  if (!buffer.length || buffer.length > 2 * 1024 * 1024) {
    throw new AppError(422, "invalid_asset", "Template logos must be valid images up to 2MB.");
  }

  const extension = extensionForMimeType(input.mime_type);
  const checksum = createHash("sha256").update(buffer).digest("hex");
  const dir = path.resolve(process.cwd(), "storage/template-assets");
  await fs.mkdir(dir, { recursive: true });
  const storedFilename = `${uuid()}.${extension}`;
  const storagePath = path.join("storage/template-assets", storedFilename);
  await fs.writeFile(path.resolve(process.cwd(), storagePath), buffer);

  const [result] = await pool.execute<ResultSetHeader>(
    `INSERT INTO file_assets (
      uuid, uploaded_by_user_id, uploaded_by_assignment_id, purpose,
      storage_disk, storage_path, original_filename, stored_filename,
      mime_type, byte_size, checksum_sha256, encryption_status, status, metadata
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      uuid(),
      request.session.userId!,
      assignment?.id || null,
      templateLogoPurpose,
      "local",
      storagePath,
      input.original_filename,
      storedFilename,
      input.mime_type,
      buffer.length,
      checksum,
      "not_encrypted",
      "active",
      JSON.stringify({ assetType: "official_logo" })
    ]
  );

  const payload = logoAssetPayload({
    id: Number(result.insertId),
    storage_path: storagePath,
    original_filename: input.original_filename,
    mime_type: input.mime_type,
    byte_size: buffer.length,
    created_at: new Date().toISOString()
  } as RowDataPacket);

  await writeAuditLog(request, { action: "template.logo.upload", entityType: "file_asset", entityId: result.insertId });
  created(response, payload);
}));

adminTemplateRouter.get("/logo-assets/:assetId/content", asyncHandler(async (request, response) => {
  const { assetId } = assetIdSchema.parse(request.params);
  const [rows] = await pool.execute<RowDataPacket[]>(
    `SELECT *
     FROM file_assets
     WHERE id = ?
       AND purpose = ?
       AND status IN ('active', 'archived')
       AND deleted_at IS NULL
     LIMIT 1`,
    [assetId, templateLogoPurpose]
  );
  const asset = rows[0];
  if (!asset) {
    throw notFound("Logo asset");
  }

  const absolutePath = templateAssetAbsolutePath(String(asset.storage_path));
  await fs.access(absolutePath).catch(() => {
    throw notFound("Logo file");
  });
  response.setHeader("content-type", String(asset.mime_type));
  response.setHeader("cache-control", "private, max-age=3600");
  response.sendFile(absolutePath);
}));

adminTemplateRouter.delete("/logo-assets/:assetId", asyncHandler(async (request, response) => {
  const { assetId } = assetIdSchema.parse(request.params);
  const [result] = await pool.execute<ResultSetHeader>(
    `UPDATE file_assets
     SET status = 'archived', updated_at = CURRENT_TIMESTAMP
     WHERE id = ?
       AND purpose = ?
       AND status = 'active'
       AND deleted_at IS NULL`,
    [assetId, templateLogoPurpose]
  );
  if (!result.affectedRows) {
    throw notFound("Logo asset");
  }

  await writeAuditLog(request, { action: "template.logo.archive", entityType: "file_asset", entityId: assetId });
  ok(response, { id: assetId, status: "archived" });
}));

adminTemplateRouter.post("/:templateId/versions/:versionId/approve", asyncHandler(async (request, response) => {
  const { templateId, versionId } = versionIdSchema.parse(request.params);
  const version = await fetchTemplateVersion(versionId);
  if (!version || Number(version.template_id) !== templateId || version.status !== "submitted") {
    throw new AppError(422, "invalid_submitted_version", "Only submitted versions can be approved.");
  }

  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    await connection.execute<ResultSetHeader>(
      "UPDATE document_template_versions SET status = 'archived', updated_at = CURRENT_TIMESTAMP WHERE template_id = ? AND status = 'active'",
      [templateId]
    );
    await connection.execute<ResultSetHeader>(
      `UPDATE document_template_versions
       SET status = 'active', reviewed_at = CURRENT_TIMESTAMP, reviewed_by_user_id = ?, review_note = NULL, updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [request.session.userId!, versionId]
    );
    await connection.execute<ResultSetHeader>(
      `UPDATE document_templates
       SET status = 'published', visibility = 'public', current_version_id = ?, updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [versionId, templateId]
    );
    await connection.execute<ResultSetHeader>(
      `UPDATE document_template_bindings
       SET template_version_id = ?, updated_at = CURRENT_TIMESTAMP
       WHERE template_id = ?
         AND status = 'active'`,
      [versionId, templateId]
    );
    await writeAuditLog(request, { action: "template.approve", entityType: "document_template", entityId: templateId, metadata: { versionId } }, connection);
    await connection.commit();
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
  ok(response, await templatePayload(templateId, request, response));
}));

adminTemplateRouter.post("/:templateId/versions/:versionId/reject", asyncHandler(async (request, response) => {
  const { templateId, versionId } = versionIdSchema.parse(request.params);
  const input = rejectSchema.parse(request.body);
  const version = await fetchTemplateVersion(versionId);
  if (!version || Number(version.template_id) !== templateId || version.status !== "submitted") {
    throw new AppError(422, "invalid_submitted_version", "Only submitted versions can be rejected.");
  }

  await pool.execute<ResultSetHeader>(
    `UPDATE document_template_versions
     SET status = 'rejected', reviewed_at = CURRENT_TIMESTAMP, reviewed_by_user_id = ?, review_note = ?, updated_at = CURRENT_TIMESTAMP
     WHERE id = ?`,
    [request.session.userId!, input.review_note, versionId]
  );
  await pool.execute<ResultSetHeader>(
    "UPDATE document_templates SET status = CASE WHEN current_version_id IS NULL THEN 'private_draft' ELSE status END, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
    [templateId]
  );
  await writeAuditLog(request, { action: "template.reject", entityType: "document_template", entityId: templateId, metadata: { versionId } });
  ok(response, await templatePayload(templateId, request, response));
}));

adminTemplateRouter.post("/:templateId/archive", asyncHandler(async (request, response) => {
  const { templateId } = templateIdSchema.parse(request.params);
  const template = await fetchTemplate(templateId);
  if (!template) {
    throw notFound("Template");
  }
  await pool.execute<ResultSetHeader>(
    "UPDATE document_templates SET status = 'archived', visibility = 'private', updated_at = CURRENT_TIMESTAMP WHERE id = ?",
    [templateId]
  );
  await pool.execute<ResultSetHeader>(
    "UPDATE document_template_bindings SET status = 'inactive', updated_at = CURRENT_TIMESTAMP WHERE template_id = ?",
    [templateId]
  );
  await writeAuditLog(request, { action: "template.archive", entityType: "document_template", entityId: templateId });
  ok(response, await templatePayload(templateId, request, response));
}));

adminTemplateRouter.get("/bindings", asyncHandler(async (_request, response) => {
  const [rows] = await pool.execute<RowDataPacket[]>(
    `SELECT
      document_template_bindings.*,
      document_types.name AS documentTypeName,
      document_templates.name AS templateName,
      document_template_versions.version_number AS templateVersionNumber
     FROM document_template_bindings
     LEFT JOIN document_types ON document_template_bindings.document_type_id = document_types.id
     INNER JOIN document_templates ON document_template_bindings.template_id = document_templates.id
     INNER JOIN document_template_versions ON document_template_bindings.template_version_id = document_template_versions.id
     ORDER BY document_template_bindings.id DESC
     LIMIT 250`
  );
  ok(response, rows);
}));

adminTemplateRouter.post("/bindings", asyncHandler(async (request, response) => {
  const input = bindingSchema.parse(request.body);
  const template = await fetchTemplate(input.template_id);
  const versionId = input.template_version_id || template?.current_version_id;
  const version = versionId ? await fetchTemplateVersion(Number(versionId)) : null;
  if (!template || template.status !== "published" || !version || version.status !== "active") {
    throw new AppError(422, "invalid_published_template", "Bindings require an active published template version.");
  }

  const documentTypeId = input.document_type_id || null;
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    await connection.execute<ResultSetHeader>(
      `UPDATE document_template_bindings
       SET status = 'inactive', updated_at = CURRENT_TIMESTAMP
       WHERE status = 'active'
         AND document_type_id <=> ?
         AND locale = ?
         AND variant = ?`,
      [documentTypeId, input.locale, input.variant]
    );

    const [result] = await connection.execute<ResultSetHeader>(
      `INSERT INTO document_template_bindings (
        uuid, document_type_id, locale, variant, template_id, template_version_id, status, created_by_user_id
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [uuid(), documentTypeId, input.locale, input.variant, input.template_id, Number(versionId), "active", request.session.userId!]
    );
    await writeAuditLog(request, { action: "template.binding.create", entityType: "document_template_binding", entityId: result.insertId }, connection);
    await connection.commit();
    created(response, { id: Number(result.insertId) });
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}));

adminTemplateRouter.patch("/bindings/:bindingId", asyncHandler(async (request, response) => {
  const { bindingId } = bindingIdSchema.parse(request.params);
  const input = z.object({ status: z.enum(["active", "inactive"]) }).parse(request.body);
  await pool.execute<ResultSetHeader>(
    "UPDATE document_template_bindings SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
    [input.status, bindingId]
  );
  await writeAuditLog(request, { action: "template.binding.status", entityType: "document_template_binding", entityId: bindingId, metadata: { status: input.status } });
  ok(response, { id: bindingId, status: input.status });
}));

adminTemplateRouter.delete("/bindings/:bindingId", asyncHandler(async (request, response) => {
  const { bindingId } = bindingIdSchema.parse(request.params);
  await pool.execute<ResultSetHeader>(
    "UPDATE document_template_bindings SET status = 'inactive', updated_at = CURRENT_TIMESTAMP WHERE id = ?",
    [bindingId]
  );
  await writeAuditLog(request, { action: "template.binding.delete", entityType: "document_template_binding", entityId: bindingId });
  ok(response, { id: bindingId, status: "inactive" });
}));
