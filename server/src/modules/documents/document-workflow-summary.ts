import type { RowDataPacket } from "mysql2/promise";
import { pool } from "../../db/mysql";

export type DocumentWorkflowStepStatus = "blocked" | "completed" | "current" | "pending";

export type DocumentWorkflowRouteStep = {
  action?: string | null;
  documentTaskId?: number | null;
  label: string;
  positionId?: number | null;
  status: DocumentWorkflowStepStatus;
  sublabel?: string | null;
  unitId?: number | null;
  workflowEventId?: number | null;
};

export type DocumentWorkflowSummary = {
  activeAction: string | null;
  completedTaskCount: number;
  openTaskCount: number;
  routeSteps: DocumentWorkflowRouteStep[];
  thumbnailStatus: "available" | "missing" | "pending";
  thumbnailUrl: string;
};

type DocumentSummaryRow = RowDataPacket & {
  currentHolderUnitId: number;
  currentHolderUnitName: string;
  id: number;
  originUnitId: number;
  originUnitName: string;
  status: string;
  updatedAt?: string | null;
};

type TaskSummaryRow = RowDataPacket & {
  assignedPositionId?: number | null;
  assignedPositionTitle?: string | null;
  assignedUnitId?: number | null;
  assignedUnitName?: string | null;
  completedAt?: string | null;
  documentId: number;
  dueAt?: string | null;
  id: number;
  requiredAction?: string | null;
  responseOutcome?: string | null;
  status: string;
  taskType: string;
  title: string;
};

type EventSummaryRow = RowDataPacket & {
  action: string;
  createdAt?: string | null;
  documentId: number;
  id: number;
  requiredAction?: string | null;
  toPositionId?: number | null;
  toPositionTitle?: string | null;
  toUnitId?: number | null;
  toUnitName?: string | null;
};

function placeholders(values: number[]) {
  return values.map(() => "?").join(", ");
}

function actionForTask(task: TaskSummaryRow) {
  return String(task.requiredAction || task.taskType || "request");
}

function actionLabel(action?: string | null) {
  const labels: Record<string, string> = {
    edit: "Edit",
    forward: "Forward",
    information: "Information",
    review: "Review",
    sign: "Signature"
  };
  return labels[String(action || "")] || String(action || "Request").replaceAll("_", " ");
}

function statusTextForTask(task: TaskSummaryRow) {
  const action = actionForTask(task);
  if (task.status === "completed") {
    if (task.responseOutcome === "approved") {
      return "Approved";
    }
    if (task.responseOutcome) {
      return String(task.responseOutcome).replaceAll("_", " ");
    }
    return "Completed";
  }
  if (action === "sign") return "Waiting for signature";
  if (action === "review") return "Under review";
  if (action === "edit") return "Editing requested";
  if (action === "information") return "For information";
  return "Pending";
}

function labelForTarget(input: {
  positionTitle?: string | null;
  unitName?: string | null;
}) {
  if (input.positionTitle && input.unitName) {
    return `${input.positionTitle}`;
  }
  return input.positionTitle || input.unitName || "Workflow step";
}

function sublabelForTarget(input: {
  fallback?: string | null;
  positionTitle?: string | null;
  unitName?: string | null;
}) {
  if (input.positionTitle && input.unitName) {
    return input.fallback ? `${input.unitName} - ${input.fallback}` : input.unitName;
  }
  return input.fallback || null;
}

function openTaskStatus(task: TaskSummaryRow): DocumentWorkflowStepStatus {
  if (task.dueAt && new Date(task.dueAt).getTime() < Date.now()) {
    return "blocked";
  }
  return "current";
}

function statusRank(status: DocumentWorkflowStepStatus) {
  return { blocked: 4, current: 3, pending: 2, completed: 1 }[status];
}

function stepKey(step: DocumentWorkflowRouteStep) {
  return [
    step.unitId || "unit",
    step.positionId || "position",
    step.documentTaskId ? `task:${step.documentTaskId}` : "",
    step.workflowEventId ? `event:${step.workflowEventId}` : "",
    step.label
  ].join(":");
}

function pushRouteStep(steps: DocumentWorkflowRouteStep[], next: DocumentWorkflowRouteStep) {
  const last = steps[steps.length - 1];
  if (last && stepKey(last) === stepKey(next)) {
    if (statusRank(next.status) > statusRank(last.status)) {
      last.status = next.status;
      last.sublabel = next.sublabel;
      last.action = next.action;
      last.documentTaskId = next.documentTaskId;
      last.workflowEventId = next.workflowEventId;
    }
    return;
  }
  steps.push(next);
}

function activeActionFor(tasks: TaskSummaryRow[]) {
  const open = tasks.filter((task) => task.status === "open");
  const precedence = ["sign", "edit", "review", "forward", "information"];
  return precedence.find((action) => open.some((task) => actionForTask(task) === action)) || (open[0] ? actionForTask(open[0]) : null);
}

function buildSummaryForDocument(input: {
  document: DocumentSummaryRow;
  events: EventSummaryRow[];
  hasThumbnail: boolean;
  tasks: TaskSummaryRow[];
}): DocumentWorkflowSummary {
  const steps: DocumentWorkflowRouteStep[] = [];
  const { document, events, hasThumbnail, tasks } = input;

  pushRouteStep(steps, {
    action: "created",
    label: document.originUnitName || "Originator",
    status: tasks.length || events.length || document.status !== "draft" ? "completed" : "current",
    sublabel: document.status === "draft" ? "Draft" : "Created",
    unitId: Number(document.originUnitId) || null
  });

  for (const event of events) {
    if (!event.toUnitId && !event.toPositionId) {
      continue;
    }
    const action = String(event.requiredAction || event.action || "");
    pushRouteStep(steps, {
      action,
      label: labelForTarget({ positionTitle: event.toPositionTitle, unitName: event.toUnitName }),
      positionId: event.toPositionId ? Number(event.toPositionId) : null,
      status: "completed",
      sublabel: sublabelForTarget({
        fallback: action ? actionLabel(action) : String(event.action || "Moved"),
        positionTitle: event.toPositionTitle,
        unitName: event.toUnitName
      }),
      unitId: event.toUnitId ? Number(event.toUnitId) : null,
      workflowEventId: Number(event.id)
    });
  }

  for (const task of tasks) {
    const action = actionForTask(task);
    pushRouteStep(steps, {
      action,
      documentTaskId: Number(task.id),
      label: labelForTarget({ positionTitle: task.assignedPositionTitle, unitName: task.assignedUnitName }),
      positionId: task.assignedPositionId ? Number(task.assignedPositionId) : null,
      status: task.status === "completed" ? "completed" : openTaskStatus(task),
      sublabel: sublabelForTarget({
        fallback: statusTextForTask(task),
        positionTitle: task.assignedPositionTitle,
        unitName: task.assignedUnitName
      }),
      unitId: task.assignedUnitId ? Number(task.assignedUnitId) : null
    });
  }

  if (!steps.some((step) => step.unitId === Number(document.currentHolderUnitId) && step.status === "current")) {
    pushRouteStep(steps, {
      action: "holder",
      label: document.currentHolderUnitName || "Current holder",
      status: ["archived", "closed", "finalized", "serial_assigned"].includes(String(document.status)) ? "completed" : "current",
      sublabel: "Current holder",
      unitId: Number(document.currentHolderUnitId) || null
    });
  }

  const updatedAt = document.updatedAt ? new Date(document.updatedAt).getTime() : 0;
  const thumbnailVersion = encodeURIComponent(`3-${Number.isFinite(updatedAt) ? updatedAt : 0}`);

  return {
    activeAction: activeActionFor(tasks),
    completedTaskCount: tasks.filter((task) => task.status === "completed").length,
    openTaskCount: tasks.filter((task) => task.status === "open").length,
    routeSteps: steps,
    thumbnailStatus: hasThumbnail ? "available" : "pending",
    thumbnailUrl: `/api/documents/${document.id}/thumbnail?v=${thumbnailVersion}`
  };
}

export async function workflowSummariesForDocuments(documentIds: number[]) {
  const uniqueIds = Array.from(new Set(documentIds.map(Number).filter((id) => Number.isFinite(id) && id > 0)));
  const summaries = new Map<number, DocumentWorkflowSummary>();
  if (!uniqueIds.length) {
    return summaries;
  }

  const idPlaceholders = placeholders(uniqueIds);
  const [documents, tasks, events, thumbnailRows] = await Promise.all([
    pool.execute<DocumentSummaryRow[]>(
      `SELECT
        documents.id,
        documents.status,
        documents.updated_at AS updatedAt,
        documents.origin_unit_id AS originUnitId,
        origin_units.name AS originUnitName,
        documents.current_holder_unit_id AS currentHolderUnitId,
        holder_units.name AS currentHolderUnitName
       FROM documents
       INNER JOIN units AS origin_units ON documents.origin_unit_id = origin_units.id
       INNER JOIN units AS holder_units ON documents.current_holder_unit_id = holder_units.id
       WHERE documents.id IN (${idPlaceholders})
         AND documents.deleted_at IS NULL`,
      uniqueIds
    ).then(([rows]) => rows),
    pool.execute<TaskSummaryRow[]>(
      `SELECT
        document_tasks.id,
        document_tasks.document_id AS documentId,
        document_tasks.task_type AS taskType,
        document_tasks.required_action AS requiredAction,
        document_tasks.status,
        document_tasks.title,
        document_tasks.due_at AS dueAt,
        document_tasks.completed_at AS completedAt,
        document_tasks.response_outcome AS responseOutcome,
        document_tasks.assigned_unit_id AS assignedUnitId,
        document_tasks.assigned_position_id AS assignedPositionId,
        task_units.name AS assignedUnitName,
        task_positions.title AS assignedPositionTitle
       FROM document_tasks
       LEFT JOIN units AS task_units ON document_tasks.assigned_unit_id = task_units.id
       LEFT JOIN positions AS task_positions ON document_tasks.assigned_position_id = task_positions.id
       WHERE document_tasks.document_id IN (${idPlaceholders})
         AND document_tasks.deleted_at IS NULL
       ORDER BY document_tasks.document_id ASC, document_tasks.created_at ASC, document_tasks.id ASC`,
      uniqueIds
    ).then(([rows]) => rows),
    pool.execute<EventSummaryRow[]>(
      `SELECT
        document_workflow_events.id,
        document_workflow_events.document_id AS documentId,
        document_workflow_events.action,
        document_workflow_events.required_action AS requiredAction,
        document_workflow_events.to_unit_id AS toUnitId,
        document_workflow_events.to_position_id AS toPositionId,
        document_workflow_events.created_at AS createdAt,
        to_units.name AS toUnitName,
        to_positions.title AS toPositionTitle
       FROM document_workflow_events
       LEFT JOIN units AS to_units ON document_workflow_events.to_unit_id = to_units.id
       LEFT JOIN positions AS to_positions ON document_workflow_events.to_position_id = to_positions.id
       WHERE document_workflow_events.document_id IN (${idPlaceholders})
       ORDER BY document_workflow_events.document_id ASC, document_workflow_events.created_at ASC, document_workflow_events.id ASC`,
      uniqueIds
    ).then(([rows]) => rows),
    pool.execute<RowDataPacket[]>(
      `SELECT document_renders.document_id AS documentId
       FROM document_renders
       INNER JOIN file_assets ON document_renders.file_asset_id = file_assets.id
       WHERE document_renders.document_id IN (${idPlaceholders})
         AND document_renders.render_type = 'thumbnail_png'
         AND document_renders.status = 'generated'
         AND file_assets.status = 'active'
         AND file_assets.deleted_at IS NULL
       ORDER BY document_renders.document_id ASC, document_renders.created_at DESC, document_renders.id DESC`,
      uniqueIds
    ).then(([rows]) => rows)
  ]);

  const tasksByDocument = new Map<number, TaskSummaryRow[]>();
  for (const task of tasks) {
    const documentId = Number(task.documentId);
    tasksByDocument.set(documentId, [...(tasksByDocument.get(documentId) || []), task]);
  }

  const eventsByDocument = new Map<number, EventSummaryRow[]>();
  for (const event of events) {
    const documentId = Number(event.documentId);
    eventsByDocument.set(documentId, [...(eventsByDocument.get(documentId) || []), event]);
  }

  const documentsWithThumbnails = new Set<number>();
  for (const row of thumbnailRows) {
    documentsWithThumbnails.add(Number(row.documentId));
  }

  for (const document of documents) {
    summaries.set(Number(document.id), buildSummaryForDocument({
      document,
      events: eventsByDocument.get(Number(document.id)) || [],
      hasThumbnail: documentsWithThumbnails.has(Number(document.id)),
      tasks: tasksByDocument.get(Number(document.id)) || []
    }));
  }

  return summaries;
}

export async function attachWorkflowSummaries<T extends Record<string, any>>(
  rows: T[],
  documentIdForRow: (row: T) => number | null | undefined
) {
  const summaries = await workflowSummariesForDocuments(rows.map((row) => Number(documentIdForRow(row) || 0)));
  return rows.map((row) => {
    const documentId = Number(documentIdForRow(row) || 0);
    return {
      ...row,
      workflowSummary: summaries.get(documentId) || null
    };
  });
}
