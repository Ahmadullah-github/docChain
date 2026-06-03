import type { RowDataPacket } from "mysql2/promise";
import { pool } from "../db/mysql";
import { AppError } from "./errors";
import type { ActiveAssignment } from "./document-access";

export type DocumentWriteMode = "free" | "locked";

export type DocumentWritePermission = {
  documentTypeId: number;
  documentTypeCode: string;
  documentTypeName: string;
  mode: DocumentWriteMode;
  ruleId: number;
};

function normalizeMode(value: unknown): DocumentWriteMode {
  return value === "free" ? "free" : "locked";
}

function strongerMode(left: DocumentWriteMode, right: DocumentWriteMode): DocumentWriteMode {
  return left === "free" || right === "free" ? "free" : "locked";
}

function roleClause(roles: string[]) {
  if (!roles.length) {
    return { sql: "document_write_rules.role_id IS NULL", values: [] as string[] };
  }

  return {
    sql: `(document_write_rules.role_id IS NULL OR roles.name IN (${roles.map(() => "?").join(", ")}))`,
    values: roles
  };
}

export async function listDocumentWritePermissions(assignment: ActiveAssignment, roles: string[]): Promise<DocumentWritePermission[]> {
  const roleFilter = roleClause(roles);
  const [rows] = await pool.execute<RowDataPacket[]>(
    `SELECT
      document_write_rules.id AS ruleId,
      document_write_rules.mode,
      document_types.id AS documentTypeId,
      document_types.code AS documentTypeCode,
      document_types.name AS documentTypeName
     FROM document_write_rules
     INNER JOIN document_types ON document_write_rules.document_type_id = document_types.id
     LEFT JOIN roles ON document_write_rules.role_id = roles.id
     WHERE document_types.status = 'active'
       AND document_write_rules.status = 'active'
       AND (document_write_rules.unit_type_id IS NULL OR document_write_rules.unit_type_id = ?)
       AND (document_write_rules.position_id IS NULL OR document_write_rules.position_id = ?)
       AND ${roleFilter.sql}
     ORDER BY document_types.name ASC, document_write_rules.id ASC`,
    [assignment.unitTypeId, assignment.positionId, ...roleFilter.values]
  );

  const byDocumentType = new Map<number, DocumentWritePermission>();
  for (const row of rows) {
    const documentTypeId = Number(row.documentTypeId);
    const nextMode = normalizeMode(row.mode);
    const existing = byDocumentType.get(documentTypeId);
    byDocumentType.set(documentTypeId, {
      documentTypeId,
      documentTypeCode: String(row.documentTypeCode),
      documentTypeName: String(row.documentTypeName),
      mode: existing ? strongerMode(existing.mode, nextMode) : nextMode,
      ruleId: existing?.ruleId || Number(row.ruleId)
    });
  }

  return Array.from(byDocumentType.values());
}

export async function documentWritePermissionFor(documentTypeId: number, assignment: ActiveAssignment, roles: string[]) {
  return (await listDocumentWritePermissions(assignment, roles)).find((permission) => permission.documentTypeId === documentTypeId) || null;
}

export async function assertDocumentWritePermission(documentTypeId: number, assignment: ActiveAssignment, roles: string[]) {
  const permission = await documentWritePermissionFor(documentTypeId, assignment, roles);
  if (!permission) {
    throw new AppError(403, "document_write_rule_required", "Your active assignment is not allowed to create or edit this document type.");
  }
  return permission;
}
