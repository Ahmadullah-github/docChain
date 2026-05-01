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

export const documentOcrRouter = Router();

documentOcrRouter.use(requireAuth);

const createOcrTextSchema = z.object({
  document_attachment_id: z.coerce.number().int().positive().nullable().optional(),
  file_asset_id: z.coerce.number().int().positive().nullable().optional(),
  language: z.string().trim().min(1).max(20).nullable().optional(),
  extracted_text: z.string().default(""),
  confidence: z.coerce.number().min(0).max(100).nullable().optional(),
  ocr_engine: optionalNullableString,
  status: z.string().trim().min(1).max(60).default("completed"),
  metadata: z.record(z.string(), z.unknown()).optional()
});

documentOcrRouter.get("/documents/:documentId/ocr-text", asyncHandler(async (request, response) => {
  const { documentId } = z.object({ documentId: z.coerce.number().int().positive() }).parse(request.params);
  await assertDocumentAccess(documentId, request, response);
  const [rows] = await pool.execute<RowDataPacket[]>(
    `SELECT *
     FROM document_ocr_text
     WHERE document_id = ?
     ORDER BY created_at DESC`,
    [documentId]
  );
  ok(response, rows);
}));

documentOcrRouter.post("/documents/:documentId/ocr-text", asyncHandler(async (request, response) => {
  const { documentId } = z.object({ documentId: z.coerce.number().int().positive() }).parse(request.params);
  const input = createOcrTextSchema.parse(request.body);
  await assertDocumentAccess(documentId, request, response);
  const [result] = await pool.execute<ResultSetHeader>(
    `INSERT INTO document_ocr_text (
      uuid, document_id, document_attachment_id, file_asset_id, language,
      extracted_text, confidence, ocr_engine, status, metadata, processed_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      uuid(),
      documentId,
      input.document_attachment_id || null,
      input.file_asset_id || null,
      input.language || null,
      input.extracted_text,
      input.confidence ?? null,
      input.ocr_engine || null,
      input.status,
      JSON.stringify(input.metadata || {}),
      input.status === "completed" ? new Date() : null
    ]
  );
  const id = result.insertId;
  await writeAuditLog(request, { action: "document.ocr_text.create", entityType: "document_ocr_text", entityId: id });
  created(response, await fetchById("document_ocr_text", Number(id)));
}));
