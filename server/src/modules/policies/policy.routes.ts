import { Router } from "express";
import type { ResultSetHeader } from "mysql2/promise";
import { z } from "zod";
import { pool } from "../../db/mysql";
import { requireAnyRole, requireAuth } from "../../middleware/auth";
import { asyncHandler } from "../../shared/async-handler";
import { writeAuditLog } from "../../shared/audit";
import { created } from "../../shared/http";
import { fetchById, listRoute, optionalNullableString } from "../../shared/route-utils";
import { uuid } from "../../shared/ids";

export const adminPolicyRouter = Router();

adminPolicyRouter.use(requireAuth, requireAnyRole(["system_admin", "admin_staff"]));

const createRetentionPolicySchema = z.object({
  code: z.string().trim().min(1).max(80),
  name: z.string().trim().min(1).max(160),
  retention_months: z.coerce.number().int().positive().nullable().optional(),
  disposition_action: z.string().trim().min(1).max(80).default("review"),
  is_default: z.boolean().default(false),
  status: z.string().trim().min(1).max(40).default("draft"),
  description: optionalNullableString
});

const createConfidentialityAccessRuleSchema = z.object({
  confidentiality_level_id: z.coerce.number().int().positive(),
  subject_type: z.string().trim().min(1).max(80),
  role_id: z.coerce.number().int().positive().nullable().optional(),
  position_id: z.coerce.number().int().positive().nullable().optional(),
  unit_id: z.coerce.number().int().positive().nullable().optional(),
  unit_type_id: z.coerce.number().int().positive().nullable().optional(),
  access_level: z.string().trim().min(1).max(80).default("view_metadata"),
  can_view_content: z.boolean().default(false),
  can_download: z.boolean().default(false),
  can_print: z.boolean().default(false),
  requires_access_log: z.boolean().default(true),
  status: z.string().trim().min(1).max(40).default("active"),
  notes: optionalNullableString
});

adminPolicyRouter.get("/retention-policies", listRoute("retention_policies"));
adminPolicyRouter.post("/retention-policies", asyncHandler(async (request, response) => {
  const input = createRetentionPolicySchema.parse(request.body);
  let policyId = 0;
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    if (input.is_default) {
      await connection.execute<ResultSetHeader>(
        "UPDATE retention_policies SET is_default = FALSE, updated_at = CURRENT_TIMESTAMP WHERE is_default = TRUE"
      );
    }
    const [result] = await connection.execute<ResultSetHeader>(
      `INSERT INTO retention_policies (
        uuid, code, name, retention_months, disposition_action, is_default,
        status, description, created_by_user_id
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        uuid(),
        input.code,
        input.name,
        input.retention_months ?? null,
        input.disposition_action,
        input.is_default,
        input.status,
        input.description || null,
        request.session.userId || null
      ]
    );
    policyId = result.insertId;
    await writeAuditLog(request, { action: "admin.retention_policy.create", entityType: "retention_policy", entityId: policyId }, connection);
    await connection.commit();
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
  created(response, await fetchById("retention_policies", policyId));
}));

adminPolicyRouter.get("/confidentiality-access-rules", listRoute("confidentiality_access_rules"));
adminPolicyRouter.post("/confidentiality-access-rules", asyncHandler(async (request, response) => {
  const input = createConfidentialityAccessRuleSchema.parse(request.body);
  const [result] = await pool.execute<ResultSetHeader>(
    `INSERT INTO confidentiality_access_rules (
      uuid, confidentiality_level_id, subject_type, role_id, position_id,
      unit_id, unit_type_id, access_level, can_view_content, can_download,
      can_print, requires_access_log, status, notes
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      uuid(),
      input.confidentiality_level_id,
      input.subject_type,
      input.role_id || null,
      input.position_id || null,
      input.unit_id || null,
      input.unit_type_id || null,
      input.access_level,
      input.can_view_content,
      input.can_download,
      input.can_print,
      input.requires_access_log,
      input.status,
      input.notes || null
    ]
  );
  const id = result.insertId;
  await writeAuditLog(request, { action: "admin.confidentiality_access_rule.create", entityType: "confidentiality_access_rule", entityId: id });
  created(response, await fetchById("confidentiality_access_rules", Number(id)));
}));
