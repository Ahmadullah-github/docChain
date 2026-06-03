import type { ResultSetHeader, RowDataPacket } from "mysql2/promise";
import type { Database } from "../../db/mysql";
import { AppError } from "../../shared/errors";
import { uuid } from "../../shared/ids";
import { formatSerialNumber, serialSequenceKey } from "./serial-numbering";
import type { SerialContext, SerialRuleLike } from "./serial-numbering";

export type AssignOfficialSerialInput = {
  assignmentId: number;
  documentId: number;
  signatureEventId?: number | null;
  status?: string;
};

async function getSerialContextForDocument(connection: Database, documentId: number): Promise<SerialContext> {
  const [rows] = await connection.execute<RowDataPacket[]>(
    `SELECT
      document_types.code AS documentTypeCode,
      organizations.code AS organizationCode,
      origin_units.code AS originUnitCode
     FROM documents
     INNER JOIN document_types ON documents.document_type_id = document_types.id
     INNER JOIN units AS origin_units ON documents.origin_unit_id = origin_units.id
     INNER JOIN organizations ON origin_units.organization_id = organizations.id
     WHERE documents.id = ?
     LIMIT 1`,
    [documentId]
  );
  const row = rows[0];

  return {
    documentTypeCode: row?.documentTypeCode ? String(row.documentTypeCode) : null,
    organizationCode: row?.organizationCode ? String(row.organizationCode) : null,
    originUnitCode: row?.originUnitCode ? String(row.originUnitCode) : null
  };
}

export async function assignOfficialSerial(connection: Database, input: AssignOfficialSerialInput) {
  const [existingRows] = await connection.execute<RowDataPacket[]>(
    "SELECT * FROM serial_assignments WHERE document_id = ? LIMIT 1",
    [input.documentId]
  );
  const existing = existingRows[0];
  if (existing) {
    if (input.signatureEventId) {
      await connection.execute<ResultSetHeader>(
        "UPDATE signature_events SET serial_assignment_id = ? WHERE id = ?",
        [existing.id, input.signatureEventId]
      );
    }
    await connection.execute<ResultSetHeader>(
      `UPDATE documents
       SET official_serial = COALESCE(official_serial, ?),
           finalized_at = COALESCE(finalized_at, CURRENT_TIMESTAMP),
           finalized_by_assignment_id = COALESCE(finalized_by_assignment_id, ?),
           official_serial_generated_at = COALESCE(official_serial_generated_at, CURRENT_TIMESTAMP),
           official_serial_generated_by_assignment_id = COALESCE(official_serial_generated_by_assignment_id, ?),
           status = ?,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [existing.serial_value, input.assignmentId, input.assignmentId, input.status || "finalized", input.documentId]
    );
    return existing;
  }

  const [serialRuleRows] = await connection.execute<RowDataPacket[]>(
    `SELECT *
     FROM serial_rules
     WHERE status = 'active'
     ORDER BY is_default DESC, id ASC
     LIMIT 1`
  );
  const serialRule = serialRuleRows[0];

  if (!serialRule) {
    throw new AppError(409, "serial_rule_required", "No active serial rule exists.");
  }

  const assignedAt = new Date();
  const serialContext = await getSerialContextForDocument(connection, input.documentId);
  const sequenceKey = serialSequenceKey(serialRule as SerialRuleLike, serialContext, assignedAt);

  await connection.execute<ResultSetHeader>(
    `INSERT IGNORE INTO serial_sequences (
      serial_rule_id, sequence_scope, sequence_year, sequence_period, current_value
    ) VALUES (?, ?, ?, ?, ?)`,
    [serialRule.id, sequenceKey.sequenceScope, sequenceKey.sequenceYear, sequenceKey.sequencePeriod, 0]
  );

  const [sequenceRows] = await connection.execute<RowDataPacket[]>(
    `SELECT *
     FROM serial_sequences
     WHERE serial_rule_id = ?
       AND sequence_scope = ?
       AND sequence_period = ?
     LIMIT 1
     FOR UPDATE`,
    [serialRule.id, sequenceKey.sequenceScope, sequenceKey.sequencePeriod]
  );
  const sequence = sequenceRows[0];

  if (!sequence) {
    throw new AppError(500, "serial_sequence_missing", "Could not prepare the official serial sequence.");
  }

  const nextValue = Number(sequence.current_value) + 1;
  const serialValue = formatSerialNumber(serialRule as SerialRuleLike, {
    context: serialContext,
    date: assignedAt,
    sequenceValue: nextValue
  });

  await connection.execute<ResultSetHeader>(
    "UPDATE serial_sequences SET current_value = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
    [nextValue, sequence.id]
  );

  const [serialAssignmentResult] = await connection.execute<ResultSetHeader>(
    `INSERT INTO serial_assignments (
      uuid, document_id, serial_rule_id, serial_sequence_id, serial_value,
      assigned_by_assignment_id, signature_event_id, metadata
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      uuid(),
      input.documentId,
      serialRule.id,
      sequence.id,
      serialValue,
      input.assignmentId,
      input.signatureEventId || null,
      JSON.stringify({
        documentTypeCode: serialContext.documentTypeCode,
        organizationCode: serialContext.organizationCode,
        originUnitCode: serialContext.originUnitCode,
        sequencePeriod: sequenceKey.sequencePeriod,
        sequenceScope: sequenceKey.sequenceScope,
        sequenceValue: nextValue,
        sequenceYear: sequenceKey.sequenceYear
      })
    ]
  );
  const serialAssignmentId = serialAssignmentResult.insertId;

  if (input.signatureEventId) {
    await connection.execute<ResultSetHeader>(
      "UPDATE signature_events SET serial_assignment_id = ? WHERE id = ?",
      [serialAssignmentId, input.signatureEventId]
    );
  }

  await connection.execute<ResultSetHeader>(
    `UPDATE documents
     SET official_serial = ?,
         status = ?,
         finalized_at = COALESCE(finalized_at, CURRENT_TIMESTAMP),
         finalized_by_assignment_id = COALESCE(finalized_by_assignment_id, ?),
         official_serial_generated_at = CURRENT_TIMESTAMP,
         official_serial_generated_by_assignment_id = ?,
         updated_at = CURRENT_TIMESTAMP
     WHERE id = ?`,
    [serialValue, input.status || "finalized", input.assignmentId, input.assignmentId, input.documentId]
  );

  const [assignmentRows] = await connection.execute<RowDataPacket[]>(
    "SELECT * FROM serial_assignments WHERE id = ? LIMIT 1",
    [serialAssignmentId]
  );
  return assignmentRows[0] || null;
}
