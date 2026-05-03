import { Router } from "express";
import type { Request } from "express";
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

const workflowStatusSchema = z.enum(["draft", "active", "inactive", "archived"]);

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

const designerSignatureRuleSchema = z.object({
  id: z.coerce.number().int().positive().nullable().optional(),
  step_number: z.coerce.number().int().positive(),
  required_position_id: z.coerce.number().int().positive(),
  required_unit_scope: z.string().trim().min(1).max(80),
  signature_mode: z.string().trim().min(1).max(80).default("pin_signature_image"),
  is_required: z.boolean().default(true),
  is_parallel: z.boolean().default(false),
  can_finalize_document: z.boolean().default(false),
  can_be_hidden_later: z.boolean().default(false),
  status: workflowStatusSchema.default("draft"),
  notes: optionalNullableString
});

const designerVisibilityRuleSchema = z.object({
  id: z.coerce.number().int().positive().nullable().optional(),
  forwarding_unit_type_id: z.coerce.number().int().positive().nullable().optional(),
  document_type_id: z.coerce.number().int().positive().nullable().optional(),
  visibility_policy: z.string().trim().min(1).max(80),
  show_child_signatures: z.boolean().default(true),
  show_parent_signatures: z.boolean().default(true),
  allowed: z.string().trim().min(1).max(40).default("allowed"),
  status: z.string().trim().min(1).max(40).default("draft"),
  priority: z.coerce.number().int().nonnegative().default(100),
  notes: optionalNullableString,
  conditions: z.record(z.string(), z.unknown()).optional()
});

const designerSerialRuleSchema = z.object({
  id: z.coerce.number().int().positive().nullable().optional(),
  code: z.string().trim().min(1).max(80),
  name: z.string().trim().min(1).max(140),
  format: z.string().trim().min(1).max(160).default("DOC-{YEAR}-{SEQUENCE}"),
  scope: z.enum(["global"]).default("global"),
  reset_policy: z.enum(["yearly"]).default("yearly"),
  sequence_padding: z.coerce.number().int().min(1).max(12).default(6),
  is_default: z.boolean().default(false),
  status: workflowStatusSchema.default("draft"),
  notes: optionalNullableString
});

const designerArchiveSchema = z.object({
  serialRuleIds: z.array(z.coerce.number().int().positive()).default([]),
  signatureRuleIds: z.array(z.coerce.number().int().positive()).default([]),
  visibilityRuleIds: z.array(z.coerce.number().int().positive()).default([])
}).default({ serialRuleIds: [], signatureRuleIds: [], visibilityRuleIds: [] });

const designerRuleSchema = z.object({
  archive: designerArchiveSchema,
  routingRule: createRoutingRuleSchema,
  serialRule: designerSerialRuleSchema.nullable().optional(),
  signatureRules: z.array(designerSignatureRuleSchema).default([]),
  visibilityRule: designerVisibilityRuleSchema.nullable().optional()
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

async function fetchDesignerRows(input: {
  serialRuleId: number | null;
  signatureRuleIds: number[];
  visibilityRuleId: number | null;
}) {
  let signatureRules: RowDataPacket[] = [];
  if (input.signatureRuleIds.length) {
    const placeholders = input.signatureRuleIds.map(() => "?").join(", ");
    const [rows] = await pool.execute<RowDataPacket[]>(
      `SELECT
        signature_rules.*,
        document_types.code AS documentTypeCode,
        document_types.name AS documentTypeName,
        unit_types.code AS originUnitTypeCode,
        positions.code AS requiredPositionCode,
        positions.title AS requiredPositionTitle
      FROM signature_rules
      LEFT JOIN document_types ON signature_rules.document_type_id = document_types.id
      LEFT JOIN unit_types ON signature_rules.origin_unit_type_id = unit_types.id
      LEFT JOIN positions ON signature_rules.required_position_id = positions.id
      WHERE signature_rules.id IN (${placeholders})
      ORDER BY signature_rules.step_number ASC, signature_rules.id ASC`,
      input.signatureRuleIds
    );
    signatureRules = rows;
  }

  const [visibilityRows] = input.visibilityRuleId
    ? await pool.execute<RowDataPacket[]>("SELECT * FROM visibility_rules WHERE id = ? LIMIT 1", [input.visibilityRuleId])
    : [[] as RowDataPacket[], []];
  const [serialRows] = input.serialRuleId
    ? await pool.execute<RowDataPacket[]>("SELECT * FROM serial_rules WHERE id = ? LIMIT 1", [input.serialRuleId])
    : [[] as RowDataPacket[], []];

  return {
    serialRule: serialRows[0] || null,
    signatureRules,
    visibilityRule: visibilityRows[0] || null
  };
}

async function archiveDesignerIds(
  connection: Awaited<ReturnType<typeof pool.getConnection>>,
  table: "serial_rules" | "signature_rules" | "visibility_rules",
  ids: number[]
) {
  if (!ids.length) {
    return;
  }

  const placeholders = ids.map(() => "?").join(", ");
  if (table === "serial_rules") {
    await connection.execute<ResultSetHeader>(
      `UPDATE serial_rules
       SET status = 'archived',
           is_default = FALSE,
           updated_at = CURRENT_TIMESTAMP
       WHERE id IN (${placeholders})`,
      ids
    );
    return;
  }

  await connection.execute<ResultSetHeader>(
    `UPDATE ${table}
     SET status = 'archived',
         updated_at = CURRENT_TIMESTAMP
     WHERE id IN (${placeholders})`,
    ids
  );
}

async function saveDesignerRoutingRule(
  connection: Awaited<ReturnType<typeof pool.getConnection>>,
  request: Parameters<typeof writeAuditLog>[0],
  input: z.infer<typeof designerRuleSchema>["routingRule"],
  routingRuleId?: number
) {
  if (routingRuleId) {
    const [ruleRows] = await connection.execute<RowDataPacket[]>(
      "SELECT id FROM routing_rules WHERE id = ? LIMIT 1",
      [routingRuleId]
    );
    if (!ruleRows[0]) {
      throw notFound("Routing rule");
    }

    const normalizedPatch = clean({
      ...input,
      document_type_id: input.document_type_id || null,
      from_unit_type_id: input.from_unit_type_id || null,
      from_position_id: input.from_position_id || null,
      to_unit_type_id: input.to_unit_type_id || null,
      to_position_id: input.to_position_id || null,
      activated_by_user_id: input.status === "active" ? request.session.userId || null : null,
      activated_at: input.status === "active" ? new Date() : null
    });
    const { conditions, ...rulePatch } = normalizedPatch;
    const { set, values } = updateParts(rulePatch, [
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

    await connection.execute<ResultSetHeader>(
      `UPDATE routing_rules
       SET ${set.join(", ")}, updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [...values, routingRuleId]
    );
    await connection.execute<ResultSetHeader>(
      "DELETE FROM workflow_rule_conditions WHERE routing_rule_id = ?",
      [routingRuleId]
    );
    for (const condition of input.conditions) {
      await connection.execute<ResultSetHeader>(
        `INSERT INTO workflow_rule_conditions (
          routing_rule_id, condition_key, operator, condition_value, is_required
        ) VALUES (?, ?, ?, ?, ?)`,
        [routingRuleId, condition.condition_key, condition.operator, condition.condition_value, condition.is_required]
      );
    }
    await writeAuditLog(request, { action: "admin.routing_rule.designer_update", entityType: "routing_rule", entityId: routingRuleId }, connection);
    return routingRuleId;
  }

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

  const newRoutingRuleId = Number(ruleResult.insertId);
  for (const condition of input.conditions) {
    await connection.execute<ResultSetHeader>(
      `INSERT INTO workflow_rule_conditions (
        routing_rule_id, condition_key, operator, condition_value, is_required
      ) VALUES (?, ?, ?, ?, ?)`,
      [newRoutingRuleId, condition.condition_key, condition.operator, condition.condition_value, condition.is_required]
    );
  }
  await writeAuditLog(request, { action: "admin.routing_rule.designer_create", entityType: "routing_rule", entityId: newRoutingRuleId }, connection);
  return newRoutingRuleId;
}

async function saveDesignerSignatureRules(
  connection: Awaited<ReturnType<typeof pool.getConnection>>,
  request: Parameters<typeof writeAuditLog>[0],
  input: z.infer<typeof designerRuleSchema>
) {
  if (!input.signatureRules.length) {
    return [] as number[];
  }
  if (!input.routingRule.document_type_id) {
    throw new AppError(422, "signature_document_required", "A document type is required before signature steps can be saved.");
  }

  const ids: number[] = [];
  for (const signatureRule of input.signatureRules) {
    if (signatureRule.id) {
      const [existingRows] = await connection.execute<RowDataPacket[]>(
        "SELECT id FROM signature_rules WHERE id = ? LIMIT 1",
        [signatureRule.id]
      );
      if (!existingRows[0]) {
        throw notFound("Signature rule");
      }
      await connection.execute<ResultSetHeader>(
        `UPDATE signature_rules
         SET document_type_id = ?,
             origin_unit_type_id = ?,
             step_number = ?,
             required_position_id = ?,
             required_unit_scope = ?,
             signature_mode = ?,
             is_required = ?,
             is_parallel = ?,
             can_finalize_document = ?,
             can_be_hidden_later = ?,
             status = ?,
             activated_by_user_id = ?,
             activated_at = ?,
             notes = ?,
             updated_at = CURRENT_TIMESTAMP
         WHERE id = ?`,
        [
          input.routingRule.document_type_id,
          input.routingRule.from_unit_type_id || null,
          signatureRule.step_number,
          signatureRule.required_position_id,
          signatureRule.required_unit_scope,
          signatureRule.signature_mode,
          signatureRule.is_required,
          signatureRule.is_parallel,
          signatureRule.can_finalize_document,
          signatureRule.can_be_hidden_later,
          signatureRule.status,
          signatureRule.status === "active" ? request.session.userId || null : null,
          signatureRule.status === "active" ? new Date() : null,
          signatureRule.notes || null,
          signatureRule.id
        ]
      );
      await writeAuditLog(request, { action: "admin.signature_rule.designer_update", entityType: "signature_rule", entityId: signatureRule.id }, connection);
      ids.push(signatureRule.id);
    } else {
      const [result] = await connection.execute<ResultSetHeader>(
        `INSERT INTO signature_rules (
          uuid, document_type_id, origin_unit_type_id, step_number,
          required_position_id, required_unit_scope, signature_mode,
          is_required, is_parallel, can_finalize_document, can_be_hidden_later,
          status, activated_by_user_id, activated_at, notes
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          uuid(),
          input.routingRule.document_type_id,
          input.routingRule.from_unit_type_id || null,
          signatureRule.step_number,
          signatureRule.required_position_id,
          signatureRule.required_unit_scope,
          signatureRule.signature_mode,
          signatureRule.is_required,
          signatureRule.is_parallel,
          signatureRule.can_finalize_document,
          signatureRule.can_be_hidden_later,
          signatureRule.status,
          signatureRule.status === "active" ? request.session.userId || null : null,
          signatureRule.status === "active" ? new Date() : null,
          signatureRule.notes || null
        ]
      );
      const id = Number(result.insertId);
      await writeAuditLog(request, { action: "admin.signature_rule.designer_create", entityType: "signature_rule", entityId: id }, connection);
      ids.push(id);
    }
  }

  return ids;
}

async function saveDesignerVisibilityRule(
  connection: Awaited<ReturnType<typeof pool.getConnection>>,
  request: Parameters<typeof writeAuditLog>[0],
  input: z.infer<typeof designerRuleSchema>
) {
  const visibilityRule = input.visibilityRule;
  if (!visibilityRule) {
    return null;
  }

  const documentTypeId = visibilityRule.document_type_id === undefined
    ? input.routingRule.document_type_id || null
    : visibilityRule.document_type_id || null;
  const forwardingUnitTypeId = visibilityRule.forwarding_unit_type_id === undefined
    ? input.routingRule.from_unit_type_id || null
    : visibilityRule.forwarding_unit_type_id || null;
  const conditions = JSON.stringify(visibilityRule.conditions || {});

  if (visibilityRule.id) {
    const [existingRows] = await connection.execute<RowDataPacket[]>(
      "SELECT id FROM visibility_rules WHERE id = ? LIMIT 1",
      [visibilityRule.id]
    );
    if (!existingRows[0]) {
      throw notFound("Visibility rule");
    }
    await connection.execute<ResultSetHeader>(
      `UPDATE visibility_rules
       SET forwarding_unit_type_id = ?,
           document_type_id = ?,
           visibility_policy = ?,
           show_child_signatures = ?,
           show_parent_signatures = ?,
           allowed = ?,
           status = ?,
           priority = ?,
           activated_by_user_id = ?,
           activated_at = ?,
           notes = ?,
           conditions = ?,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [
        forwardingUnitTypeId,
        documentTypeId,
        visibilityRule.visibility_policy,
        visibilityRule.show_child_signatures,
        visibilityRule.show_parent_signatures,
        visibilityRule.allowed,
        visibilityRule.status,
        visibilityRule.priority,
        visibilityRule.status === "active" ? request.session.userId || null : null,
        visibilityRule.status === "active" ? new Date() : null,
        visibilityRule.notes || null,
        conditions,
        visibilityRule.id
      ]
    );
    await writeAuditLog(request, { action: "admin.visibility_rule.designer_update", entityType: "visibility_rule", entityId: visibilityRule.id }, connection);
    return visibilityRule.id;
  }

  const [result] = await connection.execute<ResultSetHeader>(
    `INSERT INTO visibility_rules (
      uuid, forwarding_unit_type_id, document_type_id, visibility_policy,
      show_child_signatures, show_parent_signatures, allowed, status, priority,
      activated_by_user_id, activated_at, notes, conditions
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      uuid(),
      forwardingUnitTypeId,
      documentTypeId,
      visibilityRule.visibility_policy,
      visibilityRule.show_child_signatures,
      visibilityRule.show_parent_signatures,
      visibilityRule.allowed,
      visibilityRule.status,
      visibilityRule.priority,
      visibilityRule.status === "active" ? request.session.userId || null : null,
      visibilityRule.status === "active" ? new Date() : null,
      visibilityRule.notes || null,
      conditions
    ]
  );
  const id = Number(result.insertId);
  await writeAuditLog(request, { action: "admin.visibility_rule.designer_create", entityType: "visibility_rule", entityId: id }, connection);
  return id;
}

async function saveDesignerSerialRule(
  connection: Awaited<ReturnType<typeof pool.getConnection>>,
  request: Parameters<typeof writeAuditLog>[0],
  input: z.infer<typeof designerRuleSchema>
) {
  const serialRule = input.serialRule;
  if (!serialRule) {
    return null;
  }

  if (serialRule.is_default) {
    await connection.execute<ResultSetHeader>(
      "UPDATE serial_rules SET is_default = FALSE, updated_at = CURRENT_TIMESTAMP WHERE is_default = TRUE"
    );
  }

  if (serialRule.id) {
    const [existingRows] = await connection.execute<RowDataPacket[]>(
      "SELECT id FROM serial_rules WHERE id = ? LIMIT 1",
      [serialRule.id]
    );
    if (!existingRows[0]) {
      throw notFound("Serial rule");
    }
    await connection.execute<ResultSetHeader>(
      `UPDATE serial_rules
       SET code = ?,
           name = ?,
           format = ?,
           scope = ?,
           reset_policy = ?,
           sequence_padding = ?,
           is_default = ?,
           status = ?,
           activated_by_user_id = ?,
           activated_at = ?,
           notes = ?,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [
        serialRule.code,
        serialRule.name,
        serialRule.format,
        serialRule.scope,
        serialRule.reset_policy,
        serialRule.sequence_padding,
        serialRule.is_default,
        serialRule.status,
        serialRule.status === "active" ? request.session.userId || null : null,
        serialRule.status === "active" ? new Date() : null,
        serialRule.notes || null,
        serialRule.id
      ]
    );
    await writeAuditLog(request, { action: "admin.serial_rule.designer_update", entityType: "serial_rule", entityId: serialRule.id }, connection);
    return serialRule.id;
  }

  const [result] = await connection.execute<ResultSetHeader>(
    `INSERT INTO serial_rules (
      uuid, code, name, format, scope, reset_policy, sequence_padding,
      is_default, status, activated_by_user_id, activated_at, notes
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      uuid(),
      serialRule.code,
      serialRule.name,
      serialRule.format,
      serialRule.scope,
      serialRule.reset_policy,
      serialRule.sequence_padding,
      serialRule.is_default,
      serialRule.status,
      serialRule.status === "active" ? request.session.userId || null : null,
      serialRule.status === "active" ? new Date() : null,
      serialRule.notes || null
    ]
  );
  const id = Number(result.insertId);
  await writeAuditLog(request, { action: "admin.serial_rule.designer_create", entityType: "serial_rule", entityId: id }, connection);
  return id;
}

async function persistDesignerRule(request: Request, routingRuleId?: number) {
  const input = designerRuleSchema.parse(request.body);
  let savedRoutingRuleId = routingRuleId || 0;
  let savedSignatureRuleIds: number[] = [];
  let savedVisibilityRuleId: number | null = null;
  let savedSerialRuleId: number | null = null;

  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    savedRoutingRuleId = await saveDesignerRoutingRule(connection, request, input.routingRule, routingRuleId);

    await archiveDesignerIds(connection, "signature_rules", input.archive.signatureRuleIds);
    for (const id of input.archive.signatureRuleIds) {
      await writeAuditLog(request, { action: "admin.signature_rule.designer_archive", entityType: "signature_rule", entityId: id }, connection);
    }

    await archiveDesignerIds(connection, "visibility_rules", input.archive.visibilityRuleIds);
    for (const id of input.archive.visibilityRuleIds) {
      await writeAuditLog(request, { action: "admin.visibility_rule.designer_archive", entityType: "visibility_rule", entityId: id }, connection);
    }

    await archiveDesignerIds(connection, "serial_rules", input.archive.serialRuleIds);
    for (const id of input.archive.serialRuleIds) {
      await writeAuditLog(request, { action: "admin.serial_rule.designer_archive", entityType: "serial_rule", entityId: id }, connection);
    }

    savedSignatureRuleIds = await saveDesignerSignatureRules(connection, request, input);
    savedVisibilityRuleId = await saveDesignerVisibilityRule(connection, request, input);
    savedSerialRuleId = await saveDesignerSerialRule(connection, request, input);
    await writeAuditLog(request, {
      action: "admin.routing_rule.designer_save",
      entityType: "routing_rule",
      entityId: savedRoutingRuleId,
      metadata: {
        archivedSerialRules: input.archive.serialRuleIds.length,
        archivedSignatureRules: input.archive.signatureRuleIds.length,
        archivedVisibilityRules: input.archive.visibilityRuleIds.length,
        serialRuleId: savedSerialRuleId,
        signatureRuleIds: savedSignatureRuleIds,
        visibilityRuleId: savedVisibilityRuleId
      }
    }, connection);
    await connection.commit();
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }

  const supportRows = await fetchDesignerRows({
    serialRuleId: savedSerialRuleId,
    signatureRuleIds: savedSignatureRuleIds,
    visibilityRuleId: savedVisibilityRuleId
  });

  return {
    archived: input.archive,
    routingRule: await getRoutingRuleDetail(savedRoutingRuleId),
    ...supportRows
  };
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

routingRuleRouter.post("/designer", asyncHandler(async (request, response) => {
  created(response, await persistDesignerRule(request));
}));

routingRuleRouter.put("/designer/:routingRuleId", asyncHandler(async (request, response) => {
  const { routingRuleId } = z.object({ routingRuleId: z.coerce.number().int().positive() }).parse(request.params);
  ok(response, await persistDesignerRule(request, routingRuleId));
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

routingRuleRouter.delete("/:routingRuleId", asyncHandler(async (request, response) => {
  const { routingRuleId } = z.object({ routingRuleId: z.coerce.number().int().positive() }).parse(request.params);

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
     SET status = 'archived',
         updated_at = CURRENT_TIMESTAMP
     WHERE id = ?`,
    [routingRuleId]
  );

  await writeAuditLog(request, {
    action: "admin.routing_rule.archive",
    entityType: "routing_rule",
    entityId: routingRuleId
  });

  ok(response, { id: routingRuleId, archived: true });
}));
