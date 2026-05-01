import type { Request } from "express";
import type { ResultSetHeader } from "mysql2/promise";
import { pool } from "../db/mysql";
import type { Database } from "../db/mysql";

type AuditInput = {
  action: string;
  entityType: string;
  entityId?: string | number | null;
  metadata?: Record<string, unknown>;
};

export async function writeAuditLog(request: Request, input: AuditInput, connection: Database = pool) {
  await connection.execute<ResultSetHeader>(
    `INSERT INTO audit_logs (
      actor_user_id, actor_assignment_id, action, entity_type,
      entity_id, ip_address, user_agent, metadata
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      request.session.userId || null,
      request.session.activeAssignmentId || null,
      input.action,
      input.entityType,
      input.entityId == null ? null : String(input.entityId),
      request.ip || null,
      request.get("user-agent") || null,
      JSON.stringify(input.metadata || {})
    ]
  );
}
