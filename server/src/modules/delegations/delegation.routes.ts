import { Router } from "express";
import type { ResultSetHeader, RowDataPacket } from "mysql2/promise";
import { z } from "zod";
import { pool } from "../../db/mysql";
import { requireAnyRole, requireAuth } from "../../middleware/auth";
import { asyncHandler } from "../../shared/async-handler";
import { writeAuditLog } from "../../shared/audit";
import { created, ok } from "../../shared/http";
import { fetchById, optionalNullableString } from "../../shared/route-utils";
import { uuid } from "../../shared/ids";

export const adminDelegationRouter = Router();

adminDelegationRouter.use(requireAuth, requireAnyRole(["system_admin", "admin_staff"]));

const createDelegationSchema = z.object({
  delegator_assignment_id: z.coerce.number().int().positive(),
  delegate_assignment_id: z.coerce.number().int().positive(),
  approved_by_user_id: z.coerce.number().int().positive().nullable().optional(),
  scope: z.string().trim().min(1).max(120).default("workflow_actions"),
  starts_at: z.coerce.date(),
  ends_at: z.coerce.date(),
  status: z.string().trim().min(1).max(60).default("active"),
  reason: optionalNullableString,
  permissions: z.record(z.string(), z.unknown()).optional()
}).refine((input) => input.ends_at > input.starts_at, {
  path: ["ends_at"],
  message: "ends_at must be after starts_at."
});

adminDelegationRouter.get("/delegations", asyncHandler(async (_request, response) => {
  const [rows] = await pool.execute<RowDataPacket[]>(
    "SELECT * FROM delegations ORDER BY starts_at DESC LIMIT 250"
  );
  ok(response, rows);
}));

adminDelegationRouter.post("/delegations", asyncHandler(async (request, response) => {
  const input = createDelegationSchema.parse(request.body);
  const [result] = await pool.execute<ResultSetHeader>(
    `INSERT INTO delegations (
      uuid, delegator_assignment_id, delegate_assignment_id, created_by_user_id,
      approved_by_user_id, scope, starts_at, ends_at, status, reason, permissions
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      uuid(),
      input.delegator_assignment_id,
      input.delegate_assignment_id,
      request.session.userId || null,
      input.approved_by_user_id || request.session.userId || null,
      input.scope,
      input.starts_at,
      input.ends_at,
      input.status,
      input.reason || null,
      JSON.stringify(input.permissions || {})
    ]
  );
  const id = result.insertId;
  await writeAuditLog(request, { action: "admin.delegation.create", entityType: "delegation", entityId: id });
  created(response, await fetchById("delegations", Number(id)));
}));
