import { Router } from "express";
import type { RowDataPacket } from "mysql2/promise";
import { z } from "zod";
import { pool } from "../../db/mysql";
import { requireAuth } from "../../middleware/auth";
import { asyncHandler } from "../../shared/async-handler";
import { getActiveAssignment, isAdmin } from "../../shared/document-access";
import { listDocumentWritePermissions } from "../../shared/document-write-rules";
import { ok } from "../../shared/http";

export const workspaceRouter = Router();

workspaceRouter.use(requireAuth);

const workItemsQuerySchema = z.object({
  type: z.enum(["tasks", "unit", "signatures", "notifications", "activity", "all"]).default("all"),
  limit: z.coerce.number().int().min(1).max(100).default(30)
});

const targetsQuerySchema = z.object({
  document_id: z.coerce.number().int().positive().optional(),
  action: z.string().trim().min(1).max(80).optional(),
  q: z.string().trim().max(120).optional()
});

const transmissionTargetsQuerySchema = z.object({
  q: z.string().trim().max(120).optional(),
  limit: z.coerce.number().int().min(1).max(50).default(25)
});

function like(value?: string) {
  return `%${value || ""}%`;
}

function userDocumentAccessWhere(userAssignmentIds: number[]) {
  const placeholders = userAssignmentIds.length ? userAssignmentIds.map(() => "?").join(", ") : "NULL";
  return {
    sql: `(
      documents.creator_assignment_id IN (${placeholders})
      OR documents.origin_unit_id = ?
      OR documents.owner_unit_id = ?
      OR documents.current_holder_unit_id = ?
    )`,
    placeholders
  };
}

async function assignmentIdsForPerson(personId: number) {
  const [rows] = await pool.execute<RowDataPacket[]>(
    "SELECT id FROM assignments WHERE person_id = ? AND deleted_at IS NULL",
    [personId]
  );
  return rows.map((row) => Number(row.id));
}

workspaceRouter.get("/reference", asyncHandler(async (request, response) => {
  const authUser = response.locals.authUser!;
  const assignment = await getActiveAssignment(request, "loading document reference data");
  const [documentTypes, confidentialityLevels, priorityLevels] = await Promise.all([
    pool.execute<RowDataPacket[]>(
      `SELECT id, uuid, code, name, description, requires_serial, status
       FROM document_types
       WHERE status = 'active'
       ORDER BY name ASC`
    ).then(([rows]) => rows),
    pool.execute<RowDataPacket[]>(
      `SELECT id, uuid, code, name, rank, is_default, requires_access_log, description, status
       FROM confidentiality_levels
       WHERE status = 'active'
       ORDER BY rank ASC, name ASC`
    ).then(([rows]) => rows),
    pool.execute<RowDataPacket[]>(
      `SELECT id, uuid, code, name, rank, is_default, default_due_days, color, description, status
       FROM priority_levels
       WHERE status = 'active'
       ORDER BY rank ASC, name ASC`
    ).then(([rows]) => rows)
  ]);
  const permissions = isAdmin(response)
    ? documentTypes.map((documentType) => ({
      documentTypeId: Number(documentType.id),
      documentTypeCode: String(documentType.code),
      documentTypeName: String(documentType.name),
      mode: "free",
      ruleId: 0
    }))
    : await listDocumentWritePermissions(assignment, authUser.roles);
  const writableDocumentTypeIds = new Set(permissions.map((permission) => permission.documentTypeId));
  const writableDocumentTypes = isAdmin(response)
    ? documentTypes
    : documentTypes.filter((documentType) => writableDocumentTypeIds.has(Number(documentType.id)));
  const headerLines = [
    assignment.positionTitle,
    assignment.unitName
  ].filter(Boolean).join("\n");

  ok(response, {
    documentTypes: writableDocumentTypes,
    confidentialityLevels,
    documentWritePermissions: permissions,
    priorityLevels,
    templateFieldDefaults: {
      header_unit: headerLines
    }
  });
}));

workspaceRouter.get("/summary", asyncHandler(async (request, response) => {
  const authUser = response.locals.authUser!;
  const assignment = await getActiveAssignment(request, "loading the workspace");
  const userAssignmentIds = await assignmentIdsForPerson(assignment.personId);
  const access = userDocumentAccessWhere(userAssignmentIds);

  const [myTasksRows, unitRows, signatureRows, notificationRows, draftRows] = await Promise.all([
    pool.execute<RowDataPacket[]>(
      `SELECT COUNT(*) AS count
       FROM document_tasks
       INNER JOIN documents ON document_tasks.document_id = documents.id
       WHERE document_tasks.status = 'open'
         AND document_tasks.deleted_at IS NULL
         AND documents.deleted_at IS NULL
         AND (
           document_tasks.assigned_assignment_id = ?
           OR (
             document_tasks.assigned_unit_id = ?
             AND (document_tasks.assigned_position_id IS NULL OR document_tasks.assigned_position_id = ?)
           )
         )`,
      [assignment.id, assignment.unitId, assignment.positionId]
    ),
    pool.execute<RowDataPacket[]>(
      `SELECT COUNT(*) AS count
       FROM document_tasks
       INNER JOIN documents ON document_tasks.document_id = documents.id
       WHERE document_tasks.status = 'open'
         AND document_tasks.deleted_at IS NULL
         AND documents.deleted_at IS NULL
         AND document_tasks.assigned_assignment_id IS NULL
         AND document_tasks.assigned_unit_id = ?
         AND (document_tasks.assigned_position_id IS NULL OR document_tasks.assigned_position_id = ?)`,
      [assignment.unitId, assignment.positionId]
    ),
    pool.execute<RowDataPacket[]>(
      `SELECT COUNT(*) AS count
       FROM document_tasks
       INNER JOIN documents ON document_tasks.document_id = documents.id
       WHERE document_tasks.status = 'open'
         AND document_tasks.deleted_at IS NULL
         AND (document_tasks.required_action = 'sign' OR document_tasks.can_sign = TRUE)
         AND (
           document_tasks.assigned_assignment_id = ?
           OR (
             document_tasks.assigned_unit_id = ?
             AND (document_tasks.assigned_position_id IS NULL OR document_tasks.assigned_position_id = ?)
           )
         )
         AND documents.deleted_at IS NULL
         AND ${access.sql}`,
      [assignment.id, assignment.unitId, assignment.positionId, ...userAssignmentIds, assignment.unitId, assignment.unitId, assignment.unitId]
    ),
    pool.execute<RowDataPacket[]>(
      `SELECT COUNT(*) AS count
       FROM notifications
       WHERE recipient_user_id = ?
         AND status <> 'read'`,
      [authUser.id]
    ),
    pool.execute<RowDataPacket[]>(
      `SELECT COUNT(*) AS count
       FROM documents
       WHERE deleted_at IS NULL
         AND status = 'draft'
         AND creator_assignment_id IN (${userAssignmentIds.length ? userAssignmentIds.map(() => "?").join(", ") : "NULL"})`,
      userAssignmentIds
    )
  ]);

  ok(response, {
    myTasks: Number(myTasksRows[0][0]?.count || 0),
    unitQueue: Number(unitRows[0][0]?.count || 0),
    signatureQueue: Number(signatureRows[0][0]?.count || 0),
    unreadNotifications: Number(notificationRows[0][0]?.count || 0),
    drafts: Number(draftRows[0][0]?.count || 0)
  });
}));

workspaceRouter.get("/work-items", asyncHandler(async (request, response) => {
  const authUser = response.locals.authUser!;
  const query = workItemsQuerySchema.parse(request.query);
  const assignment = await getActiveAssignment(request, "loading work items");
  const userAssignmentIds = await assignmentIdsForPerson(assignment.personId);
  const access = userDocumentAccessWhere(userAssignmentIds);
  const limit = query.limit;
  const includeAll = query.type === "all";

  if (includeAll) {
    const [rows] = await pool.execute<RowDataPacket[]>(
      `SELECT
        CASE
          WHEN document_tasks.required_action = 'sign' OR document_tasks.can_sign = TRUE THEN 'signature'
          WHEN document_tasks.assigned_assignment_id IS NULL THEN 'unit_document'
          ELSE 'task'
        END AS itemType,
        document_tasks.id AS id,
        document_tasks.title AS title,
        document_tasks.description AS subtitle,
        document_tasks.status AS status,
        document_tasks.required_action AS requiredAction,
        document_tasks.can_review AS canReview,
        document_tasks.can_edit AS canEdit,
        document_tasks.can_sign AS canSign,
        document_tasks.can_forward AS canForward,
        document_tasks.can_finalize AS canFinalize,
        document_tasks.can_archive AS canArchive,
        document_tasks.due_at AS dueAt,
        document_tasks.created_at AS createdAt,
        documents.id AS documentId,
        documents.subject AS documentSubject,
        documents.internal_reference AS internalReference,
        documents.official_serial AS officialSerial,
        document_types.name AS documentTypeName,
        priority_levels.name AS priorityName,
        holder_units.name AS holderUnitName,
        positions.title AS assignedPositionTitle
       FROM document_tasks
       INNER JOIN documents ON document_tasks.document_id = documents.id
       INNER JOIN document_types ON documents.document_type_id = document_types.id
       INNER JOIN priority_levels ON documents.priority_level_id = priority_levels.id
       INNER JOIN units AS holder_units ON documents.current_holder_unit_id = holder_units.id
       LEFT JOIN positions ON document_tasks.assigned_position_id = positions.id
       WHERE document_tasks.status = 'open'
         AND document_tasks.deleted_at IS NULL
         AND documents.deleted_at IS NULL
         AND (
           document_tasks.assigned_assignment_id = ?
           OR (
             document_tasks.assigned_unit_id = ?
             AND (document_tasks.assigned_position_id IS NULL OR document_tasks.assigned_position_id = ?)
           )
         )
       ORDER BY COALESCE(document_tasks.due_at, document_tasks.created_at) ASC
       LIMIT ?`,
      [assignment.id, assignment.unitId, assignment.positionId, limit]
    );

    ok(response, rows);
    return;
  }

  const requests: Array<Promise<RowDataPacket[]>> = [];

  if (query.type === "tasks") {
    requests.push(pool.execute<RowDataPacket[]>(
      `SELECT
        'task' AS itemType,
        document_tasks.id AS id,
        document_tasks.title AS title,
        document_tasks.description AS subtitle,
        document_tasks.status AS status,
        document_tasks.required_action AS requiredAction,
        document_tasks.can_review AS canReview,
        document_tasks.can_edit AS canEdit,
        document_tasks.can_sign AS canSign,
        document_tasks.can_forward AS canForward,
        document_tasks.can_finalize AS canFinalize,
        document_tasks.can_archive AS canArchive,
        document_tasks.due_at AS dueAt,
        document_tasks.created_at AS createdAt,
        documents.id AS documentId,
        documents.subject AS documentSubject,
        documents.internal_reference AS internalReference,
        documents.official_serial AS officialSerial,
        document_types.name AS documentTypeName,
        priority_levels.name AS priorityName,
        holder_units.name AS holderUnitName
       FROM document_tasks
       INNER JOIN documents ON document_tasks.document_id = documents.id
       INNER JOIN document_types ON documents.document_type_id = document_types.id
       INNER JOIN priority_levels ON documents.priority_level_id = priority_levels.id
       INNER JOIN units AS holder_units ON documents.current_holder_unit_id = holder_units.id
       WHERE document_tasks.status = 'open'
         AND document_tasks.deleted_at IS NULL
         AND documents.deleted_at IS NULL
         AND (
           document_tasks.assigned_assignment_id = ?
           OR (
             document_tasks.assigned_unit_id = ?
             AND (document_tasks.assigned_position_id IS NULL OR document_tasks.assigned_position_id = ?)
           )
         )
       ORDER BY COALESCE(document_tasks.due_at, document_tasks.created_at) ASC
       LIMIT ?`,
      [assignment.id, assignment.unitId, assignment.positionId, limit]
    ).then(([rows]) => rows));
  }

  if (query.type === "unit") {
    requests.push(pool.execute<RowDataPacket[]>(
      `SELECT
        'unit_document' AS itemType,
        document_tasks.id AS id,
        document_tasks.title AS title,
        document_tasks.description AS subtitle,
        document_tasks.status AS status,
        document_tasks.required_action AS requiredAction,
        document_tasks.can_review AS canReview,
        document_tasks.can_edit AS canEdit,
        document_tasks.can_sign AS canSign,
        document_tasks.can_forward AS canForward,
        document_tasks.can_finalize AS canFinalize,
        document_tasks.can_archive AS canArchive,
        document_tasks.due_at AS dueAt,
        document_tasks.created_at AS createdAt,
        documents.id AS documentId,
        documents.subject AS documentSubject,
        documents.internal_reference AS internalReference,
        documents.official_serial AS officialSerial,
        document_types.name AS documentTypeName,
        priority_levels.name AS priorityName,
        holder_units.name AS holderUnitName,
        positions.title AS assignedPositionTitle
       FROM document_tasks
       INNER JOIN documents ON document_tasks.document_id = documents.id
       INNER JOIN document_types ON documents.document_type_id = document_types.id
       INNER JOIN priority_levels ON documents.priority_level_id = priority_levels.id
       INNER JOIN units AS holder_units ON documents.current_holder_unit_id = holder_units.id
       LEFT JOIN positions ON document_tasks.assigned_position_id = positions.id
       WHERE document_tasks.status = 'open'
         AND document_tasks.deleted_at IS NULL
         AND document_tasks.assigned_assignment_id IS NULL
         AND document_tasks.assigned_unit_id = ?
         AND (document_tasks.assigned_position_id IS NULL OR document_tasks.assigned_position_id = ?)
         AND documents.deleted_at IS NULL
       ORDER BY COALESCE(document_tasks.due_at, document_tasks.created_at) ASC
       LIMIT ?`,
      [assignment.unitId, assignment.positionId, limit]
    ).then(([rows]) => rows));
  }

  if (query.type === "signatures") {
    requests.push(pool.execute<RowDataPacket[]>(
      `SELECT
        'signature' AS itemType,
        document_tasks.id AS id,
        document_tasks.title AS title,
        positions.title AS subtitle,
        document_tasks.status AS status,
        document_tasks.required_action AS requiredAction,
        document_tasks.can_review AS canReview,
        document_tasks.can_edit AS canEdit,
        document_tasks.can_sign AS canSign,
        document_tasks.can_forward AS canForward,
        document_tasks.can_finalize AS canFinalize,
        document_tasks.can_archive AS canArchive,
        document_tasks.due_at AS dueAt,
        document_tasks.created_at AS createdAt,
        documents.id AS documentId,
        documents.subject AS documentSubject,
        documents.internal_reference AS internalReference,
        documents.official_serial AS officialSerial,
        document_types.name AS documentTypeName,
        priority_levels.name AS priorityName,
        holder_units.name AS holderUnitName
       FROM document_tasks
       INNER JOIN documents ON document_tasks.document_id = documents.id
       INNER JOIN document_types ON documents.document_type_id = document_types.id
       INNER JOIN priority_levels ON documents.priority_level_id = priority_levels.id
       LEFT JOIN positions ON document_tasks.assigned_position_id = positions.id
       INNER JOIN units AS holder_units ON documents.current_holder_unit_id = holder_units.id
       WHERE document_tasks.status = 'open'
         AND document_tasks.deleted_at IS NULL
         AND (document_tasks.required_action = 'sign' OR document_tasks.can_sign = TRUE)
         AND (
           document_tasks.assigned_assignment_id = ?
           OR (
             document_tasks.assigned_unit_id = ?
             AND (document_tasks.assigned_position_id IS NULL OR document_tasks.assigned_position_id = ?)
           )
         )
         AND documents.deleted_at IS NULL
         AND ${access.sql}
       ORDER BY COALESCE(document_tasks.due_at, document_tasks.created_at) ASC
       LIMIT ?`,
      [assignment.id, assignment.unitId, assignment.positionId, ...userAssignmentIds, assignment.unitId, assignment.unitId, assignment.unitId, limit]
    ).then(([rows]) => rows));
  }

  if (query.type === "notifications") {
    requests.push(pool.execute<RowDataPacket[]>(
      `SELECT
        'notification' AS itemType,
        notifications.id AS id,
        notifications.title AS title,
        notifications.body AS subtitle,
        notifications.status AS status,
        NULL AS dueAt,
        notifications.created_at AS createdAt,
        notifications.document_id AS documentId,
        documents.subject AS documentSubject,
        documents.internal_reference AS internalReference,
        documents.official_serial AS officialSerial,
        document_types.name AS documentTypeName,
        priority_levels.name AS priorityName,
        holder_units.name AS holderUnitName
       FROM notifications
       LEFT JOIN documents ON notifications.document_id = documents.id
       LEFT JOIN document_types ON documents.document_type_id = document_types.id
       LEFT JOIN priority_levels ON documents.priority_level_id = priority_levels.id
       LEFT JOIN units AS holder_units ON documents.current_holder_unit_id = holder_units.id
       WHERE notifications.recipient_user_id = ?
       ORDER BY notifications.created_at DESC
       LIMIT ?`,
      [authUser.id, limit]
    ).then(([rows]) => rows));
  }

  if (query.type === "activity") {
    requests.push(pool.execute<RowDataPacket[]>(
      `SELECT
        'activity' AS itemType,
        document_workflow_events.id AS id,
        document_workflow_events.action AS title,
        document_workflow_events.note AS subtitle,
        COALESCE(document_workflow_events.to_status, documents.status) AS status,
        NULL AS dueAt,
        document_workflow_events.created_at AS createdAt,
        documents.id AS documentId,
        documents.subject AS documentSubject,
        documents.internal_reference AS internalReference,
        documents.official_serial AS officialSerial,
        document_types.name AS documentTypeName,
        priority_levels.name AS priorityName,
        holder_units.name AS holderUnitName
       FROM document_workflow_events
       INNER JOIN documents ON document_workflow_events.document_id = documents.id
       INNER JOIN document_types ON documents.document_type_id = document_types.id
       INNER JOIN priority_levels ON documents.priority_level_id = priority_levels.id
       INNER JOIN units AS holder_units ON documents.current_holder_unit_id = holder_units.id
       WHERE documents.deleted_at IS NULL
         AND ${access.sql}
       ORDER BY document_workflow_events.created_at DESC
       LIMIT ?`,
      [...userAssignmentIds, assignment.unitId, assignment.unitId, assignment.unitId, limit]
    ).then(([rows]) => rows));
  }

  const groups = await Promise.all(requests);
  const rows = groups.flat()
    .sort((left, right) => new Date(right.createdAt || 0).getTime() - new Date(left.createdAt || 0).getTime())
    .slice(0, limit);

  ok(response, rows);
}));

workspaceRouter.get("/transmission-targets", asyncHandler(async (request, response) => {
  const query = transmissionTargetsQuerySchema.parse(request.query);
  await getActiveAssignment(request, "choosing transmission recipients");
  const limit = query.limit;

  const unitWhere = [
    "units.status = 'active'",
    "units.deleted_at IS NULL"
  ];
  const unitParams: Array<number | string> = [];
  if (query.q) {
    unitWhere.push("(units.name LIKE ? OR units.code LIKE ? OR unit_types.name LIKE ?)");
    unitParams.push(like(query.q), like(query.q), like(query.q));
  }
  unitParams.push(limit);

  const assignmentWhere = [
    "assignments.status = 'active'",
    "assignments.deleted_at IS NULL",
    "persons.status = 'active'",
    "users.status = 'active'",
    "units.status = 'active'",
    "units.deleted_at IS NULL",
    "positions.status = 'active'"
  ];
  const assignmentParams: Array<number | string> = [];
  if (query.q) {
    assignmentWhere.push("(persons.display_name LIKE ? OR units.name LIKE ? OR positions.title LIKE ?)");
    assignmentParams.push(like(query.q), like(query.q), like(query.q));
  }
  assignmentParams.push(limit);

  const [units, assignments] = await Promise.all([
    pool.execute<RowDataPacket[]>(
      `SELECT
        units.id,
        units.uuid,
        units.code,
        units.name,
        unit_types.code AS unitTypeCode,
        unit_types.name AS unitTypeName
       FROM units
       INNER JOIN unit_types ON units.unit_type_id = unit_types.id
       WHERE ${unitWhere.join(" AND ")}
       ORDER BY unit_types.hierarchy_level ASC, units.name ASC
       LIMIT ?`,
      unitParams
    ).then(([rows]) => rows),
    pool.execute<RowDataPacket[]>(
      `SELECT
        assignments.id,
        assignments.uuid,
        persons.display_name AS personDisplayName,
        units.id AS unitId,
        units.name AS unitName,
        positions.id AS positionId,
        positions.title AS positionTitle
       FROM assignments
       INNER JOIN persons ON assignments.person_id = persons.id
       INNER JOIN users ON users.person_id = persons.id
       INNER JOIN positions ON assignments.position_id = positions.id
       INNER JOIN units ON positions.unit_id = units.id
       WHERE ${assignmentWhere.join(" AND ")}
       ORDER BY persons.display_name ASC, units.name ASC
       LIMIT ?`,
      assignmentParams
    ).then(([rows]) => rows)
  ]);

  ok(response, { units, assignments });
}));

workspaceRouter.get("/targets", asyncHandler(async (request, response) => {
  const query = targetsQuerySchema.parse(request.query);
  await getActiveAssignment(request, "choosing a document target");

  const unitWhere = ["units.status = 'active'", "units.deleted_at IS NULL"];
  const unitParams: any[] = [];
  if (query.q) {
    unitWhere.push("(units.name LIKE ? OR units.code LIKE ?)");
    unitParams.push(like(query.q), like(query.q));
  }
  unitParams.push(25);

  const assignmentWhere = [
    "assignments.status = 'active'",
    "assignments.deleted_at IS NULL",
    "users.status = 'active'"
  ];
  const assignmentParams: any[] = [];
  if (query.q) {
    assignmentWhere.push("(persons.display_name LIKE ? OR units.name LIKE ? OR positions.title LIKE ?)");
    assignmentParams.push(like(query.q), like(query.q), like(query.q));
  }
  assignmentParams.push(25);

  const [units, assignments] = await Promise.all([
    pool.execute<RowDataPacket[]>(
      `SELECT
        units.id,
        units.uuid,
        units.code,
        units.name,
        unit_types.code AS unitTypeCode,
        unit_types.name AS unitTypeName
       FROM units
       INNER JOIN unit_types ON units.unit_type_id = unit_types.id
       WHERE ${unitWhere.join(" AND ")}
       ORDER BY unit_types.hierarchy_level ASC, units.name ASC
       LIMIT ?`,
      unitParams
    ).then(([rows]) => rows),
    pool.execute<RowDataPacket[]>(
      `SELECT
        assignments.id,
        assignments.uuid,
        persons.display_name AS personDisplayName,
        units.id AS unitId,
        units.name AS unitName,
        positions.id AS positionId,
        positions.title AS positionTitle
       FROM assignments
       INNER JOIN persons ON assignments.person_id = persons.id
       INNER JOIN users ON users.person_id = persons.id
       INNER JOIN positions ON assignments.position_id = positions.id
       INNER JOIN units ON positions.unit_id = units.id
       WHERE ${assignmentWhere.join(" AND ")}
       ORDER BY persons.display_name ASC, units.name ASC
       LIMIT ?`,
      assignmentParams
    ).then(([rows]) => rows)
  ]);

  ok(response, {
    action: query.action || null,
    units,
    assignments
  });
}));
