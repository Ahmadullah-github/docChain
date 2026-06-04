import type { ResultSetHeader, RowDataPacket } from "mysql2/promise";
import type { Database } from "../../db/mysql";
import { AppError } from "../../shared/errors";

export async function markWalkInRequestFinalizedForDocument(connection: Database, documentId: number) {
  await connection.execute<ResultSetHeader>(
    `UPDATE document_issuance_requests
     SET status = CASE
           WHEN status IN ('intake', 'draft_created') THEN 'finalized'
           ELSE status
         END,
         finalized_at = COALESCE(finalized_at, CURRENT_TIMESTAMP),
         updated_at = CURRENT_TIMESTAMP
     WHERE document_id = ?
       AND status <> 'canceled'`,
    [documentId]
  );
}

export async function markWalkInRequestArchivedForDocument(connection: Database, documentId: number) {
  await connection.execute<ResultSetHeader>(
    `UPDATE document_issuance_requests
     SET status = 'archived',
         archived_at = COALESCE(archived_at, CURRENT_TIMESTAMP),
         updated_at = CURRENT_TIMESTAMP
     WHERE document_id = ?
       AND status <> 'canceled'`,
    [documentId]
  );
}

export async function assertWalkInArchiveAllowedForDocument(connection: Database, documentId: number) {
  const [requestRows] = await connection.execute<RowDataPacket[]>(
    `SELECT id, status
     FROM document_issuance_requests
     WHERE document_id = ?
     LIMIT 1`,
    [documentId]
  );
  const issuanceRequest = requestRows[0];
  if (!issuanceRequest) {
    return;
  }

  const [handoverRows] = await connection.execute<RowDataPacket[]>(
    `SELECT id
     FROM document_handover_records
     WHERE document_id = ?
     LIMIT 1`,
    [documentId]
  );

  if (!handoverRows[0]) {
    throw new AppError(
      409,
      "walk_in_handover_required",
      "Walk-in issued documents must have a physical handover record before archive."
    );
  }
}
