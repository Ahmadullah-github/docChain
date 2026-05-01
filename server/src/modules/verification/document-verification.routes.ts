import { createHash, randomBytes } from "node:crypto";
import { Router } from "express";
import type { ResultSetHeader } from "mysql2/promise";
import { z } from "zod";
import { pool } from "../../db/mysql";
import { requireAuth } from "../../middleware/auth";
import { assertDocumentAccess } from "../../shared/document-access";
import { asyncHandler } from "../../shared/async-handler";
import { writeAuditLog } from "../../shared/audit";
import { created } from "../../shared/http";
import { uuid } from "../../shared/ids";

export const documentVerificationRouter = Router();

documentVerificationRouter.use(requireAuth);

documentVerificationRouter.post("/documents/:documentId/verification-token", asyncHandler(async (request, response) => {
  const { documentId } = z.object({ documentId: z.coerce.number().int().positive() }).parse(request.params);
  const input = z.object({
    document_render_id: z.coerce.number().int().positive().nullable().optional(),
    expires_at: z.coerce.date().nullable().optional()
  }).parse(request.body);
  const { assignment } = await assertDocumentAccess(documentId, request, response);
  const rawToken = randomBytes(32).toString("hex");
  const tokenHash = createHash("sha256").update(rawToken).digest("hex");
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
