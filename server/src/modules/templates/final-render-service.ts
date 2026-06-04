import fs from "node:fs/promises";
import path from "node:path";
import type { RowDataPacket } from "mysql2/promise";
import { pool } from "../../db/mysql";
import { decryptSignatureFile } from "../signatures/signature-assets";

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
      document_tasks.response_note AS taskResponseNote,
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
