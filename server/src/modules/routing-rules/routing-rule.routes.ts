import { Router } from "express";
import type { ResultSetHeader, RowDataPacket } from "mysql2/promise";
import { z } from "zod";
import { pool } from "../../db/mysql";
import { requireAnyRole, requireAuth } from "../../middleware/auth";
import { asyncHandler } from "../../shared/async-handler";
import { writeAuditLog } from "../../shared/audit";
import { AppError, notFound } from "../../shared/errors";
import { created, ok } from "../../shared/http";
import { uuid } from "../../shared/ids";

export const routingRuleRouter = Router();

routingRuleRouter.use(requireAuth, requireAnyRole(["system_admin", "admin_staff"]));

const optionalNullableString = z.string().trim().min(1).nullable().optional();

const conditionSchema = z.object({
  condition_key: z.string().trim().min(1).max(120),
  operator: z.string().trim().min(1).max(40).default("equals"),
  condition_value: z.string().trim().min(1).max(255),
  is_required: z.boolean().default(true)
});

const createRoutingRuleSchema = z.object({
  document_type_id: z.coerce.number().int().positive().nullable().optional(),
  from_unit_type_id: z.coerce.number().int().positive().nullable().optional(),
  from_position_id: z.coerce.number().int().positive().nullable().optional(),
  to_unit_type_id: z.coerce.number().int().positive().nullable().optional(),
  to_position_id: z.coerce.number().int().positive().nullable().optional(),
  action: z.string().trim().min(1).max(80),
  allowed: z.enum(["allowed", "optional", "denied", "emergency_only"]).default("allowed"),
  prior_review_required: z.boolean().default(false),
  prior_signature_required: z.boolean().default(false),
  is_external_target: z.boolean().default(false),
  is_multi_recipient: z.boolean().default(false),
  priority: z.coerce.number().int().nonnegative().default(100),
  status: z.enum(["draft", "active", "inactive", "archived"]).default("draft"),
  effective_from: z.coerce.date().nullable().optional(),
  effective_until: z.coerce.date().nullable().optional(),
  notes: optionalNullableString,
  conditions: z.array(conditionSchema).default([])
});

const updateRoutingRuleStatusSchema = z.object({
  status: z.enum(["draft", "active", "inactive", "archived"])
});

const updateRoutingRuleSchema = z.object({
  document_type_id: z.coerce.number().int().positive().nullable().optional(),
  from_unit_type_id: z.coerce.number().int().positive().nullable().optional(),
  from_position_id: z.coerce.number().int().positive().nullable().optional(),
  to_unit_type_id: z.coerce.number().int().positive().nullable().optional(),
  to_position_id: z.coerce.number().int().positive().nullable().optional(),
  action: z.string().trim().min(1).max(80).optional(),
  allowed: z.enum(["allowed", "optional", "denied", "emergency_only"]).optional(),
  prior_review_required: z.boolean().optional(),
  prior_signature_required: z.boolean().optional(),
  is_external_target: z.boolean().optional(),
  is_multi_recipient: z.boolean().optional(),
  priority: z.coerce.number().int().nonnegative().optional(),
  status: z.enum(["draft", "active", "inactive", "archived"]).optional(),
  effective_from: z.coerce.date().nullable().optional(),
  effective_until: z.coerce.date().nullable().optional(),
  notes: optionalNullableString,
  conditions: z.array(conditionSchema).optional()
});

function clean<T extends Record<string, unknown>>(value: T): Record<string, unknown> {
  return Object.fromEntries(Object.entries(value).filter(([, item]) => item !== undefined));
}

function requirePatch(input: Record<string, unknown>) {
  if (Object.keys(input).length === 0) {
    throw new AppError(422, "empty_patch", "At least one field is required.");
  }
}

function updateParts(input: Record<string, unknown>, columns: string[]) {
  const set: string[] = [];
  const values: any[] = [];
  for (const column of columns) {
    if (input[column] !== undefined) {
      set.push(`\`${column}\` = ?`);
      values.push(input[column]);
    }
  }
  return { set, values };
}

async function getRoutingRuleDetail(id: number) {
  const [ruleRows] = await pool.execute<RowDataPacket[]>(
    `SELECT
      routing_rules.*,
      document_types.code AS documentTypeCode,
      document_types.name AS documentTypeName,
      from_unit_types.code AS fromUnitTypeCode,
      from_positions.code AS fromPositionCode,
      to_unit_types.code AS toUnitTypeCode,
      to_positions.code AS toPositionCode
    FROM routing_rules
    LEFT JOIN document_types ON routing_rules.document_type_id = document_types.id
    LEFT JOIN unit_types AS from_unit_types ON routing_rules.from_unit_type_id = from_unit_types.id
    LEFT JOIN positions AS from_positions ON routing_rules.from_position_id = from_positions.id
    LEFT JOIN unit_types AS to_unit_types ON routing_rules.to_unit_type_id = to_unit_types.id
    LEFT JOIN positions AS to_positions ON routing_rules.to_position_id = to_positions.id
    WHERE routing_rules.id = ?
    LIMIT 1`,
    [id]
  );
  const rule = ruleRows[0];

  if (!rule) {
    throw notFound("Routing rule");
  }

  const [conditions] = await pool.execute<RowDataPacket[]>(
    `SELECT *
     FROM workflow_rule_conditions
     WHERE routing_rule_id = ?
     ORDER BY id ASC`,
    [id]
  );

  return { rule, conditions };
}

routingRuleRouter.get("/", asyncHandler(async (request, response) => {
  const query = z.object({
    status: z.string().trim().min(1).optional(),
    action: z.string().trim().min(1).optional(),
    document_type_id: z.coerce.number().int().positive().optional(),
    limit: z.coerce.number().int().min(1).max(250).default(100)
  }).parse(request.query);

  const where: string[] = [];
  const params: any[] = [];
  if (query.status) {
    where.push("routing_rules.status = ?");
    params.push(query.status);
  }
  if (query.action) {
    where.push("routing_rules.action = ?");
    params.push(query.action);
  }
  if (query.document_type_id) {
    where.push("routing_rules.document_type_id = ?");
    params.push(query.document_type_id);
  }
  params.push(query.limit);
  const [rules] = await pool.execute<RowDataPacket[]>(
    `SELECT
      routing_rules.*,
      document_types.code AS documentTypeCode,
      document_types.name AS documentTypeName
    FROM routing_rules
    LEFT JOIN document_types ON routing_rules.document_type_id = document_types.id
    ${where.length ? `WHERE ${where.join(" AND ")}` : ""}
    ORDER BY routing_rules.priority ASC, routing_rules.id DESC
    LIMIT ?`,
    params
  );

  ok(response, rules);
}));

routingRuleRouter.post("/", asyncHandler(async (request, response) => {
  const input = createRoutingRuleSchema.parse(request.body);
  let routingRuleId = 0;

  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const [ruleResult] = await connection.execute<ResultSetHeader>(
      `INSERT INTO routing_rules (
        uuid, document_type_id, from_unit_type_id, from_position_id,
        to_unit_type_id, to_position_id, action, allowed,
        prior_review_required, prior_signature_required, is_external_target,
        is_multi_recipient, priority, status, effective_from, effective_until,
        activated_by_user_id, activated_at, notes
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        uuid(),
        input.document_type_id || null,
        input.from_unit_type_id || null,
        input.from_position_id || null,
        input.to_unit_type_id || null,
        input.to_position_id || null,
        input.action,
        input.allowed,
        input.prior_review_required,
        input.prior_signature_required,
        input.is_external_target,
        input.is_multi_recipient,
        input.priority,
        input.status,
        input.effective_from || null,
        input.effective_until || null,
        input.status === "active" ? request.session.userId || null : null,
        input.status === "active" ? new Date() : null,
        input.notes || null
      ]
    );

    routingRuleId = ruleResult.insertId;

    for (const condition of input.conditions) {
      await connection.execute<ResultSetHeader>(
        `INSERT INTO workflow_rule_conditions (
          routing_rule_id, condition_key, operator, condition_value, is_required
        ) VALUES (?, ?, ?, ?, ?)`,
        [routingRuleId, condition.condition_key, condition.operator, condition.condition_value, condition.is_required]
      );
    }

    await writeAuditLog(request, { action: "admin.routing_rule.create", entityType: "routing_rule", entityId: routingRuleId }, connection);
    await connection.commit();
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }

  created(response, await getRoutingRuleDetail(routingRuleId));
}));

routingRuleRouter.get("/:routingRuleId", asyncHandler(async (request, response) => {
  const { routingRuleId } = z.object({ routingRuleId: z.coerce.number().int().positive() }).parse(request.params);
  ok(response, await getRoutingRuleDetail(routingRuleId));
}));

routingRuleRouter.patch("/:routingRuleId", asyncHandler(async (request, response) => {
  const { routingRuleId } = z.object({ routingRuleId: z.coerce.number().int().positive() }).parse(request.params);
  const input = updateRoutingRuleSchema.parse(request.body);
  requirePatch(input);

  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const [ruleRows] = await connection.execute<RowDataPacket[]>(
      "SELECT id FROM routing_rules WHERE id = ? LIMIT 1",
      [routingRuleId]
    );
    const rule = ruleRows[0];
    if (!rule) {
      throw notFound("Routing rule");
    }

    const { conditions, ...rulePatch } = input;
    const normalizedPatch = clean({
      ...rulePatch,
      document_type_id: input.document_type_id === undefined ? undefined : input.document_type_id || null,
      from_unit_type_id: input.from_unit_type_id === undefined ? undefined : input.from_unit_type_id || null,
      from_position_id: input.from_position_id === undefined ? undefined : input.from_position_id || null,
      to_unit_type_id: input.to_unit_type_id === undefined ? undefined : input.to_unit_type_id || null,
      to_position_id: input.to_position_id === undefined ? undefined : input.to_position_id || null,
      activated_by_user_id: input.status === "active" ? request.session.userId || null : undefined,
      activated_at: input.status === "active" ? new Date() : undefined
    });
    const { set, values } = updateParts(normalizedPatch, [
      "document_type_id",
      "from_unit_type_id",
      "from_position_id",
      "to_unit_type_id",
      "to_position_id",
      "action",
      "allowed",
      "prior_review_required",
      "prior_signature_required",
      "is_external_target",
      "is_multi_recipient",
      "priority",
      "status",
      "effective_from",
      "effective_until",
      "activated_by_user_id",
      "activated_at",
      "notes"
    ]);
    if (set.length) {
      await connection.execute<ResultSetHeader>(
        `UPDATE routing_rules
         SET ${set.join(", ")}, updated_at = CURRENT_TIMESTAMP
         WHERE id = ?`,
        [...values, routingRuleId]
      );
    } else {
      await connection.execute<ResultSetHeader>(
        "UPDATE routing_rules SET updated_at = CURRENT_TIMESTAMP WHERE id = ?",
        [routingRuleId]
      );
    }

    if (conditions) {
      await connection.execute<ResultSetHeader>(
        "DELETE FROM workflow_rule_conditions WHERE routing_rule_id = ?",
        [routingRuleId]
      );
      for (const condition of conditions) {
        await connection.execute<ResultSetHeader>(
          `INSERT INTO workflow_rule_conditions (
            routing_rule_id, condition_key, operator, condition_value, is_required
          ) VALUES (?, ?, ?, ?, ?)`,
          [routingRuleId, condition.condition_key, condition.operator, condition.condition_value, condition.is_required]
        );
      }
    }

    await writeAuditLog(request, { action: "admin.routing_rule.update", entityType: "routing_rule", entityId: routingRuleId }, connection);
    await connection.commit();
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }

  ok(response, await getRoutingRuleDetail(routingRuleId));
}));

routingRuleRouter.patch("/:routingRuleId/status", asyncHandler(async (request, response) => {
  const { routingRuleId } = z.object({ routingRuleId: z.coerce.number().int().positive() }).parse(request.params);
  const input = updateRoutingRuleStatusSchema.parse(request.body);

  const [ruleRows] = await pool.execute<RowDataPacket[]>(
    "SELECT id FROM routing_rules WHERE id = ? LIMIT 1",
    [routingRuleId]
  );
  const rule = ruleRows[0];
  if (!rule) {
    throw notFound("Routing rule");
  }

  await pool.execute<ResultSetHeader>(
    `UPDATE routing_rules
     SET status = ?,
         activated_by_user_id = ?,
         activated_at = ?,
         updated_at = CURRENT_TIMESTAMP
     WHERE id = ?`,
    [
      input.status,
      input.status === "active" ? request.session.userId || null : null,
      input.status === "active" ? new Date() : null,
      routingRuleId
    ]
  );

  await writeAuditLog(request, {
    action: "admin.routing_rule.status_update",
    entityType: "routing_rule",
    entityId: routingRuleId,
    metadata: { status: input.status }
  });

  ok(response, await getRoutingRuleDetail(routingRuleId));
}));
