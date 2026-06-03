import { z } from "zod";
import type { RowDataPacket } from "mysql2/promise";
import { pool } from "../db/mysql";
import { asyncHandler } from "./async-handler";
import { ok } from "./http";

export const optionalNullableString = z.string().trim().min(1).nullable().optional();

export function clean<T extends Record<string, unknown>>(value: T): Record<string, unknown> {
  return Object.fromEntries(Object.entries(value).filter(([, item]) => item !== undefined));
}

const tableNames = new Set([
  "api_clients",
  "archive_records",
  "confidentiality_access_rules",
  "delegations",
  "document_comments",
  "document_ocr_text",
  "document_renders",
  "document_tasks",
  "document_verification_tokens",
  "external_organizations",
  "external_recipients",
  "notifications",
  "retention_policies",
  "saved_searches",
  "transmissions",
  "transmission_recipients"
]);

const tableOrderColumns: Record<string, Set<string>> = {
  api_clients: new Set(["id"]),
  archive_records: new Set(["id"]),
  confidentiality_access_rules: new Set(["id"]),
  delegations: new Set(["id"]),
  document_comments: new Set(["id"]),
  document_ocr_text: new Set(["id"]),
  document_renders: new Set(["id"]),
  document_tasks: new Set(["id"]),
  document_verification_tokens: new Set(["id"]),
  external_organizations: new Set(["id"]),
  external_recipients: new Set(["id"]),
  notifications: new Set(["id"]),
  retention_policies: new Set(["id"]),
  saved_searches: new Set(["id"]),
  transmissions: new Set(["id"]),
  transmission_recipients: new Set(["id"])
};

function assertIdentifier(value: string) {
  if (!/^[a-zA-Z0-9_]+$/.test(value)) {
    throw new Error(`Unsafe SQL identifier: ${value}`);
  }
}

function tableName(table: string) {
  if (!tableNames.has(table)) {
    throw new Error(`Table is not allowlisted: ${table}`);
  }
  assertIdentifier(table);
  return `\`${table}\``;
}

function columnName(table: string, column: string) {
  const allowedColumns = tableOrderColumns[table];
  if (!allowedColumns?.has(column)) {
    throw new Error(`Column is not allowlisted for ${table}: ${column}`);
  }
  assertIdentifier(column);
  return `\`${column}\``;
}

export function listRoute(table: string, orderColumn = "id", direction: "asc" | "desc" = "desc") {
  return asyncHandler(async (_request, response) => {
    const [rows] = await pool.execute<RowDataPacket[]>(
      `SELECT * FROM ${tableName(table)} ORDER BY ${columnName(table, orderColumn)} ${direction.toUpperCase()} LIMIT 250`
    );
    ok(response, rows);
  });
}

export async function fetchById(table: string, id: number) {
  const [rows] = await pool.execute<RowDataPacket[]>(
    `SELECT * FROM ${tableName(table)} WHERE id = ? LIMIT 1`,
    [id]
  );
  return rows[0] || null;
}
