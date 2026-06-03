import { createHash, randomBytes } from "node:crypto";
import { Router } from "express";
import type { ResultSetHeader, RowDataPacket } from "mysql2/promise";
import { z } from "zod";
import { pool } from "../../db/mysql";
import { requireAuth } from "../../middleware/auth";
import { assertDocumentAccess } from "../../shared/document-access";
import { calculateDocumentContentHash } from "../../shared/document-hash";
import { asyncHandler } from "../../shared/async-handler";
import { writeAuditLog } from "../../shared/audit";
import { created, ok } from "../../shared/http";
import { uuid } from "../../shared/ids";
import { formatTemplateDocumentDate } from "../templates/template-renderer";

export const documentVerificationRouter = Router();
export const publicDocumentVerificationRouter = Router();

documentVerificationRouter.use(requireAuth);

function hashToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

function parseMetadata(value: unknown): Record<string, unknown> {
  if (!value) {
    return {};
  }
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value) as unknown;
      return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed as Record<string, unknown> : {};
    } catch {
      return {};
    }
  }
  return typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

publicDocumentVerificationRouter.get("/verify/:token", asyncHandler(async (request, response) => {
  const { token } = z.object({ token: z.string().trim().min(16).max(160) }).parse(request.params);
  const [rows] = await pool.execute<RowDataPacket[]>(
    `SELECT
      document_verification_tokens.*,
      documents.id AS documentId,
      documents.subject,
      documents.document_date AS documentDate,
      documents.current_version_number AS currentVersionNumber,
      documents.official_serial AS officialSerial,
      documents.finalized_at AS finalizedAt,
      documents.body,
      documents.summary,
      documents.template_fields,
      documents.document_content,
      documents.document_type_id,
      documents.confidentiality_level_id,
      documents.priority_level_id,
      document_renders.document_hash AS renderDocumentHash,
      document_renders.verification_url AS verificationUrl
     FROM document_verification_tokens
     INNER JOIN documents ON document_verification_tokens.document_id = documents.id
     LEFT JOIN document_renders ON document_verification_tokens.document_render_id = document_renders.id
     WHERE document_verification_tokens.token_hash = ?
     LIMIT 1`,
    [hashToken(token)]
  );
  const verification = rows[0];

  if (!verification) {
    ok(response, { status: "invalid", reason: "not_found" });
    return;
  }

  if (verification.revoked_at || verification.status === "revoked") {
    ok(response, { status: "revoked", reason: "revoked" });
    return;
  }

  if (verification.expires_at && new Date(verification.expires_at) <= new Date()) {
    ok(response, { status: "expired", reason: "expired" });
    return;
  }

  const metadata = parseMetadata(verification.metadata);
  const expectedHash = String(metadata.documentHash || verification.renderDocumentHash || "");
  const currentHash = calculateDocumentContentHash({
    body: verification.body,
    confidentiality_level_id: verification.confidentiality_level_id,
    current_version_number: verification.currentVersionNumber,
    document_content: verification.document_content,
    document_date: verification.documentDate,
    document_type_id: verification.document_type_id,
    priority_level_id: verification.priority_level_id,
    subject: verification.subject,
    summary: verification.summary,
    template_fields: verification.template_fields
  });
  const hashMatched = Boolean(expectedHash && expectedHash === currentHash);

  const [signerRows, issuerRows] = await Promise.all([
    pool.execute<RowDataPacket[]>(
      `SELECT DISTINCT persons.display_name AS signerName,
              positions.title AS positionTitle,
              units.name AS unitName,
              COALESCE(document_tasks.id, signature_events.id) AS stepNumber
       FROM signature_events
       LEFT JOIN document_tasks ON signature_events.document_task_id = document_tasks.id
       INNER JOIN assignments ON signature_events.assignment_id = assignments.id
       INNER JOIN persons ON assignments.person_id = persons.id
       INNER JOIN positions ON assignments.position_id = positions.id
       INNER JOIN units ON positions.unit_id = units.id
       WHERE signature_events.document_id = ?
       ORDER BY stepNumber ASC, signature_events.created_at ASC`,
      [verification.documentId]
    ).then(([result]) => result),
    pool.execute<RowDataPacket[]>(
      `SELECT positions.title AS positionTitle, units.name AS unitName
       FROM serial_assignments
       INNER JOIN assignments ON COALESCE(serial_assignments.assigned_by_assignment_id, 0) = assignments.id
       INNER JOIN positions ON assignments.position_id = positions.id
       INNER JOIN units ON positions.unit_id = units.id
       WHERE serial_assignments.document_id = ?
       LIMIT 1`,
      [verification.documentId]
    ).then(([result]) => result)
  ]);
  const issuer = issuerRows[0] || signerRows[signerRows.length - 1] || null;

  ok(response, {
    status: hashMatched ? "valid" : "mismatched",
    documentSerial: verification.officialSerial || null,
    subject: verification.subject,
    issuer: issuer ? {
      position: issuer.positionTitle,
      unit: issuer.unitName
    } : null,
    finalizedAt: verification.finalizedAt || null,
    finalizedAtShamsi: formatTemplateDocumentDate(verification.finalizedAt || verification.documentDate, "shamsi"),
    signedBy: signerRows.map((row) => ({
      name: row.signerName,
      position: row.positionTitle,
      unit: row.unitName
    })),
    documentHash: {
      matched: hashMatched,
      value: expectedHash || null
    }
  });
}));

documentVerificationRouter.post("/documents/:documentId/verification-token", asyncHandler(async (request, response) => {
  const { documentId } = z.object({ documentId: z.coerce.number().int().positive() }).parse(request.params);
  const input = z.object({
    document_render_id: z.coerce.number().int().positive().nullable().optional(),
    expires_at: z.coerce.date().nullable().optional()
  }).parse(request.body);
  const { assignment } = await assertDocumentAccess(documentId, request, response);
  const rawToken = randomBytes(32).toString("hex");
  const tokenHash = hashToken(rawToken);
  const [result] = await pool.execute<ResultSetHeader>(
    `INSERT INTO document_verification_tokens (
      uuid, document_id, document_render_id, token_hash, verification_scope,
      status, expires_at, created_by_assignment_id, metadata
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      uuid(),
      documentId,
      input.document_render_id || null,
      tokenHash,
      "internal",
      "active",
      input.expires_at || null,
      assignment.id,
      JSON.stringify({ publicRouteEnabled: false })
    ]
  );
  const id = result.insertId;
  await writeAuditLog(request, { action: "document.verification_token.create", entityType: "document_verification_token", entityId: id });
  created(response, { id, token: rawToken, scope: "internal" });
}));
