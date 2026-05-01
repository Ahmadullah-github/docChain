import { Router } from "express";
import type { ResultSetHeader, RowDataPacket } from "mysql2/promise";
import { z } from "zod";
import { pool } from "../../db/mysql";
import { requireAuth } from "../../middleware/auth";
import { assertDocumentAccess } from "../../shared/document-access";
import { asyncHandler } from "../../shared/async-handler";
import { writeAuditLog } from "../../shared/audit";
import { created, ok } from "../../shared/http";
import { fetchById, optionalNullableString } from "../../shared/route-utils";
import { uuid } from "../../shared/ids";

export const commentRouter = Router();

commentRouter.use(requireAuth);

commentRouter.get("/documents/:documentId/comments", asyncHandler(async (request, response) => {
  const { documentId } = z.object({ documentId: z.coerce.number().int().positive() }).parse(request.params);
  await assertDocumentAccess(documentId, request, response);
  const [rows] = await pool.execute<RowDataPacket[]>(
    `SELECT *
     FROM document_comments
     WHERE document_id = ? AND deleted_at IS NULL
     ORDER BY created_at ASC`,
    [documentId]
  );
  ok(response, rows);
}));

commentRouter.post("/documents/:documentId/comments", asyncHandler(async (request, response) => {
  const { documentId } = z.object({ documentId: z.coerce.number().int().positive() }).parse(request.params);
  const input = z.object({
    parent_comment_id: z.coerce.number().int().positive().nullable().optional(),
    visibility: z.string().trim().min(1).max(60).default("internal"),
    body: z.string().trim().min(1)
  }).parse(request.body);
  const { assignment } = await assertDocumentAccess(documentId, request, response);
  const [result] = await pool.execute<ResultSetHeader>(
    `INSERT INTO document_comments (
      uuid, document_id, parent_comment_id, author_assignment_id,
      visibility, body, status
    ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [
      uuid(),
      documentId,
      input.parent_comment_id || null,
      assignment.id,
      input.visibility,
      input.body,
      "active"
    ]
  );
  const id = result.insertId;
  await writeAuditLog(request, { action: "document.comment.create", entityType: "document_comment", entityId: id });
  created(response, await fetchById("document_comments", Number(id)));
}));
