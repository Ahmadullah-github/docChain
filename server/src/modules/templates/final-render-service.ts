import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import QRCode from "qrcode";
import puppeteer from "puppeteer";
import type { Request } from "express";
import type { ResultSetHeader, RowDataPacket } from "mysql2/promise";
import { env } from "../../config/env";
import { pool } from "../../db/mysql";
import { writeAuditLog } from "../../shared/audit";
import { AppError, notFound } from "../../shared/errors";
import { uuid } from "../../shared/ids";
import { decryptSignatureFile } from "../signatures/signature-assets";
import { renderTemplateHtml, type TemplateLayout } from "./template-renderer";

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

function parseTemplateLayoutDefinition(value: unknown, message: string) {
  const layout = parseJson<TemplateLayout | null>(value, null);
  if (!isRecord(layout) || !isRecord(layout.page)) {
    throw new AppError(422, "invalid_template_layout", message);
  }

  const isWordTemplate = layout.mode === "word_template" || layout.schemaVersion === 2;
  if (!Array.isArray(layout.blocks) && !(isWordTemplate && isRecord(layout.document))) {
    throw new AppError(422, "invalid_template_layout", message);
  }

  return layout;
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

function verificationUrlForToken(token: string) {
  return new URL(`/verify/${token}`, env.APP_ORIGIN).toString();
}

function tokenHash(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

function layoutWithFinalQrBlock(layout: TemplateLayout): TemplateLayout {
  const blocks = Array.isArray(layout.blocks) ? layout.blocks : [];
  if (blocks.some((block) => block.type === "qr")) {
    return layout;
  }

  return {
    ...layout,
    blocks: [
      ...blocks,
      {
        id: "docchain-final-verification",
        type: "qr",
        x: 16,
        y: 238,
        width: 72,
        height: 28,
        pageScope: "last",
        style: { borderWidth: 0, fontSize: 7, textAlign: "start" }
      }
    ]
  };
}

async function layoutForFinalRender(documentTypeId: number) {
  const [rows] = await pool.execute<RowDataPacket[]>(
    `SELECT document_template_versions.layout_definition AS layoutDefinition
     FROM document_template_bindings
     INNER JOIN document_templates ON document_template_bindings.template_id = document_templates.id
     INNER JOIN document_template_versions ON document_template_bindings.template_version_id = document_template_versions.id
     WHERE document_template_bindings.status = 'active'
       AND document_templates.status = 'published'
       AND document_template_versions.status = 'active'
       AND (document_template_bindings.document_type_id = ? OR document_template_bindings.document_type_id IS NULL)
       AND document_template_bindings.variant = 'official'
     ORDER BY document_template_bindings.document_type_id IS NULL ASC, document_template_bindings.id DESC
     LIMIT 1`,
    [documentTypeId]
  );

  if (!rows[0]) {
    throw new AppError(422, "template_required", "No active published template is bound to this document type.");
  }

  return layoutWithFinalQrBlock(parseTemplateLayoutDefinition(rows[0].layoutDefinition, "The active published template layout is invalid."));
}

async function endorsementTasks(documentId: number) {
  const [rows] = await pool.execute<RowDataPacket[]>(
    `SELECT
      document_tasks.id AS documentTaskId,
      document_tasks.required_action AS requiredAction,
      document_tasks.requires_comment AS requiresComment,
      document_tasks.response_note AS responseNote,
      document_tasks.completed_at AS completedAt,
      document_tasks.updated_at AS updatedAt,
      document_tasks.created_at AS createdAt,
      requested_positions.title AS requestedPositionTitle,
      requested_units.name AS requestedUnitName,
      responder_persons.display_name AS responderName,
      responder_positions.title AS responderPositionTitle,
      responder_units.name AS responderUnitName
     FROM document_tasks
     LEFT JOIN positions AS requested_positions ON document_tasks.assigned_position_id = requested_positions.id
     LEFT JOIN units AS requested_units ON document_tasks.assigned_unit_id = requested_units.id
     LEFT JOIN assignments AS responder_assignments ON document_tasks.responded_by_assignment_id = responder_assignments.id
     LEFT JOIN persons AS responder_persons ON responder_assignments.person_id = responder_persons.id
     LEFT JOIN positions AS responder_positions ON responder_assignments.position_id = responder_positions.id
     LEFT JOIN units AS responder_units ON responder_positions.unit_id = responder_units.id
     WHERE document_tasks.document_id = ?
       AND document_tasks.status = 'completed'
       AND document_tasks.deleted_at IS NULL
       AND document_tasks.required_action IN ('sign', 'review')
     ORDER BY COALESCE(document_tasks.completed_at, document_tasks.updated_at, document_tasks.created_at) ASC,
              document_tasks.id ASC`,
    [documentId]
  );
  return rows;
}

export async function signatureEventsWithAssets(documentId: number) {
  const [rows] = await pool.execute<RowDataPacket[]>(
    `SELECT
      signature_events.*,
      persons.display_name AS signerName,
      positions.title AS signerPositionTitle,
      units.name AS signerUnitName,
      document_tasks.required_action AS documentTaskRequiredAction,
      document_tasks.title AS documentTaskTitle,
      document_tasks.due_at AS documentTaskDueAt,
      signature_assets.encryption_algorithm AS signatureEncryptionAlgorithm,
      file_assets.storage_path AS signatureStoragePath,
      file_assets.encryption_status AS signatureEncryptionStatus,
      file_assets.mime_type AS signatureMimeType
     FROM signature_events
     LEFT JOIN document_tasks ON signature_events.document_task_id = document_tasks.id
     INNER JOIN assignments ON signature_events.assignment_id = assignments.id
     INNER JOIN persons ON assignments.person_id = persons.id
     INNER JOIN positions ON assignments.position_id = positions.id
     INNER JOIN units ON positions.unit_id = units.id
     INNER JOIN signature_assets ON signature_events.signature_asset_id = signature_assets.id
     INNER JOIN file_assets ON signature_assets.file_asset_id = file_assets.id
     WHERE signature_events.document_id = ?
     ORDER BY COALESCE(document_tasks.id, signature_events.id) ASC, signature_events.created_at ASC`,
    [documentId]
  );

  return Promise.all(rows.map(async (row) => {
    const encrypted = row.signatureEncryptionStatus === "encrypted" || row.signatureEncryptionAlgorithm === "aes-256-gcm";
    const decrypted = encrypted
      ? await decryptSignatureFile({
        mimeType: String(row.signatureMimeType),
        storagePath: String(row.signatureStoragePath)
      })
      : await legacySignatureFileDataUrl(String(row.signatureStoragePath), String(row.signatureMimeType));
    return {
      ...row,
      signatureImageDataUrl: decrypted.dataUrl
    };
  }));
}

async function legacySignatureFileDataUrl(storagePath: string, mimeType: string) {
  const absolute = path.resolve(process.cwd(), storagePath);
  try {
    const buffer = await fs.readFile(absolute);
    return {
      dataUrl: `data:${mimeType};base64,${buffer.toString("base64")}`,
      mimeType
    };
  } catch {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="320" height="96" viewBox="0 0 320 96"><path d="M24 62c34-30 49-28 45 2 26-38 35-39 28-2 25-30 43-30 54-1 36-10 70-14 145-10" fill="none" stroke="#111827" stroke-width="5" stroke-linecap="round"/></svg>`;
    return {
      dataUrl: `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`,
      mimeType: "image/svg+xml"
    };
  }
}

async function finalRenderContext(documentId: number, verification: { qrDataUrl: string; url: string }) {
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

  const [signatureEvents, workflowEvents, serialRows, taskRows] = await Promise.all([
    signatureEventsWithAssets(documentId),
    pool.execute<RowDataPacket[]>(
      "SELECT * FROM document_workflow_events WHERE document_id = ? ORDER BY created_at DESC",
      [documentId]
    ).then(([rows]) => rows),
    pool.execute<RowDataPacket[]>(
      "SELECT * FROM serial_assignments WHERE document_id = ? LIMIT 1",
      [documentId]
    ).then(([rows]) => rows),
    endorsementTasks(documentId)
  ]);
  const signatureByTaskId = new Map<number, RowDataPacket>();
  for (const event of signatureEvents) {
    const eventRecord = event as Record<string, unknown>;
    const taskId = Number(eventRecord.document_task_id || eventRecord.documentTaskId || 0);
    if (taskId && !signatureByTaskId.has(taskId)) {
      signatureByTaskId.set(taskId, event as RowDataPacket);
    }
  }
  const endorsements = taskRows.map((task) => {
    const signatureEvent = signatureByTaskId.get(Number(task.documentTaskId || 0));
    return {
      ...task,
      completedAt: task.completedAt || signatureEvent?.created_at || signatureEvent?.createdAt,
      responderName: task.responderName || signatureEvent?.signerName || null,
      responderPositionTitle: task.responderPositionTitle || signatureEvent?.signerPositionTitle || task.requestedPositionTitle || null,
      responderUnitName: task.responderUnitName || signatureEvent?.signerUnitName || task.requestedUnitName || null,
      signatureEventId: signatureEvent?.id || null,
      signatureImageDataUrl: signatureEvent?.signatureImageDataUrl || null
    };
  });

  return {
    document,
    endorsements,
    signatureVisibility: {},
    signatureEvents,
    verification,
    workflowEvents,
    serialAssignment: serialRows[0] || null
  };
}

export async function createFinalDocumentRender(request: Request, input: {
  assignmentId: number;
  documentHash: string;
  documentId: number;
}) {
  const rawToken = uuid().replaceAll("-", "") + uuid().replaceAll("-", "");
  const verificationUrl = verificationUrlForToken(rawToken);
  const qrDataUrl = await QRCode.toDataURL(verificationUrl, {
    errorCorrectionLevel: "M",
    margin: 1,
    width: 180
  });
  const context = await finalRenderContext(input.documentId, { qrDataUrl, url: verificationUrl });
  const layout = await layoutForFinalRender(Number(context.document.document_type_id));
  const html = renderTemplateHtml(layout, context);
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
        request.session.userId || null,
        input.assignmentId,
        "document_final_render_pdf",
        "local",
        storagePath,
        `document-${input.documentId}-final.pdf`,
        pdfFilename,
        "application/pdf",
        pdfBuffer.length,
        checksum,
        "not_encrypted",
        "active",
        JSON.stringify({ documentHash: input.documentHash })
      ]
    );
    fileAssetId = Number(assetResult.insertId);

    const [renderResult] = await connection.execute<ResultSetHeader>(
      `INSERT INTO document_renders (
        uuid, document_id, file_asset_id, render_key, render_type,
        visibility_policy, source_version_number, document_hash, verification_url,
        status, created_by_assignment_id, render_definition, metadata
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        uuid(),
        input.documentId,
        fileAssetId,
        `final_render_${uuid()}`,
        "final_pdf",
        "official",
        Number(context.document.current_version_number || 1),
        input.documentHash,
        verificationUrl,
        "generated",
        input.assignmentId,
        JSON.stringify(layout),
        JSON.stringify({
          finalSnapshot: true,
          locale: "all",
          officialSerial: context.document.official_serial || context.serialAssignment?.serial_value || null,
          variant: "official"
        })
      ]
    );
    renderId = Number(renderResult.insertId);

    await connection.execute<ResultSetHeader>(
      `INSERT INTO document_verification_tokens (
        uuid, document_id, document_render_id, token_hash, verification_scope,
        status, expires_at, created_by_assignment_id, metadata
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        uuid(),
        input.documentId,
        renderId,
        tokenHash(rawToken),
        "public_minimal",
        "active",
        null,
        input.assignmentId,
        JSON.stringify({
          documentHash: input.documentHash,
          publicRouteEnabled: true,
          verificationUrl
        })
      ]
    );

    for (const event of context.signatureEvents as RowDataPacket[]) {
      await connection.execute<ResultSetHeader>(
        `INSERT INTO render_signature_visibility (
          uuid, document_render_id, signature_event_id,
          is_visible, visibility_reason, visibility_policy
        ) VALUES (?, ?, ?, ?, ?, ?)`,
        [
          uuid(),
          renderId,
          event.id,
          true,
          "final_official_render",
          "official"
        ]
      );
    }

    await writeAuditLog(request, { action: "document.final_render.create", entityType: "document_render", entityId: renderId }, connection);
    await connection.commit();
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }

  return {
    byteSize: pdfBuffer.length,
    fileAssetId,
    renderId,
    storagePath,
    verificationToken: rawToken,
    verificationUrl
  };
}
