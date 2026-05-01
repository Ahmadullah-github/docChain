import type { Request, Response } from "express";
import type { ResultSetHeader, RowDataPacket } from "mysql2/promise";
import { z } from "zod";
import { pool } from "../../db/mysql";
import type { Database } from "../../db/mysql";
import { writeAuditLog } from "../../shared/audit";
import { assertDocumentAccess, isAdmin } from "../../shared/document-access";
import { AppError, forbidden, notFound } from "../../shared/errors";
import { uuid } from "../../shared/ids";
import { optionalNullableString } from "../../shared/route-utils";

export const workflowActionInputSchema = z.object({
  action: z.string().trim().min(1).max(80),
  to_unit_id: z.coerce.number().int().positive().nullable().optional(),
  to_assignment_id: z.coerce.number().int().positive().nullable().optional(),
  to_position_id: z.coerce.number().int().positive().nullable().optional(),
  routing_rule_id: z.coerce.number().int().positive().nullable().optional(),
  to_status: z.string().trim().min(1).max(60).nullable().optional(),
  note: optionalNullableString,
  return_reason: optionalNullableString,
  create_task: z.boolean().default(true),
  task_title: optionalNullableString,
  due_at: z.coerce.date().nullable().optional(),
  payload: z.record(z.string(), z.unknown()).optional()
});

type WorkflowActionInput = z.infer<typeof workflowActionInputSchema>;

type TargetContext = {
  unitId: number;
  unitTypeId: number;
  positionId: number | null;
  assignmentId: number | null;
};

type RuleContext = {
  document: Record<string, any>;
  assignment: {
    id: number;
    unitId: number;
    unitTypeId: number;
    positionId: number;
  };
  target: TargetContext;
};

const terminalStatuses = new Set(["closed", "archived"]);

function defaultStatusForAction(action: string, currentStatus: string) {
  const statusByAction: Record<string, string> = {
    submit: "submitted",
    submit_for_review: "submitted",
    review: "under_review",
    return_for_correction: "draft",
    forward: "under_action",
    forward_for_signature: "pending_signatures",
    forward_for_final_signature: "pending_final_signature",
    refer: "under_action",
    dispatch: "dispatched",
    dispatch_reply: "dispatched",
    dispatch_multi: "dispatched",
    receive: "received",
    acknowledge: "under_action",
    close: "closed",
    archive: "archived"
  };

  return statusByAction[action] || currentStatus;
}

function normalizeDate(value: unknown) {
  return value instanceof Date ? value : value ? new Date(String(value)) : null;
}

async function getUnitContext(unitId: number, connection: Database = pool) {
  const [rows] = await connection.execute<RowDataPacket[]>(
    `SELECT units.id, units.unit_type_id AS unitTypeId, unit_types.code AS unitTypeCode
     FROM units
     INNER JOIN unit_types ON units.unit_type_id = unit_types.id
     WHERE units.id = ?
       AND units.status = 'active'
       AND units.deleted_at IS NULL
     LIMIT 1`,
    [unitId]
  );
  const unit = rows[0];

  if (!unit) {
    throw new AppError(422, "invalid_target_unit", "Selected target unit does not exist or is inactive.");
  }

  return {
    unitId: Number(unit.id),
    unitTypeId: Number(unit.unitTypeId)
  };
}

async function resolveTarget(input: WorkflowActionInput, document: Record<string, any>, connection: Database = pool): Promise<TargetContext> {
  if (input.to_assignment_id) {
    const [rows] = await connection.execute<RowDataPacket[]>(
      `SELECT
        assignments.id,
        assignments.unit_id AS unitId,
        assignments.position_id AS positionId,
        units.unit_type_id AS unitTypeId
      FROM assignments
      INNER JOIN units ON assignments.unit_id = units.id
      WHERE assignments.id = ?
        AND assignments.status = 'active'
        AND assignments.deleted_at IS NULL
      LIMIT 1`,
      [input.to_assignment_id]
    );
    const assignment = rows[0];

    if (!assignment) {
      throw new AppError(422, "invalid_target_assignment", "Selected target assignment does not exist or is inactive.");
    }

    return {
      unitId: Number(assignment.unitId),
      unitTypeId: Number(assignment.unitTypeId),
      positionId: Number(assignment.positionId),
      assignmentId: Number(assignment.id)
    };
  }

  const fallbackUnitId = input.action === "return_for_correction"
    ? Number(document.origin_unit_id)
    : Number(document.current_holder_unit_id);
  const targetUnit = await getUnitContext(input.to_unit_id || fallbackUnitId, connection);

  if (input.to_position_id) {
    const [rows] = await connection.execute<RowDataPacket[]>(
      `SELECT id
       FROM positions
       WHERE id = ? AND status = 'active' AND deleted_at IS NULL
       LIMIT 1`,
      [input.to_position_id]
    );
    const position = rows[0];

    if (!position) {
      throw new AppError(422, "invalid_target_position", "Selected target position does not exist or is inactive.");
    }
  }

  return {
    ...targetUnit,
    positionId: input.to_position_id || null,
    assignmentId: null
  };
}

function compareCondition(actual: unknown, operator: string, expected: string) {
  const actualValue = actual == null ? "" : String(actual);
  const expectedValues = expected.split(",").map((value) => value.trim()).filter(Boolean);

  switch (operator) {
    case "equals":
      return actualValue === expected;
    case "not_equals":
      return actualValue !== expected;
    case "in":
      return expectedValues.includes(actualValue);
    case "not_in":
      return !expectedValues.includes(actualValue);
    default:
      return false;
  }
}

function conditionValue(conditionKey: string, context: RuleContext) {
  const values: Record<string, unknown> = {
    "document.status": context.document.status,
    document_status: context.document.status,
    "document.document_type_id": context.document.document_type_id,
    document_type_id: context.document.document_type_id,
    "document.confidentiality_level_id": context.document.confidentiality_level_id,
    confidentiality_level_id: context.document.confidentiality_level_id,
    "document.priority_level_id": context.document.priority_level_id,
    priority_level_id: context.document.priority_level_id,
    "document.origin_unit_id": context.document.origin_unit_id,
    origin_unit_id: context.document.origin_unit_id,
    "document.owner_unit_id": context.document.owner_unit_id,
    owner_unit_id: context.document.owner_unit_id,
    "document.current_holder_unit_id": context.document.current_holder_unit_id,
    current_holder_unit_id: context.document.current_holder_unit_id,
    "actor.assignment_id": context.assignment.id,
    actor_assignment_id: context.assignment.id,
    "actor.unit_id": context.assignment.unitId,
    actor_unit_id: context.assignment.unitId,
    "actor.unit_type_id": context.assignment.unitTypeId,
    actor_unit_type_id: context.assignment.unitTypeId,
    "actor.position_id": context.assignment.positionId,
    actor_position_id: context.assignment.positionId,
    "target.unit_id": context.target.unitId,
    target_unit_id: context.target.unitId,
    "target.unit_type_id": context.target.unitTypeId,
    target_unit_type_id: context.target.unitTypeId,
    "target.position_id": context.target.positionId,
    target_position_id: context.target.positionId,
    "target.assignment_id": context.target.assignmentId
  };

  return values[conditionKey];
}

async function ruleConditionsPass(ruleId: number, context: RuleContext, connection: Database = pool) {
  const [conditions] = await connection.execute<RowDataPacket[]>(
    `SELECT *
     FROM workflow_rule_conditions
     WHERE routing_rule_id = ?
     ORDER BY id ASC`,
    [ruleId]
  );

  for (const condition of conditions) {
    const passed = compareCondition(
      conditionValue(String(condition.condition_key), context),
      String(condition.operator),
      String(condition.condition_value)
    );

    if (condition.is_required && !passed) {
      return false;
    }
  }

  return true;
}

async function findRoutingRule(input: WorkflowActionInput, context: RuleContext, response: Response, connection: Database = pool) {
  const now = new Date();
  const where = [
    "status = 'active'",
    "action = ?",
    "(document_type_id IS NULL OR document_type_id = ?)",
    "(from_unit_type_id IS NULL OR from_unit_type_id = ?)",
    "(from_position_id IS NULL OR from_position_id = ?)",
    "(to_unit_type_id IS NULL OR to_unit_type_id = ?)",
    "(to_position_id IS NULL OR to_position_id = ?)",
    "(effective_from IS NULL OR effective_from <= ?)",
    "(effective_until IS NULL OR effective_until >= ?)"
  ];
  const params: any[] = [
    input.action,
    context.document.document_type_id,
    context.assignment.unitTypeId,
    context.assignment.positionId,
    context.target.unitTypeId,
    context.target.positionId,
    now,
    now
  ];

  if (input.routing_rule_id) {
    where.push("id = ?");
    params.push(input.routing_rule_id);
  }

  const [rules] = await connection.execute<RowDataPacket[]>(
    `SELECT *
     FROM routing_rules
     WHERE ${where.join(" AND ")}
     ORDER BY priority ASC, id DESC`,
    params
  );

  for (const rule of rules) {
    if (await ruleConditionsPass(Number(rule.id), context, connection)) {
      if (rule.allowed === "denied") {
        throw forbidden();
      }

      if (rule.allowed === "emergency_only" && !isAdmin(response)) {
        throw new AppError(403, "emergency_only_route", "This workflow route requires an admin emergency override.");
      }

      return rule;
    }
  }

  throw new AppError(422, "routing_rule_not_found", "No active routing rule allows this workflow action for the selected source and target.");
}

async function enforcePriorRequirements(rule: Record<string, any>, documentId: number, connection: Database = pool) {
  if (rule.prior_review_required) {
    const [reviewRows] = await connection.execute<RowDataPacket[]>(
      `SELECT id
       FROM document_workflow_events
       WHERE document_id = ? AND action = 'review'
       LIMIT 1`,
      [documentId]
    );
    const review = reviewRows[0];

    if (!review) {
      throw new AppError(409, "prior_review_required", "This route requires a prior review event.");
    }
  }

  if (rule.prior_signature_required) {
    const [pendingRequiredSlots] = await connection.execute<RowDataPacket[]>(
      `SELECT COUNT(*) AS count
       FROM signature_slots
       WHERE document_id = ?
         AND is_required = TRUE
         AND status <> 'completed'`,
      [documentId]
    );
    const pendingCount = Number(pendingRequiredSlots[0]?.count || 0);
    const [signatureRows] = await connection.execute<RowDataPacket[]>(
      "SELECT id FROM signature_events WHERE document_id = ? LIMIT 1",
      [documentId]
    );
    const signature = signatureRows[0];

    if (pendingCount > 0 || !signature) {
      throw new AppError(409, "prior_signature_required", "This route requires document signatures before the action is allowed.");
    }
  }
}

async function completeActorTasks(documentId: number, assignment: RuleContext["assignment"], connection: Database) {
  await connection.execute<ResultSetHeader>(
    `UPDATE document_tasks
     SET status = 'completed',
         completed_by_assignment_id = ?,
         completed_at = CURRENT_TIMESTAMP,
         completion_note = 'Completed by workflow action.',
         updated_at = CURRENT_TIMESTAMP
     WHERE document_id = ?
       AND status = 'open'
       AND deleted_at IS NULL
       AND (
         assigned_assignment_id = ?
         OR (
           assigned_unit_id = ?
           AND (assigned_position_id IS NULL OR assigned_position_id = ?)
         )
       )`,
    [assignment.id, documentId, assignment.id, assignment.unitId, assignment.positionId]
  );
}

async function createTargetTask(
  documentId: number,
  eventId: number,
  input: WorkflowActionInput,
  assignment: RuleContext["assignment"],
  target: TargetContext,
  connection: Database
) {
  if (!input.create_task || ["close", "archive"].includes(input.action)) {
    return;
  }

  const shouldCreate = target.assignmentId
    || target.unitId !== assignment.unitId
    || target.positionId;

  if (!shouldCreate) {
    return;
  }

  await connection.execute<ResultSetHeader>(
    `INSERT INTO document_tasks (
      uuid, document_id, workflow_event_id, created_by_assignment_id,
      assigned_unit_id, assigned_position_id, assigned_assignment_id,
      task_type, status, title, description, due_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      uuid(),
      documentId,
      eventId,
      assignment.id,
      target.unitId,
      target.positionId,
      target.assignmentId,
      input.action,
      "open",
      input.task_title || `Workflow action: ${input.action}`,
      input.note || null,
      input.due_at || null
    ]
  );
}

export async function listAllowedWorkflowActions(documentId: number, request: Request, response: Response) {
  const { document, assignment } = await assertDocumentAccess(documentId, request, response);

  const now = new Date();
  const where = [
    "routing_rules.status = 'active'",
    "routing_rules.allowed <> 'denied'",
    "(routing_rules.document_type_id IS NULL OR routing_rules.document_type_id = ?)",
    "(routing_rules.from_unit_type_id IS NULL OR routing_rules.from_unit_type_id = ?)",
    "(routing_rules.from_position_id IS NULL OR routing_rules.from_position_id = ?)",
    "(routing_rules.effective_from IS NULL OR routing_rules.effective_from <= ?)",
    "(routing_rules.effective_until IS NULL OR routing_rules.effective_until >= ?)"
  ];
  const params: any[] = [
    document.document_type_id,
    assignment.unitTypeId,
    assignment.positionId,
    now,
    now
  ];
  if (!isAdmin(response)) {
    where.push("routing_rules.allowed <> 'emergency_only'");
  }

  const [rows] = await pool.execute<RowDataPacket[]>(
    `SELECT
      routing_rules.*,
      to_unit_types.code AS toUnitTypeCode,
      to_unit_types.name AS toUnitTypeName,
      to_positions.code AS toPositionCode,
      to_positions.title AS toPositionTitle
    FROM routing_rules
    LEFT JOIN unit_types AS to_unit_types ON routing_rules.to_unit_type_id = to_unit_types.id
    LEFT JOIN positions AS to_positions ON routing_rules.to_position_id = to_positions.id
    WHERE ${where.join(" AND ")}
    ORDER BY routing_rules.priority ASC, routing_rules.id DESC`,
    params
  );

  return rows.map((rule: Record<string, any>) => ({
    id: Number(rule.id),
    action: rule.action,
    allowed: rule.allowed,
    priority: Number(rule.priority),
    requiresTargetUnitTypeId: rule.to_unit_type_id ? Number(rule.to_unit_type_id) : null,
    requiresTargetUnitTypeCode: rule.toUnitTypeCode || null,
    requiresTargetPositionId: rule.to_position_id ? Number(rule.to_position_id) : null,
    requiresTargetPositionCode: rule.toPositionCode || null,
    priorReviewRequired: Boolean(rule.prior_review_required),
    priorSignatureRequired: Boolean(rule.prior_signature_required),
    isExternalTarget: Boolean(rule.is_external_target),
    isMultiRecipient: Boolean(rule.is_multi_recipient),
    notes: rule.notes || null
  }));
}

export async function executeWorkflowAction(documentId: number, input: WorkflowActionInput, request: Request, response: Response) {
  const { document, assignment } = await assertDocumentAccess(documentId, request, response);

  if (terminalStatuses.has(String(document.status))) {
    throw new AppError(409, "document_terminal_status", "Closed or archived documents cannot move through workflow.");
  }

  if (!isAdmin(response) && Number(document.current_holder_unit_id) !== assignment.unitId) {
    throw new AppError(403, "not_current_holder", "Only the current holder unit can perform workflow actions for this document.");
  }

  let eventId = 0;

  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const target = await resolveTarget(input, document, connection);
    const context = { document, assignment, target };
    const rule = await findRoutingRule(input, context, response, connection);
    await enforcePriorRequirements(rule, documentId, connection);

    const nextStatus = input.to_status || defaultStatusForAction(input.action, String(document.status));
    const [eventResult] = await connection.execute<ResultSetHeader>(
      `INSERT INTO document_workflow_events (
        uuid, document_id, actor_assignment_id, routing_rule_id, action,
        from_status, to_status, from_unit_id, to_unit_id, note,
        return_reason, payload
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        uuid(),
        documentId,
        assignment.id,
        rule.id,
        input.action,
        document.status,
        nextStatus,
        document.current_holder_unit_id,
        target.unitId,
        input.note || null,
        input.return_reason || null,
        JSON.stringify({
          ...(input.payload || {}),
          routingRuleId: rule.id,
          targetAssignmentId: target.assignmentId,
          targetPositionId: target.positionId
        })
      ]
    );
    const createdEventId = eventResult.insertId;
    eventId = Number(createdEventId);

    const set = ["status = ?", "current_holder_unit_id = ?", "updated_at = CURRENT_TIMESTAMP"];
    const values: any[] = [nextStatus, target.unitId];

    if (input.action === "archive") {
      set.push("archived_at = CURRENT_TIMESTAMP", "archived_by_assignment_id = ?", "archive_reason = ?");
      values.push(assignment.id, input.note || input.return_reason || null);
    }

    if (input.action === "close") {
      set.push("closed_at = CURRENT_TIMESTAMP");
    }

    await connection.execute<ResultSetHeader>(
      `UPDATE documents SET ${set.join(", ")} WHERE id = ?`,
      [...values, documentId]
    );
    await completeActorTasks(documentId, assignment, connection);
    await createTargetTask(documentId, eventId, input, assignment, target, connection);
    await writeAuditLog(request, {
      action: `document.workflow.${input.action}`,
      entityType: "document",
      entityId: documentId,
      metadata: { routingRuleId: rule.id, eventId }
    }, connection);
    await connection.commit();
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }

  const [eventRows] = await pool.execute<RowDataPacket[]>(
    "SELECT * FROM document_workflow_events WHERE id = ? LIMIT 1",
    [eventId]
  );
  const event = eventRows[0];
  if (!event) {
    throw notFound("Workflow event");
  }

  return event;
}
