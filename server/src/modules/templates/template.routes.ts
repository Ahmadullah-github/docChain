import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import puppeteer from "puppeteer";
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
import { AppError, forbidden, notFound } from "../../shared/errors";
import { created, ok } from "../../shared/http";
import { uuid } from "../../shared/ids";
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
const optionalNullableString = z.string().trim().min(1).nullable().optional();
const localeSchema = z.enum(["all", "en", "fa-AF", "ps-AF"]).default("all");
const variantSchema = z.enum(["official", "internal", "archive", "routing_sheet"]).default("official");
const layoutSchema = z.record(z.string(), z.unknown()).default(defaultTemplateLayout);

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
  output: z.enum(["html", "pdf"]).default("pdf")
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

function chromeExecutablePath() {
  const candidates = [
    process.env.PUPPETEER_EXECUTABLE_PATH,
    "/opt/google/chrome/chrome",
    "/usr/bin/google-chrome",
    "/usr/bin/google-chrome-stable",
    "/usr/bin/chromium",
    "/usr/bin/chromium-browser"
  ].filter(Boolean) as string[];

  return candidates.find((candidate) => {
    try {
      return require("node:fs").existsSync(candidate);
    } catch {
      return false;
    }
  });
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

async function getRenderableLayout(input: z.infer<typeof renderSchema>) {
  if (input.layout_definition) {
    return { layout: input.layout_definition as TemplateLayout, template: null, version: null, layoutDraft: null };
  }

  if (input.layout_draft_id) {
    const [rows] = await pool.execute<RowDataPacket[]>(
      "SELECT * FROM document_layout_drafts WHERE id = ? AND deleted_at IS NULL LIMIT 1",
      [input.layout_draft_id]
    );
    const layoutDraft = rows[0];
    if (!layoutDraft) {
      throw notFound("Layout draft");
    }
    return { layout: parseJson(layoutDraft.layout_definition, defaultTemplateLayout()), template: null, version: null, layoutDraft };
  }

  const versionId = input.template_version_id;
  if (versionId) {
    const version = await fetchTemplateVersion(versionId);
    if (!version || version.status !== "active") {
      throw new AppError(422, "invalid_template_version", "Selected template version is not active.");
    }
    const template = await fetchTemplate(Number(version.template_id));
    return { layout: parseJson(version.layout_definition, defaultTemplateLayout()), template, version, layoutDraft: null };
  }

  if (input.template_id) {
    const template = await fetchTemplate(Number(input.template_id));
    if (!template || !template.current_version_id) {
      throw new AppError(422, "invalid_template", "Selected template has no active published version.");
    }
    const version = await fetchTemplateVersion(Number(template.current_version_id));
    return { layout: parseJson(version?.layout_definition, defaultTemplateLayout()), template, version, layoutDraft: null };
  }

  throw new AppError(422, "template_required", "Select a template, template version, layout draft, or direct layout definition.");
}

async function documentRenderContext(documentId: number) {
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

  const [signatureEvents, signatureSlots, workflowEvents, serialRows] = await Promise.all([
    pool.execute<RowDataPacket[]>(
      `SELECT signature_events.*, positions.title AS signerPositionTitle, units.name AS signerUnitName
       FROM signature_events
       INNER JOIN assignments ON signature_events.assignment_id = assignments.id
       INNER JOIN positions ON assignments.position_id = positions.id
       INNER JOIN units ON assignments.unit_id = units.id
       WHERE signature_events.document_id = ?
       ORDER BY signature_events.created_at DESC`,
      [documentId]
    ).then(([rows]) => rows),
    pool.execute<RowDataPacket[]>(
      `SELECT signature_slots.*, positions.title AS requiredPositionTitle, units.name AS targetUnitName
       FROM signature_slots
       INNER JOIN positions ON signature_slots.required_position_id = positions.id
       LEFT JOIN units ON signature_slots.target_unit_id = units.id
       WHERE signature_slots.document_id = ?
       ORDER BY signature_slots.step_number ASC, signature_slots.id ASC`,
      [documentId]
    ).then(([rows]) => rows),
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
    signatureEvents,
    signatureSlots,
    workflowEvents,
    serialAssignment: serialRows[0] || null
  };
}

async function htmlToPdf(html: string) {
  const executablePath = chromeExecutablePath();
  const browser = await puppeteer.launch({
    executablePath,
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
    headless: true
  });
  try {
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: "networkidle0" });
    return Buffer.from(await page.pdf({
      format: "A4",
      printBackground: true,
      margin: { top: "0mm", right: "0mm", bottom: "0mm", left: "0mm" }
    }));
  } finally {
    await browser.close();
  }
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

  const params: any[] = [
    query.document_type_id || null,
    query.document_type_id || null,
    query.locale,
    query.locale,
    query.variant
  ];
  const [rows] = await pool.execute<RowDataPacket[]>(
    `SELECT
      document_template_bindings.*,
      document_templates.name AS templateName,
      document_template_versions.layout_definition AS layoutDefinition
     FROM document_template_bindings
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
     LIMIT 1`,
    params
  );
  ok(response, rows[0] || null);
}));

templateRouter.post("/assets", asyncHandler(async (request, response) => {
  const input = assetUploadSchema.parse(request.body);
  const assignment = await getActiveAssignment(request, "uploading a template asset").catch(() => null);
  const extension = input.mime_type === "image/png" ? "png"
    : input.mime_type === "image/webp" ? "webp"
      : input.mime_type === "image/svg+xml" ? "svg"
        : "jpg";
  const buffer = Buffer.from(input.data_base64.replace(/^data:[^;]+;base64,/, ""), "base64");
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

templateRouter.post("/documents/:documentId/render", asyncHandler(async (request, response) => {
  const { documentId } = documentIdSchema.parse(request.params);
  const input = renderSchema.parse(request.body);
  const { assignment } = await assertDocumentAccess(documentId, request, response);
  const renderable = await getRenderableLayout(input);
  const context = await documentRenderContext(documentId);
  const html = renderTemplateHtml(renderable.layout, context);

  if (input.output === "html") {
    ok(response, { html, layout_definition: renderable.layout });
    return;
  }

  const pdfBuffer = await htmlToPdf(html);
  const rendersDir = path.resolve(process.cwd(), "storage/document-renders");
  await fs.mkdir(rendersDir, { recursive: true });
  const pdfFilename = `${uuid()}.pdf`;
  const storagePath = path.join("storage/document-renders", pdfFilename);
  await fs.writeFile(path.resolve(process.cwd(), storagePath), pdfBuffer);
  const checksum = createHash("sha256").update(pdfBuffer).digest("hex");

  let renderId = 0;
  let fileAssetId = 0;
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const [assetResult] = await connection.execute<ResultSetHeader>(
      `INSERT INTO file_assets (
        uuid, uploaded_by_user_id, uploaded_by_assignment_id, purpose,
        storage_disk, storage_path, original_filename, stored_filename,
        mime_type, byte_size, checksum_sha256, encryption_status, status, metadata
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        uuid(),
        request.session.userId!,
        assignment.id,
        "document_render_pdf",
        "local",
        storagePath,
        `document-${documentId}.pdf`,
        pdfFilename,
        "application/pdf",
        pdfBuffer.length,
        checksum,
        "not_encrypted",
        "active",
        JSON.stringify({ templateId: renderable.template?.id || null })
      ]
    );
    fileAssetId = Number(assetResult.insertId);

    const [renderResult] = await connection.execute<ResultSetHeader>(
      `INSERT INTO document_renders (
        uuid, document_id, file_asset_id, render_key, render_type,
        visibility_policy, status, created_by_assignment_id, render_definition, metadata
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        uuid(),
        documentId,
        fileAssetId,
        `template_render_${uuid()}`,
        "template_pdf",
        input.variant,
        "generated",
        assignment.id,
        JSON.stringify(renderable.layout),
        JSON.stringify({
          templateId: renderable.template?.id || null,
          templateVersionId: renderable.version?.id || null,
          layoutDraftId: renderable.layoutDraft?.id || null,
          locale: input.locale,
          variant: input.variant
        })
      ]
    );
    renderId = Number(renderResult.insertId);
    await writeAuditLog(request, { action: "document.template_render.create", entityType: "document_render", entityId: renderId }, connection);
    await connection.commit();
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }

  created(response, { renderId, fileAssetId, storagePath, byteSize: pdfBuffer.length });
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

  await pool.execute<ResultSetHeader>(
    `UPDATE document_template_bindings
     SET status = 'inactive', updated_at = CURRENT_TIMESTAMP
     WHERE status = 'active'
       AND document_type_id <=> ?
       AND locale = ?
       AND variant = ?`,
    [input.document_type_id || null, input.locale, input.variant]
  );
  const [result] = await pool.execute<ResultSetHeader>(
    `INSERT INTO document_template_bindings (
      uuid, document_type_id, locale, variant, template_id, template_version_id, status, created_by_user_id
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [uuid(), input.document_type_id || null, input.locale, input.variant, input.template_id, Number(versionId), "active", request.session.userId!]
  );
  await writeAuditLog(request, { action: "template.binding.create", entityType: "document_template_binding", entityId: result.insertId });
  created(response, { id: Number(result.insertId) });
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
