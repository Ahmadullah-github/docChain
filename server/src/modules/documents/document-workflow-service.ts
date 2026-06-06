import type { ResultSetHeader, RowDataPacket } from "mysql2/promise";
import type { Database } from "../../db/mysql";
import { uuid } from "../../shared/ids";

type DocumentLike = Record<string, any>;

type TaskLike = Record<string, any>;

type ActiveAssignmentLike = {
  id: number;
  positionId: number;
  unitId: number;
};

type NotificationRecipient = {
  assignmentId: number | null;
  userId: number;
};

export const terminalDocumentStatuses = new Set(["archived", "closed", "finalized", "serial_assigned"]);

function booleanValue(value: unknown) {
  return value === true || value === 1 || value === "1" || value === "true";
}

function numberValue(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

function requiredActionLabel(action: string) {
  if (action === "information") {
    return "Information";
  }
  return action.replaceAll("_", " ").replace(/\b\w/g, (match) => match.toUpperCase());
}

function uniqueRecipients(recipients: NotificationRecipient[]) {
  const seen = new Set<string>();
  const unique: NotificationRecipient[] = [];
  for (const recipient of recipients) {
    const key = `${recipient.userId}:${recipient.assignmentId || 0}`;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    unique.push(recipient);
  }
  return unique;
}

export function documentTaskAction(task: TaskLike) {
  return String(task.required_action || task.task_type || "task");
}

export function documentTaskIsReview(task: TaskLike) {
  return documentTaskAction(task) === "review" || booleanValue(task.can_review);
}

export async function documentStatusAfterTaskChange(
  connection: Database,
  documentId: number,
  currentStatus: string,
  idleStatus: string
) {
  if (terminalDocumentStatuses.has(currentStatus)) {
    return currentStatus;
  }

  const [rows] = await connection.execute<RowDataPacket[]>(
    `SELECT required_action, can_edit, can_review, can_sign
     FROM document_tasks
     WHERE document_id = ?
       AND status = 'open'
       AND deleted_at IS NULL`,
    [documentId]
  );

  if (!rows.length) {
    return idleStatus;
  }
  const actionFor = (row: RowDataPacket) => String(row.required_action || row.task_type || "");
  const hasKnownAction = (row: RowDataPacket) => ["edit", "review", "sign"].includes(actionFor(row));

  if (rows.some((row) => actionFor(row) === "sign" || (!hasKnownAction(row) && booleanValue(row.can_sign)))) {
    return "pending_signatures";
  }
  if (rows.some((row) => actionFor(row) === "edit" || (!hasKnownAction(row) && booleanValue(row.can_edit)))) {
    return "under_edit";
  }
  if (rows.some((row) => actionFor(row) === "review" || (!hasKnownAction(row) && booleanValue(row.can_review)))) {
    return "under_review";
  }
  return "under_action";
}

export async function workflowReturnHolderUnitId(
  connection: Database,
  input: {
    currentHolderUnitId: number;
    documentId: number;
    workflowEventId?: number | null;
  }
) {
  if (!input.workflowEventId) {
    return null;
  }

  const [taskRows] = await connection.execute<RowDataPacket[]>(
    `SELECT COUNT(*) AS openCount
     FROM document_tasks
     WHERE document_id = ?
       AND workflow_event_id = ?
       AND status = 'open'
       AND deleted_at IS NULL`,
    [input.documentId, input.workflowEventId]
  );
  if (Number(taskRows[0]?.openCount || 0) > 0) {
    return null;
  }

  const [eventRows] = await connection.execute<RowDataPacket[]>(
    `SELECT action, from_unit_id, to_unit_id
     FROM document_workflow_events
     WHERE id = ? AND document_id = ?
     LIMIT 1`,
    [input.workflowEventId, input.documentId]
  );
  const event = eventRows[0];
  const fromUnitId = numberValue(event?.from_unit_id);
  const toUnitId = numberValue(event?.to_unit_id);

  if (!event || String(event.action) !== "send" || !fromUnitId) {
    return null;
  }
  if (toUnitId && input.currentHolderUnitId !== toUnitId) {
    return null;
  }
  return fromUnitId;
}

async function recipientsForAssignments(connection: Database, assignmentIds: number[]) {
  const uniqueAssignmentIds = [...new Set(assignmentIds.filter(Boolean))];
  if (!uniqueAssignmentIds.length) {
    return [];
  }
  const placeholders = uniqueAssignmentIds.map(() => "?").join(", ");
  const [rows] = await connection.execute<RowDataPacket[]>(
    `SELECT assignments.id AS assignmentId, users.id AS userId
     FROM assignments
     INNER JOIN persons ON assignments.person_id = persons.id
     INNER JOIN users ON users.person_id = persons.id
     WHERE assignments.id IN (${placeholders})
       AND assignments.status = 'active'
       AND assignments.deleted_at IS NULL
       AND persons.status = 'active'
       AND users.status = 'active'`,
    uniqueAssignmentIds
  );
  return uniqueRecipients(rows.map((row) => ({
    assignmentId: Number(row.assignmentId),
    userId: Number(row.userId)
  })));
}

export async function recipientsForDocumentTask(connection: Database, task: TaskLike) {
  const assignmentId = numberValue(task.assigned_assignment_id);
  if (assignmentId) {
    return recipientsForAssignments(connection, [assignmentId]);
  }

  const positionId = numberValue(task.assigned_position_id);
  const unitId = numberValue(task.assigned_unit_id);
  if (!positionId && !unitId) {
    return [];
  }

  const where = [
    "assignments.status = 'active'",
    "assignments.deleted_at IS NULL",
    "persons.status = 'active'",
    "users.status = 'active'",
    "positions.status = 'active'",
    "positions.deleted_at IS NULL"
  ];
  const params: number[] = [];
  if (positionId) {
    where.push("assignments.position_id = ?");
    params.push(positionId);
  } else {
    where.push("positions.unit_id = ?");
    params.push(unitId);
  }

  const [rows] = await connection.execute<RowDataPacket[]>(
    `SELECT assignments.id AS assignmentId, users.id AS userId
     FROM assignments
     INNER JOIN persons ON assignments.person_id = persons.id
     INNER JOIN users ON users.person_id = persons.id
     INNER JOIN positions ON assignments.position_id = positions.id
     WHERE ${where.join(" AND ")}`,
    params
  );
  return uniqueRecipients(rows.map((row) => ({
    assignmentId: Number(row.assignmentId),
    userId: Number(row.userId)
  })));
}

async function preferenceDisabledUserIds(connection: Database, userIds: number[], notificationType: string) {
  const uniqueUserIds = [...new Set(userIds.filter(Boolean))];
  if (!uniqueUserIds.length) {
    return new Set<number>();
  }
  const placeholders = uniqueUserIds.map(() => "?").join(", ");
  const [rows] = await connection.execute<RowDataPacket[]>(
    `SELECT user_id
     FROM notification_preferences
     WHERE notification_type = ?
       AND in_app_enabled = FALSE
       AND user_id IN (${placeholders})`,
    [notificationType, ...uniqueUserIds]
  );
  return new Set(rows.map((row) => Number(row.user_id)));
}

export async function createInAppNotifications(
  connection: Database,
  input: {
    body?: string | null;
    documentId: number;
    documentTaskId?: number | null;
    notificationType: string;
    payload?: Record<string, unknown>;
    recipients: NotificationRecipient[];
    title: string;
  }
) {
  const recipients = uniqueRecipients(input.recipients);
  if (!recipients.length) {
    return 0;
  }

  const disabledUserIds = await preferenceDisabledUserIds(
    connection,
    recipients.map((recipient) => recipient.userId),
    input.notificationType
  );
  let inserted = 0;
  for (const recipient of recipients) {
    if (disabledUserIds.has(recipient.userId)) {
      continue;
    }

    const [existingRows] = await connection.execute<RowDataPacket[]>(
      `SELECT id
       FROM notifications
       WHERE recipient_user_id = ?
         AND recipient_assignment_id <=> ?
         AND document_id <=> ?
         AND document_task_id <=> ?
         AND notification_type = ?
       LIMIT 1`,
      [
        recipient.userId,
        recipient.assignmentId,
        input.documentId,
        input.documentTaskId || null,
        input.notificationType
      ]
    );
    if (existingRows.length) {
      continue;
    }

    await connection.execute<ResultSetHeader>(
      `INSERT INTO notifications (
        uuid, recipient_user_id, recipient_assignment_id, document_id,
        document_task_id, notification_type, channel, title, body,
        status, payload
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        uuid(),
        recipient.userId,
        recipient.assignmentId,
        input.documentId,
        input.documentTaskId || null,
        input.notificationType,
        "in_app",
        input.title,
        input.body || null,
        "queued",
        JSON.stringify(input.payload || {})
      ]
    );
    inserted += 1;
  }
  return inserted;
}

export async function notifyDocumentTaskAssigned(
  connection: Database,
  input: {
    document: DocumentLike;
    task: TaskLike;
  }
) {
  const documentId = numberValue(input.document.id);
  const taskId = numberValue(input.task.id);
  if (!documentId || !taskId) {
    return 0;
  }
  const action = documentTaskAction(input.task);
  const recipients = await recipientsForDocumentTask(connection, input.task);
  return createInAppNotifications(connection, {
    body: input.document.subject || null,
    documentId,
    documentTaskId: taskId,
    notificationType: "document_task_assigned",
    payload: {
      documentId,
      documentTaskId: taskId,
      requiredAction: action
    },
    recipients,
    title: `${requiredActionLabel(action)} request assigned`
  });
}

export async function notifyDocumentTaskOriginators(
  connection: Database,
  input: {
    actorAssignment: ActiveAssignmentLike;
    body?: string | null;
    document: DocumentLike;
    notificationType: "document_review_approved" | "document_task_completed" | "document_signed";
    payload?: Record<string, unknown>;
    task: TaskLike;
    title: string;
  }
) {
  const documentId = numberValue(input.document.id);
  const taskId = numberValue(input.task.id);
  if (!documentId) {
    return 0;
  }
  const assignmentIds = [
    numberValue(input.task.created_by_assignment_id),
    numberValue(input.document.creator_assignment_id)
  ].filter(Boolean);
  const recipients = await recipientsForAssignments(connection, assignmentIds);
  return createInAppNotifications(connection, {
    body: input.body || input.document.subject || null,
    documentId,
    documentTaskId: taskId || null,
    notificationType: input.notificationType,
    payload: {
      actorAssignmentId: input.actorAssignment.id,
      documentId,
      documentTaskId: taskId || null,
      ...input.payload
    },
    recipients,
    title: input.title
  });
}
