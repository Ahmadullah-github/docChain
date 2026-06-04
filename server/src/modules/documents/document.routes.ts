import { createHash, randomBytes } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { Router } from "express";
import type { Request, Response } from "express";
import multer from "multer";
import type { ResultSetHeader, RowDataPacket } from "mysql2/promise";
import { z } from "zod";
import { pool } from "../../db/mysql";
import { requireAuth } from "../../middleware/auth";
import { asyncHandler } from "../../shared/async-handler";
import { writeAuditLog } from "../../shared/audit";
import { assertDocumentAccess, getActiveAssignment, isAdmin } from "../../shared/document-access";
import { calculateDocumentContentHash } from "../../shared/document-hash";
import { assertDocumentWritePermission, listDocumentWritePermissions, type DocumentWritePermission } from "../../shared/document-write-rules";
import { AppError, notFound } from "../../shared/errors";
import { created, ok } from "../../shared/http";
import { uuid } from "../../shared/ids";
import { refreshSearchIndexForEntitySafe } from "../search/global-search.service";
import { assignOfficialSerial } from "../signatures/serial-assignment-service";
import { assertWalkInArchiveAllowedForDocument, markWalkInRequestArchivedForDocument, markWalkInRequestFinalizedForDocument } from "../walk-in-issuance/walk-in-issuance.service";
import { documentContentToPlainText, normalizeDocumentContent, normalizeTemplateFieldRecord } from "./document-content";

export const documentRouter = Router();

documentRouter.use(requireAuth);

const documentIdSchema = z.object({
  documentId: z.coerce.number().int().positive()
});

const optionalNullableString = z.string().trim().min(1).nullable().optional();
const optionalNullableDate = z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional();
const templateFieldKeySchema = z.string().trim().min(1).max(80).regex(/^[a-zA-Z0-9_.-]+$/);
const templateFieldsSchema = z.record(templateFieldKeySchema, z.string().max(10_000)).optional();
const kabulTimeZone = "Asia/Kabul";

const createDocumentSchema = z.object({
  document_type_id: z.coerce.number().int().positive(),
  subject: z.string().trim().min(1).max(255),
  document_date: optionalNullableDate,
  summary: optionalNullableString,
  body: z.string().default(""),
  document_content: z.unknown().optional(),
  template_fields: templateFieldsSchema,
  confidentiality_level_id: z.coerce.number().int().positive(),
  priority_level_id: z.coerce.number().int().positive(),
  origin_unit_id: z.coerce.number().int().positive().optional(),
  owner_unit_id: z.coerce.number().int().positive().optional(),
  current_holder_unit_id: z.coerce.number().int().positive().optional(),
  change_reason: optionalNullableString
});

const updateDocumentSchema = z.object({
  subject: z.string().trim().min(1).max(255).optional(),
  document_date: optionalNullableDate,
  summary: optionalNullableString,
  body: z.string().optional(),
  document_content: z.unknown().optional(),
  template_fields: templateFieldsSchema,
  confidentiality_level_id: z.coerce.number().int().positive().optional(),
  priority_level_id: z.coerce.number().int().positive().optional(),
  change_reason: optionalNullableString,
  material_change: z.boolean().default(true)
});

const createRelationSchema = z.object({
  related_document_id: z.coerce.number().int().positive(),
  relation_type: z.enum(["parent", "reply", "reference", "derived", "related"]),
  note: optionalNullableString
});

const createAttachmentSchema = z.object({
  purpose: z.string().trim().min(1).max(80).default("document_attachment"),
  storage_disk: z.string().trim().min(1).max(80).default("local"),
  storage_path: z.string().trim().min(1).max(500),
  original_filename: z.string().trim().min(1).max(255),
  stored_filename: optionalNullableString,
  mime_type: z.string().trim().min(1).max(160),
  byte_size: z.coerce.number().int().positive(),
  checksum_sha256: z.string().trim().length(64).nullable().optional(),
  encryption_status: z.string().trim().min(1).max(40).default("not_encrypted"),
  metadata: z.record(z.string(), z.unknown()).optional(),
  attachment_type: z.string().trim().min(1).max(80).default("supporting_file"),
  title: optionalNullableString,
  description: optionalNullableString
});

const createTaskSchema = z.object({
  workflow_event_id: z.coerce.number().int().positive().nullable().optional(),
  assigned_unit_id: z.coerce.number().int().positive().nullable().optional(),
  assigned_position_id: z.coerce.number().int().positive().nullable().optional(),
  assigned_assignment_id: z.coerce.number().int().positive().nullable().optional(),
  task_type: z.string().trim().min(1).max(80),
  title: z.string().trim().min(1).max(180),
  description: optionalNullableString,
  due_at: z.coerce.date().nullable().optional()
});

const endorsementCommentMaxLength = 300;

const completeTaskSchema = z.object({
  completion_note: z.string().trim().max(endorsementCommentMaxLength).nullable().optional()
});

const finalizeDocumentSchema = z.object({
  note: optionalNullableString
});

const archiveDocumentSchema = z.object({
  reason: z.string().trim().min(1).max(2000).optional(),
  note: optionalNullableString
});

const sendOptionsQuerySchema = z.object({
  q: z.string().trim().max(120).optional(),
  limit: z.coerce.number().int().min(1).max(75).default(40)
});

const requiredActionSchema = z.enum(["review", "edit", "sign", "forward", "information"]);

const sendRecipientSchema = z.object({
  to_unit_id: z.coerce.number().int().positive(),
  to_position_id: z.coerce.number().int().positive().nullable().optional(),
  required_action: requiredActionSchema,
  requires_comment: z.boolean().optional(),
  can_edit: z.boolean().optional(),
  can_sign: z.boolean().optional(),
  can_forward: z.boolean().optional(),
  can_finalize: z.boolean().optional(),
  can_archive: z.boolean().optional(),
  note: optionalNullableString,
  due_at: z.coerce.date().nullable().optional()
});

const sendDocumentSchema = z.object({
  recipients: z.array(sendRecipientSchema).min(1).max(25).optional(),
  action: z.string().trim().min(1).max(80).optional(),
  to_unit_id: z.coerce.number().int().positive().optional(),
  to_position_id: z.coerce.number().int().positive().nullable().optional(),
  note: optionalNullableString,
  return_reason: optionalNullableString,
  due_at: z.coerce.date().nullable().optional()
});

const documentFilterQuerySchema = z.object({
  status: z.string().trim().min(1).optional(),
  q: z.string().trim().min(1).optional(),
  document_type_id: z.coerce.number().int().positive().optional(),
  priority_level_id: z.coerce.number().int().positive().optional(),
  confidentiality_level_id: z.coerce.number().int().positive().optional(),
  date_from: z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  date_to: z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  scope: z.enum(["accessible", "created_by_me", "current_holder", "origin_unit", "owner_unit", "my_tasks", "signature_queue"]).default("accessible")
});

type RequiredAction = z.infer<typeof requiredActionSchema>;
type SendRecipientInput = z.infer<typeof sendRecipientSchema>;
type SendDocumentInput = z.infer<typeof sendDocumentSchema>;

type SendTargetCandidate = {
  id: string;
  type: "unit" | "unit_position";
  unitId: number;
  unitName: string;
  unitTypeId: number;
  unitTypeName: string;
  positionId?: number;
  positionTitle?: string;
  hasActiveHolder: boolean;
  holderSummary?: string | null;
};

function like(value?: string) {
  return `%${value || ""}%`;
}

function requiredActionLabel(action: RequiredAction) {
  const labels: Record<RequiredAction, string> = {
    edit: "Edit",
    forward: "Forward",
    information: "For information",
    review: "Review",
    sign: "Sign"
  };
  return labels[action];
}

function requiredActionStatus(action: RequiredAction) {
  const statuses: Record<RequiredAction, string> = {
    edit: "under_edit",
    forward: "under_action",
    information: "under_action",
    review: "under_review",
    sign: "pending_signatures"
  };
  return statuses[action];
}

function defaultPermissionsFor(action: RequiredAction) {
  if (action === "edit") {
    return { can_edit: true, can_forward: true, can_sign: false, can_finalize: false, can_archive: false };
  }
  if (action === "sign") {
    return { can_edit: false, can_forward: false, can_sign: true, can_finalize: false, can_archive: false };
  }
  if (action === "forward") {
    return { can_edit: false, can_forward: true, can_sign: false, can_finalize: false, can_archive: false };
  }
  return { can_edit: false, can_forward: false, can_sign: false, can_finalize: false, can_archive: false };
}

function permissionsForRecipient(recipient: SendRecipientInput) {
  const defaults = defaultPermissionsFor(recipient.required_action);
  return {
    can_archive: recipient.can_archive ?? defaults.can_archive,
    can_edit: recipient.can_edit ?? defaults.can_edit,
    can_finalize: recipient.can_finalize ?? defaults.can_finalize,
    can_forward: recipient.can_forward ?? defaults.can_forward,
    can_sign: recipient.can_sign ?? defaults.can_sign
  };
}

function legacyActionToRequiredAction(action?: string): RequiredAction {
  if (!action) {
    return "review";
  }
  if (action.includes("sign")) {
    return "sign";
  }
  if (action.includes("edit") || action.includes("correction") || action.includes("return")) {
    return "edit";
  }
  if (action.includes("forward") || action.includes("refer")) {
    return "forward";
  }
  if (action.includes("info")) {
    return "information";
  }
  return "review";
}

function normalizeSendRecipients(input: SendDocumentInput): SendRecipientInput[] {
  if (input.recipients?.length) {
    return input.recipients;
  }

  if (!input.to_unit_id) {
    throw new AppError(422, "send_recipient_required", "Choose at least one receiver for this document.");
  }

  return [{
    can_edit: undefined,
    can_sign: undefined,
    can_forward: undefined,
    can_finalize: undefined,
    can_archive: undefined,
    due_at: input.due_at || null,
    note: input.note || input.return_reason || null,
    required_action: legacyActionToRequiredAction(input.action),
    requires_comment: false,
    to_position_id: input.to_position_id || null,
    to_unit_id: input.to_unit_id
  }];
}

async function unitPositionTarget(unitId: number, positionId?: number | null): Promise<SendTargetCandidate> {
  const [unitRows] = await pool.execute<RowDataPacket[]>(
    `SELECT
      units.id,
      units.name,
      units.organization_id AS organizationId,
      units.unit_type_id AS unitTypeId,
      unit_types.name AS unitTypeName
     FROM units
     INNER JOIN unit_types ON units.unit_type_id = unit_types.id
     WHERE units.id = ?
       AND units.status = 'active'
       AND units.deleted_at IS NULL
     LIMIT 1`,
    [unitId]
  );
  const unit = unitRows[0];
  if (!unit) {
    throw new AppError(422, "invalid_send_target", "Selected target unit is inactive or unavailable.");
  }

  if (!positionId) {
    return {
      hasActiveHolder: false,
      id: `unit:${unit.id}`,
      type: "unit",
      unitId: Number(unit.id),
      unitName: String(unit.name),
      unitTypeId: Number(unit.unitTypeId),
      unitTypeName: String(unit.unitTypeName)
    };
  }

  const [positionRows] = await pool.execute<RowDataPacket[]>(
    `SELECT
      positions.id,
      positions.title
     FROM positions
     WHERE positions.id = ?
       AND positions.unit_id = ?
       AND positions.status = 'active'
       AND positions.deleted_at IS NULL
     LIMIT 1`,
    [positionId, unit.id]
  );
  const position = positionRows[0];
  if (!position) {
    throw new AppError(422, "invalid_send_target", "Selected target position is inactive or unavailable for this unit.");
  }

  const [holderRows] = await pool.execute<RowDataPacket[]>(
    `SELECT GROUP_CONCAT(persons.display_name ORDER BY assignments.is_primary DESC, persons.display_name SEPARATOR ', ') AS holderSummary,
            COUNT(*) AS holderCount
     FROM assignments
     INNER JOIN persons ON assignments.person_id = persons.id
     WHERE assignments.position_id = ?
       AND assignments.status = 'active'
       AND assignments.deleted_at IS NULL
       AND persons.status = 'active'`,
    [positionId]
  );
  const holders = holderRows[0];

  return {
    hasActiveHolder: Number(holders?.holderCount || 0) > 0,
    holderSummary: holders?.holderSummary ? String(holders.holderSummary) : null,
    id: `unit_position:${unit.id}:${position.id}`,
    positionId: Number(position.id),
    positionTitle: String(position.title),
    type: "unit_position",
    unitId: Number(unit.id),
    unitName: String(unit.name),
    unitTypeId: Number(unit.unitTypeId),
    unitTypeName: String(unit.unitTypeName)
  };
}

async function listSendTargetCandidates(query: z.infer<typeof sendOptionsQuerySchema>) {
  const limit = query.limit;
  const search = query.q?.trim();
  const unitWhere = ["units.status = 'active'", "units.deleted_at IS NULL"];
  const unitParams: Array<number | string> = [];
  if (search) {
    unitWhere.push("(units.name LIKE ? OR units.code LIKE ? OR unit_types.name LIKE ?)");
    unitParams.push(like(search), like(search), like(search));
  }
  unitParams.push(Math.max(limit, 25));

  const unitPositionWhere = [
    "units.status = 'active'",
    "units.deleted_at IS NULL",
    "positions.status = 'active'",
    "positions.deleted_at IS NULL"
  ];
  const unitPositionParams: Array<number | string> = [];
  if (search) {
    unitPositionWhere.push("(units.name LIKE ? OR units.code LIKE ? OR unit_types.name LIKE ? OR positions.title LIKE ? OR positions.code LIKE ?)");
    unitPositionParams.push(like(search), like(search), like(search), like(search), like(search));
  }
  unitPositionParams.push(Math.max(limit * 3, 75));

  const [unitRows, unitPositionRows] = await Promise.all([
    pool.execute<RowDataPacket[]>(
      `SELECT
        units.id,
        units.name,
        units.unit_type_id AS unitTypeId,
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
        CONCAT('unit_position:', units.id, ':', positions.id) AS id,
        units.id AS unitId,
        units.name AS unitName,
        units.unit_type_id AS unitTypeId,
        unit_types.name AS unitTypeName,
        positions.id AS positionId,
        positions.title AS positionTitle,
        COALESCE(holders.holderCount, 0) AS holderCount,
        holders.holderSummary
       FROM positions
       INNER JOIN units ON positions.unit_id = units.id
       INNER JOIN unit_types ON units.unit_type_id = unit_types.id
       LEFT JOIN (
         SELECT
           assignments.position_id,
           COUNT(*) AS holderCount,
           GROUP_CONCAT(persons.display_name ORDER BY assignments.is_primary DESC, persons.display_name SEPARATOR ', ') AS holderSummary
         FROM assignments
         INNER JOIN persons ON assignments.person_id = persons.id
         WHERE assignments.status = 'active'
           AND assignments.deleted_at IS NULL
           AND persons.status = 'active'
         GROUP BY assignments.position_id
       ) holders ON holders.position_id = positions.id
       WHERE ${unitPositionWhere.join(" AND ")}
       ORDER BY unit_types.hierarchy_level ASC, units.name ASC, positions.authority_level DESC, positions.title ASC
       LIMIT ?`,
      unitPositionParams
    ).then(([rows]) => rows)
  ]);

  const candidates: SendTargetCandidate[] = [
    ...unitRows.map((row) => ({
      hasActiveHolder: false,
      id: `unit:${row.id}`,
      type: "unit" as const,
      unitId: Number(row.id),
      unitName: String(row.name),
      unitTypeId: Number(row.unitTypeId),
      unitTypeName: String(row.unitTypeName)
    })),
    ...unitPositionRows.map((row) => ({
      hasActiveHolder: Number(row.holderCount || 0) > 0,
      holderSummary: row.holderSummary ? String(row.holderSummary) : null,
      id: String(row.id),
      positionId: Number(row.positionId),
      positionTitle: String(row.positionTitle),
      type: "unit_position" as const,
      unitId: Number(row.unitId),
      unitName: String(row.unitName),
      unitTypeId: Number(row.unitTypeId),
      unitTypeName: String(row.unitTypeName)
    }))
  ];

  return candidates
    .map((target) => ({
      ...target,
      allowedActions: requiredActionSchema.options
    }))
    .slice(0, limit);
}

function nextStatusForRequests(currentStatus: string, recipients: SendRecipientInput[]) {
  if (recipients.some((recipient) => recipient.required_action === "sign")) {
    return "pending_signatures";
  }
  if (recipients.some((recipient) => recipient.required_action === "edit")) {
    return "under_edit";
  }
  if (recipients.some((recipient) => recipient.required_action === "review")) {
    return "under_review";
  }
  if (["closed", "archived", "finalized", "serial_assigned"].includes(currentStatus)) {
    return currentStatus;
  }
  return "under_action";
}

const documentListQuerySchema = documentFilterQuerySchema.extend({
  limit: z.coerce.number().int().min(1).max(100).default(50),
  offset: z.coerce.number().int().min(0).default(0)
});

const documentStatsQuerySchema = documentFilterQuerySchema;

const uploadAttachmentSchema = z.object({
  attachment_type: z.string().trim().min(1).max(80).default("supporting_file"),
  title: optionalNullableString,
  description: optionalNullableString
});

const maxAttachmentBytes = 20 * 1024 * 1024;
const documentAttachmentStorageDir = "storage/document-attachments";
const allowedAttachmentMimeTypes = new Set([
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "text/plain",
  "text/csv",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-powerpoint",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation"
]);

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: maxAttachmentBytes, files: 1 },
  fileFilter: (_request, file, callback) => {
    if (allowedAttachmentMimeTypes.has(file.mimetype)) {
      callback(null, true);
      return;
    }

    callback(new AppError(422, "unsupported_attachment_type", "Attachment type is not allowed."));
  }
});

function makeInternalReference() {
  const date = new Date().toISOString().slice(0, 10).replaceAll("-", "");
  return `DOC-${date}-${randomBytes(4).toString("hex").toUpperCase()}`;
}

function todayInKabul() {
  const parts = new Intl.DateTimeFormat("en-US", {
    day: "2-digit",
    month: "2-digit",
    timeZone: kabulTimeZone,
    year: "numeric"
  }).formatToParts(new Date());
  const value = (type: "year" | "month" | "day") => parts.find((part) => part.type === type)?.value || "";
  return `${value("year")}-${value("month")}-${value("day")}`;
}

function safeUploadExtension(file: Express.Multer.File) {
  const extension = path.extname(file.originalname).toLowerCase();
  if (/^\.[a-z0-9]{1,12}$/.test(extension)) {
    return extension;
  }

  const fallbackByMimeType: Record<string, string> = {
    "application/pdf": ".pdf",
    "image/jpeg": ".jpg",
    "image/png": ".png",
    "image/webp": ".webp",
    "image/gif": ".gif",
    "text/plain": ".txt",
    "text/csv": ".csv",
    "application/msword": ".doc",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document": ".docx",
    "application/vnd.ms-excel": ".xls",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": ".xlsx",
    "application/vnd.ms-powerpoint": ".ppt",
    "application/vnd.openxmlformats-officedocument.presentationml.presentation": ".pptx"
  };

  return fallbackByMimeType[file.mimetype] || ".bin";
}

function clean<T extends Record<string, unknown>>(value: T): Record<string, unknown> {
  return Object.fromEntries(Object.entries(value).filter(([, item]) => item !== undefined));
}

function normalizeTemplateFields(value?: Record<string, string>) {
  return Object.fromEntries(
    Object.entries(value || {})
      .map(([key, item]) => [key.trim(), item.replace(/\r\n?/g, "\n").trimEnd()])
      .filter(([key, item]) => key && item)
  );
}

function jsonColumnString(value: unknown, fallback: Record<string, unknown> = {}) {
  if (!value) {
    return JSON.stringify(fallback);
  }
  return typeof value === "string" ? value : JSON.stringify(value);
}

function tipTapNodeContainsTable(value: unknown): boolean {
  if (!value || typeof value !== "object") {
    return false;
  }
  const node = value as { content?: unknown; type?: unknown };
  if (node.type === "table") {
    return true;
  }
  return Array.isArray(node.content) && node.content.some((child) => tipTapNodeContainsTable(child));
}

function assertDocumentContentAllowedByWriteMode(permission: DocumentWritePermission | null, content: ReturnType<typeof normalizeDocumentContent>) {
  if (!permission || permission.mode === "free") {
    return;
  }

  if (content.freeBlocks.length || tipTapNodeContainsTable(content.body)) {
    throw new AppError(
      403,
      "document_write_mode_locked",
      "Your write permission allows official fields and body text only. Tables and free placed blocks require free mode."
    );
  }
}

async function hasAssignedOpenTask(documentId: number, assignment: Awaited<ReturnType<typeof getActiveAssignment>>, conditionSql: string) {
  const [rows] = await pool.execute<RowDataPacket[]>(
    `SELECT *
     FROM document_tasks
     WHERE document_id = ?
       AND status = 'open'
       AND deleted_at IS NULL
       AND ${conditionSql}
       AND (
         assigned_assignment_id = ?
         OR (
           assigned_unit_id = ?
           AND (assigned_position_id IS NULL OR assigned_position_id = ?)
         )
       )
     LIMIT 1`,
    [documentId, assignment.id, assignment.unitId, assignment.positionId]
  );
  return rows[0] || null;
}

async function documentEditPermission(
  document: RowDataPacket,
  assignment: Awaited<ReturnType<typeof getActiveAssignment>>,
  response: Response
): Promise<DocumentWritePermission | null> {
  const status = String(document.status || "draft");
  if (["archived", "closed", "finalized", "serial_assigned"].includes(status)) {
    throw new AppError(409, "document_not_editable", "Finalized, closed, or archived documents cannot be edited.");
  }

  if (isAdmin(response)) {
    return null;
  }

  const editTask = await hasAssignedOpenTask(Number(document.id), assignment, "can_edit = TRUE");
  if (editTask) {
    return null;
  }

  if (Number(document.creator_assignment_id) === assignment.id && status === "draft") {
    return assertDocumentWritePermission(Number(document.document_type_id), assignment, response.locals.authUser?.roles || []);
  }

  throw new AppError(403, "document_edit_not_allowed", "You need an open edit request before editing this document.");
}

async function assertLifecyclePermission(
  document: RowDataPacket,
  assignment: Awaited<ReturnType<typeof getActiveAssignment>>,
  response: Response,
  permission: "can_archive" | "can_finalize"
) {
  if (isAdmin(response) || Number(document.creator_assignment_id) === assignment.id) {
    return;
  }

  const task = await hasAssignedOpenTask(Number(document.id), assignment, `${permission} = TRUE`);
  if (!task) {
    throw new AppError(403, "document_lifecycle_not_allowed", "You do not have permission for this document action.");
  }
}

type DocumentFilterQuery = z.infer<typeof documentFilterQuerySchema>;
type DocumentFilterKey = "scope" | "status" | "document_type_id" | "priority_level_id" | "confidentiality_level_id" | "date_from" | "date_to" | "q";
type DocumentScope = DocumentFilterQuery["scope"];

const registryScopes = ["accessible", "current_holder", "my_tasks", "signature_queue", "created_by_me"] as const;

type DocumentRegistryContext = {
  assignment: Awaited<ReturnType<typeof getActiveAssignment>>;
  userAssignmentIds: number[];
  userAssignmentPlaceholders: string;
};

async function getDocumentRegistryContext(request: Request): Promise<DocumentRegistryContext> {
  const assignment = await getActiveAssignment(request);
  const [assignmentRows] = await pool.execute<RowDataPacket[]>(
    "SELECT id FROM assignments WHERE person_id = ? AND deleted_at IS NULL",
    [assignment.personId]
  );
  const userAssignmentIds = assignmentRows.map((row) => Number(row.id));
  const userAssignmentPlaceholders = userAssignmentIds.length ? userAssignmentIds.map(() => "?").join(", ") : "NULL";

  return { assignment, userAssignmentIds, userAssignmentPlaceholders };
}

function addScopeWhere(scope: DocumentScope, context: DocumentRegistryContext, where: string[], params: any[]) {
  const { assignment, userAssignmentIds, userAssignmentPlaceholders } = context;

  if (scope === "created_by_me") {
    where.push(`documents.creator_assignment_id IN (${userAssignmentPlaceholders})`);
    params.push(...userAssignmentIds);
  } else if (scope === "current_holder") {
    where.push("documents.current_holder_unit_id = ?");
    params.push(assignment.unitId);
  } else if (scope === "origin_unit") {
    where.push("documents.origin_unit_id = ?");
    params.push(assignment.unitId);
  } else if (scope === "owner_unit") {
    where.push("documents.owner_unit_id = ?");
    params.push(assignment.unitId);
  } else if (scope === "my_tasks") {
    where.push(`EXISTS (
      SELECT 1
      FROM document_tasks
      WHERE document_tasks.document_id = documents.id
        AND document_tasks.status = 'open'
        AND document_tasks.deleted_at IS NULL
        AND (
          document_tasks.assigned_assignment_id = ?
          OR (
            document_tasks.assigned_unit_id = ?
            AND (document_tasks.assigned_position_id IS NULL OR document_tasks.assigned_position_id = ?)
          )
        )
    )`);
    params.push(assignment.id, assignment.unitId, assignment.positionId);
  } else if (scope === "signature_queue") {
    where.push(`EXISTS (
      SELECT 1
      FROM document_tasks
      WHERE document_tasks.document_id = documents.id
        AND document_tasks.status = 'open'
        AND document_tasks.deleted_at IS NULL
        AND (document_tasks.required_action = 'sign' OR document_tasks.can_sign = TRUE)
        AND (
          document_tasks.assigned_assignment_id = ?
          OR (
            document_tasks.assigned_unit_id = ?
            AND (document_tasks.assigned_position_id IS NULL OR document_tasks.assigned_position_id = ?)
          )
        )
    )`);
    params.push(assignment.id, assignment.unitId, assignment.positionId);
  }
}

function buildDocumentWhere(
  context: DocumentRegistryContext,
  response: Response,
  query: DocumentFilterQuery,
  skip: DocumentFilterKey[] = []
) {
  const { assignment, userAssignmentIds, userAssignmentPlaceholders } = context;
  const where = ["documents.deleted_at IS NULL"];
  const params: any[] = [];
  const skipped = new Set(skip);

  if (!isAdmin(response)) {
    where.push(`(
      documents.creator_assignment_id IN (${userAssignmentPlaceholders})
      OR documents.origin_unit_id = ?
      OR documents.owner_unit_id = ?
      OR documents.current_holder_unit_id = ?
      OR EXISTS (
        SELECT 1
        FROM document_tasks
        WHERE document_tasks.document_id = documents.id
          AND document_tasks.deleted_at IS NULL
          AND (
            document_tasks.assigned_assignment_id IN (${userAssignmentPlaceholders})
            OR (
              document_tasks.assigned_unit_id = ?
              AND (document_tasks.assigned_position_id IS NULL OR document_tasks.assigned_position_id = ?)
            )
          )
      )
      OR EXISTS (
        SELECT 1
        FROM signature_events
        WHERE signature_events.document_id = documents.id
          AND signature_events.assignment_id IN (${userAssignmentPlaceholders})
      )
    )`);
    params.push(
      ...userAssignmentIds,
      assignment.unitId,
      assignment.unitId,
      assignment.unitId,
      ...userAssignmentIds,
      assignment.unitId,
      assignment.positionId,
      ...userAssignmentIds
    );
  }

  if (!skipped.has("scope")) {
    addScopeWhere(query.scope, context, where, params);
  }

  if (query.status && !skipped.has("status")) {
    where.push("documents.status = ?");
    params.push(query.status);
  }

  if (query.document_type_id && !skipped.has("document_type_id")) {
    where.push("documents.document_type_id = ?");
    params.push(query.document_type_id);
  }

  if (query.priority_level_id && !skipped.has("priority_level_id")) {
    where.push("documents.priority_level_id = ?");
    params.push(query.priority_level_id);
  }

  if (query.confidentiality_level_id && !skipped.has("confidentiality_level_id")) {
    where.push("documents.confidentiality_level_id = ?");
    params.push(query.confidentiality_level_id);
  }

  if (query.date_from && !skipped.has("date_from")) {
    where.push("documents.document_date >= ?");
    params.push(query.date_from);
  }

  if (query.date_to && !skipped.has("date_to")) {
    where.push("documents.document_date <= ?");
    params.push(query.date_to);
  }

  if (query.q && !skipped.has("q")) {
    where.push(`(
      documents.subject LIKE ?
      OR documents.internal_reference LIKE ?
      OR documents.official_serial LIKE ?
    )`);
    const like = `%${query.q}%`;
    params.push(like, like, like);
  }

  return { params, where };
}

async function countDocuments(where: string[], params: any[]) {
  const [rows] = await pool.execute<RowDataPacket[]>(
    `SELECT COUNT(*) AS count
     FROM documents
     WHERE ${where.join(" AND ")}`,
    params
  );

  return Number(rows[0]?.count || 0);
}

async function getDocumentDetail(documentId: number) {
  const [documentRows] = await pool.execute<RowDataPacket[]>(
    `SELECT
      documents.*,
      document_types.code AS documentTypeCode,
      document_types.name AS documentTypeName,
      confidentiality_levels.code AS confidentialityCode,
      confidentiality_levels.name AS confidentialityName,
      priority_levels.code AS priorityCode,
      priority_levels.name AS priorityName,
      origin_units.name AS originUnitName,
      owner_units.name AS ownerUnitName,
      holder_units.name AS currentHolderUnitName
    FROM documents
    INNER JOIN document_types ON documents.document_type_id = document_types.id
    INNER JOIN confidentiality_levels ON documents.confidentiality_level_id = confidentiality_levels.id
    INNER JOIN priority_levels ON documents.priority_level_id = priority_levels.id
    INNER JOIN units AS origin_units ON documents.origin_unit_id = origin_units.id
    INNER JOIN units AS owner_units ON documents.owner_unit_id = owner_units.id
    INNER JOIN units AS holder_units ON documents.current_holder_unit_id = holder_units.id
    WHERE documents.id = ? AND documents.deleted_at IS NULL
    LIMIT 1`,
    [documentId]
  );
  const document = documentRows[0];

  if (!document) {
    throw notFound("Document");
  }

  const [versions, attachments, relations, workflowEvents, tasks, signatureEvents, serialAssignment, renders] = await Promise.all([
    pool.execute<RowDataPacket[]>(
      "SELECT * FROM document_versions WHERE document_id = ? ORDER BY version_number DESC",
      [documentId]
    ).then(([rows]) => rows),
    pool.execute<RowDataPacket[]>(
      `SELECT
        document_attachments.*,
        file_assets.original_filename AS originalFilename,
        file_assets.mime_type AS mimeType,
        file_assets.byte_size AS byteSize
      FROM document_attachments
      INNER JOIN file_assets ON document_attachments.file_asset_id = file_assets.id
      WHERE document_attachments.document_id = ?
        AND document_attachments.deleted_at IS NULL
      ORDER BY document_attachments.id DESC`,
      [documentId]
    ).then(([rows]) => rows),
    pool.execute<RowDataPacket[]>(
      `SELECT
        document_relations.*,
        related_documents.subject AS relatedSubject,
        related_documents.internal_reference AS relatedInternalReference
      FROM document_relations
      INNER JOIN documents AS related_documents ON document_relations.related_document_id = related_documents.id
      WHERE document_relations.source_document_id = ?
      ORDER BY document_relations.id DESC`,
      [documentId]
    ).then(([rows]) => rows),
    pool.execute<RowDataPacket[]>(
      "SELECT * FROM document_workflow_events WHERE document_id = ? ORDER BY created_at DESC",
      [documentId]
    ).then(([rows]) => rows),
    pool.execute<RowDataPacket[]>(
      `SELECT
        document_tasks.*,
        task_units.name AS assignedUnitName,
        task_positions.title AS assignedPositionTitle,
        assigned_persons.display_name AS assignedAssignmentName,
        creator_persons.display_name AS creatorName
       FROM document_tasks
       LEFT JOIN units AS task_units ON document_tasks.assigned_unit_id = task_units.id
       LEFT JOIN positions AS task_positions ON document_tasks.assigned_position_id = task_positions.id
       LEFT JOIN assignments AS assigned_assignments ON document_tasks.assigned_assignment_id = assigned_assignments.id
       LEFT JOIN persons AS assigned_persons ON assigned_assignments.person_id = assigned_persons.id
       LEFT JOIN assignments AS creator_assignments ON document_tasks.created_by_assignment_id = creator_assignments.id
       LEFT JOIN persons AS creator_persons ON creator_assignments.person_id = creator_persons.id
       WHERE document_tasks.document_id = ?
         AND document_tasks.deleted_at IS NULL
       ORDER BY document_tasks.id DESC`,
      [documentId]
    ).then(([rows]) => rows),
    pool.execute<RowDataPacket[]>(
      `SELECT
        signature_events.*,
        positions.title AS signerPositionTitle,
        units.name AS signerUnitName
      FROM signature_events
      INNER JOIN assignments ON signature_events.assignment_id = assignments.id
      INNER JOIN positions ON assignments.position_id = positions.id
      INNER JOIN units ON positions.unit_id = units.id
      WHERE signature_events.document_id = ?
      ORDER BY signature_events.created_at DESC`,
      [documentId]
    ).then(([rows]) => rows),
    pool.execute<RowDataPacket[]>(
      "SELECT * FROM serial_assignments WHERE document_id = ? LIMIT 1",
      [documentId]
    ).then(([rows]) => rows[0] || null),
    pool.execute<RowDataPacket[]>(
      `SELECT
        document_renders.*,
        file_assets.original_filename AS originalFilename,
        file_assets.mime_type AS mimeType,
        file_assets.byte_size AS byteSize
       FROM document_renders
       LEFT JOIN file_assets ON document_renders.file_asset_id = file_assets.id
       WHERE document_renders.document_id = ?
         AND document_renders.status = 'generated'
       ORDER BY document_renders.created_at DESC, document_renders.id DESC
       LIMIT 20`,
      [documentId]
    ).then(([rows]) => rows)
  ]);

  return {
    document,
    versions,
    attachments,
    relations,
    workflowEvents,
    tasks,
    signatureEvents,
    renders,
    serialAssignment: serialAssignment || null
  };
}

documentRouter.get("/", asyncHandler(async (request, response) => {
  const context = await getDocumentRegistryContext(request);
  const query = documentListQuerySchema.parse(request.query);
  const { where, params } = buildDocumentWhere(context, response, query);
  const admin = isAdmin(response);
  const writePermissions = admin
    ? []
    : await listDocumentWritePermissions(context.assignment, response.locals.authUser?.roles || []);
  const writableDocumentTypeIds = new Set(writePermissions.map((permission) => permission.documentTypeId));
  const [rows] = await pool.execute<RowDataPacket[]>(
    `SELECT
      documents.id,
      documents.uuid,
      documents.document_type_id AS documentTypeId,
      documents.priority_level_id AS priorityLevelId,
      documents.internal_reference AS internalReference,
      documents.document_date AS documentDate,
      documents.document_date AS document_date,
      documents.subject,
      documents.status,
      documents.official_serial AS officialSerial,
      documents.creator_assignment_id AS creatorAssignmentId,
      documents.created_at AS createdAt,
      documents.updated_at AS updatedAt,
      document_types.code AS documentTypeCode,
      document_types.name AS documentTypeName,
      priority_levels.code AS priorityCode,
      priority_levels.name AS priorityName,
      priority_levels.color AS priorityColor,
      holder_units.name AS currentHolderUnitName
    FROM documents
    INNER JOIN document_types ON documents.document_type_id = document_types.id
    INNER JOIN priority_levels ON documents.priority_level_id = priority_levels.id
    INNER JOIN units AS holder_units ON documents.current_holder_unit_id = holder_units.id
    WHERE ${where.join(" AND ")}
    ORDER BY documents.updated_at DESC
    LIMIT ? OFFSET ?`,
    [...params, query.limit, query.offset]
  );

  ok(response, rows.map((row) => {
    const status = String(row.status || "draft");
    const draft = status === "draft";
    const creator = Number(row.creatorAssignmentId) === context.assignment.id;
    const creatorCanWrite = creator && writableDocumentTypeIds.has(Number(row.documentTypeId));

    return {
      ...row,
      canDelete: draft && (admin || creator),
      canDownloadPdf: true,
      canEdit: draft && (admin || creatorCanWrite),
      canOpenPdf: true
    };
  }));
}));

documentRouter.get("/stats", asyncHandler(async (request, response) => {
  const context = await getDocumentRegistryContext(request);
  const query = documentStatsQuerySchema.parse(request.query);
  const totalFilter = buildDocumentWhere(context, response, query);
  const statusFilter = buildDocumentWhere(context, response, query, ["status"]);
  const typeFilter = buildDocumentWhere(context, response, query, ["document_type_id"]);
  const priorityFilter = buildDocumentWhere(context, response, query, ["priority_level_id"]);

  const [total, scopeCounts, statusCounts, typeCounts, priorityCounts] = await Promise.all([
    countDocuments(totalFilter.where, totalFilter.params),
    Promise.all(registryScopes.map(async (scope) => {
      const scopeFilter = buildDocumentWhere(context, response, { ...query, scope });
      return [scope, await countDocuments(scopeFilter.where, scopeFilter.params)] as const;
    })),
    pool.execute<RowDataPacket[]>(
      `SELECT documents.status AS status, COUNT(*) AS count
       FROM documents
       WHERE ${statusFilter.where.join(" AND ")}
       GROUP BY documents.status
       ORDER BY documents.status ASC`,
      statusFilter.params
    ).then(([rows]) => rows.map((row) => ({
      count: Number(row.count || 0),
      status: String(row.status)
    }))),
    pool.execute<RowDataPacket[]>(
      `SELECT
        document_types.id AS id,
        document_types.code AS code,
        document_types.name AS name,
        COUNT(*) AS count
       FROM documents
       INNER JOIN document_types ON documents.document_type_id = document_types.id
       WHERE ${typeFilter.where.join(" AND ")}
       GROUP BY document_types.id, document_types.code, document_types.name
       ORDER BY document_types.name ASC`,
      typeFilter.params
    ).then(([rows]) => rows.map((row) => ({
      code: String(row.code),
      count: Number(row.count || 0),
      id: Number(row.id),
      name: String(row.name)
    }))),
    pool.execute<RowDataPacket[]>(
      `SELECT
        priority_levels.id AS id,
        priority_levels.code AS code,
        priority_levels.name AS name,
        priority_levels.color AS color,
        COUNT(*) AS count
       FROM documents
       INNER JOIN priority_levels ON documents.priority_level_id = priority_levels.id
       WHERE ${priorityFilter.where.join(" AND ")}
       GROUP BY priority_levels.id, priority_levels.code, priority_levels.name, priority_levels.color, priority_levels.rank
       ORDER BY priority_levels.rank ASC, priority_levels.name ASC`,
      priorityFilter.params
    ).then(([rows]) => rows.map((row) => ({
      code: String(row.code),
      color: row.color ? String(row.color) : null,
      count: Number(row.count || 0),
      id: Number(row.id),
      name: String(row.name)
    })))
  ]);

  ok(response, {
    priorityCounts,
    scopeCounts: Object.fromEntries(scopeCounts),
    statusCounts,
    total,
    typeCounts,
    updatedAt: new Date().toISOString()
  });
}));

documentRouter.post("/", asyncHandler(async (request, response) => {
  const input = createDocumentSchema.parse(request.body);
  const assignment = await getActiveAssignment(request);
  const writePermission = isAdmin(response)
    ? null
    : await assertDocumentWritePermission(input.document_type_id, assignment, response.locals.authUser?.roles || []);
  let createdDocumentId = 0;

  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const unitId = assignment.unitId;
    if (!isAdmin(response)) {
      const requestedUnitIds = [
        input.origin_unit_id,
        input.owner_unit_id,
        input.current_holder_unit_id
      ].filter((value) => value !== undefined);
      if (requestedUnitIds.some((value) => Number(value) !== unitId)) {
        throw new AppError(403, "document_unit_override_denied", "Non-admin users can create documents only for their active assignment unit.");
      }
    }

    const originUnitId = isAdmin(response) ? input.origin_unit_id || unitId : unitId;
    const ownerUnitId = isAdmin(response) ? input.owner_unit_id || unitId : unitId;
    const holderUnitId = isAdmin(response) ? input.current_holder_unit_id || unitId : unitId;
    const internalReference = makeInternalReference();
    const documentDate = input.document_date || todayInKabul();
    const templateFields = normalizeTemplateFields(input.template_fields);
    const documentContent = normalizeDocumentContent(input.document_content, {
      body: input.body,
      date: documentDate,
      subject: input.subject,
      summary: input.summary || null,
      templateFields
    });
    assertDocumentContentAllowedByWriteMode(writePermission, documentContent);
    const derivedBody = documentContentToPlainText(documentContent) || input.body;
    const contentHash = calculateDocumentContentHash({
      body: derivedBody,
      confidentiality_level_id: input.confidentiality_level_id,
      current_version_number: 1,
      document_content: documentContent,
      document_date: documentDate,
      document_type_id: input.document_type_id,
      priority_level_id: input.priority_level_id,
      subject: input.subject,
      summary: input.summary || null,
      template_fields: templateFields
    });

    const [documentResult] = await connection.execute<ResultSetHeader>(
      `INSERT INTO documents (
        uuid, internal_reference, document_date, document_type_id, subject, summary, body, template_fields, document_content,
        origin_unit_id, owner_unit_id, current_holder_unit_id, creator_assignment_id,
        confidentiality_level_id, priority_level_id, status, current_version_number
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        uuid(),
        internalReference,
        documentDate,
        input.document_type_id,
        input.subject,
        input.summary || null,
        derivedBody,
        JSON.stringify(templateFields),
        JSON.stringify(documentContent),
        originUnitId,
        ownerUnitId,
        holderUnitId,
        assignment.id,
        input.confidentiality_level_id,
        input.priority_level_id,
        "draft",
        1
      ]
    );
    const documentId = documentResult.insertId;
    createdDocumentId = Number(documentId);

    const snapshot = {
      documentId,
      internalReference,
      documentDate,
      subject: input.subject,
      summary: input.summary || null,
      body: derivedBody,
      templateFields,
      documentContent,
      status: "draft"
    };

    await connection.execute<ResultSetHeader>(
      `INSERT INTO document_versions (
        uuid, document_id, version_number, content_hash, changed_by_assignment_id,
        subject, summary, body, template_fields, document_content, material_change, change_reason, snapshot
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        uuid(),
        documentId,
        1,
        contentHash,
        assignment.id,
        input.subject,
        input.summary || null,
        derivedBody,
        JSON.stringify(templateFields),
        JSON.stringify(documentContent),
        true,
        input.change_reason || "Initial draft.",
        JSON.stringify(snapshot)
      ]
    );

    await connection.execute<ResultSetHeader>(
      `INSERT INTO document_workflow_events (
        uuid, document_id, actor_assignment_id, action, from_status,
        to_status, from_unit_id, to_unit_id, note, payload
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        uuid(),
        documentId,
        assignment.id,
        "create",
        null,
        "draft",
        null,
        holderUnitId,
        "Draft created.",
        JSON.stringify({ internalReference })
      ]
    );

    await writeAuditLog(request, { action: "document.create", entityType: "document", entityId: documentId }, connection);
    await connection.commit();
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }

  await refreshSearchIndexForEntitySafe("document", createdDocumentId);
  created(response, await getDocumentDetail(createdDocumentId));
}));

documentRouter.get("/:documentId/send-options", asyncHandler(async (request, response) => {
  const { documentId } = documentIdSchema.parse(request.params);
  const query = sendOptionsQuerySchema.parse(request.query);
  const { document } = await assertDocumentAccess(documentId, request, response);
  const targets = await listSendTargetCandidates(query);
  const terminal = ["closed", "archived"].includes(String(document.status));
  const actions = requiredActionSchema.options.map((action) => ({
    action,
    defaultPermissions: defaultPermissionsFor(action),
    disabledReason: terminal ? "Closed or archived documents cannot be sent." : null,
    label: requiredActionLabel(action)
  }));
  const purposes = actions.map((action) => ({
    action: action.action,
    category: action.action === "sign" ? "signature" : action.action,
    disabledReason: action.disabledReason,
    label: action.label
  }));

  ok(response, {
    documentState: {
      canArchive: !terminal,
      canDispatch: Boolean(document.official_serial) && !terminal,
      canFinalize: !terminal,
      officialSerial: document.official_serial || null,
      status: String(document.status || "draft")
    },
    actions,
    purposes,
    targets
  });
}));

documentRouter.get("/:documentId", asyncHandler(async (request, response) => {
  const { documentId } = documentIdSchema.parse(request.params);
  await assertDocumentAccess(documentId, request, response);
  ok(response, await getDocumentDetail(documentId));
}));

documentRouter.post("/:documentId/send", asyncHandler(async (request, response) => {
  const { documentId } = documentIdSchema.parse(request.params);
  const input = sendDocumentSchema.parse(request.body);
  const { document, assignment } = await assertDocumentAccess(documentId, request, response);
  if (["closed", "archived"].includes(String(document.status))) {
    throw new AppError(409, "document_terminal_status", "Closed or archived documents cannot be sent.");
  }

  const recipients = normalizeSendRecipients(input);
  const targets = await Promise.all(recipients.map((recipient) => unitPositionTarget(recipient.to_unit_id, recipient.to_position_id || null)));
  const nextStatus = nextStatusForRequests(String(document.status || "draft"), recipients);
  let eventId = 0;
  const taskIds: number[] = [];

  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const [eventResult] = await connection.execute<ResultSetHeader>(
      `INSERT INTO document_workflow_events (
        uuid, document_id, actor_assignment_id, action, required_action,
        from_status, to_status, from_unit_id, to_unit_id, to_position_id,
        note, return_reason, payload, permissions
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        uuid(),
        documentId,
        assignment.id,
        "send",
        recipients.length === 1 ? recipients[0].required_action : "multiple",
        document.status,
        nextStatus,
        document.current_holder_unit_id,
        targets[0]?.unitId || null,
        targets[0]?.positionId || null,
        input.note || null,
        input.return_reason || null,
        JSON.stringify({
          recipientCount: recipients.length,
          recipients: recipients.map((recipient, index) => ({
            requiredAction: recipient.required_action,
            requiresComment: Boolean(recipient.requires_comment),
            targetId: targets[index]?.id || null,
            toPositionId: recipient.to_position_id || null,
            toUnitId: recipient.to_unit_id
          })),
          sendRenderId: null
        }),
        JSON.stringify(recipients.map((recipient) => permissionsForRecipient(recipient)))
      ]
    );
    eventId = Number(eventResult.insertId);

    for (const [index, recipient] of recipients.entries()) {
      const target = targets[index];
      const permissions = permissionsForRecipient(recipient);
      const title = `${requiredActionLabel(recipient.required_action)} document`;
      const [taskResult] = await connection.execute<ResultSetHeader>(
        `INSERT INTO document_tasks (
          uuid, document_id, workflow_event_id, created_by_assignment_id,
          assigned_unit_id, assigned_position_id, assigned_assignment_id,
          task_type, required_action, requires_comment, can_edit, can_sign, can_forward,
          can_finalize, can_archive, status, title, description, due_at, payload
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          uuid(),
          documentId,
          eventId,
          assignment.id,
          recipient.to_unit_id,
          recipient.to_position_id || null,
          null,
          recipient.required_action,
          recipient.required_action,
          Boolean(recipient.requires_comment),
          permissions.can_edit,
          permissions.can_sign,
          permissions.can_forward,
          permissions.can_finalize,
          permissions.can_archive,
          "open",
          title,
          recipient.note || input.note || null,
          recipient.due_at || input.due_at || null,
          JSON.stringify({
            requiredAction: recipient.required_action,
            requiresComment: Boolean(recipient.requires_comment),
            sendRenderId: null,
            targetId: target.id,
            targetLabel: target.type === "unit_position" ? `${target.positionTitle} - ${target.unitName}` : target.unitName
          })
        ]
      );
      taskIds.push(Number(taskResult.insertId));
    }

    await connection.execute<ResultSetHeader>(
      `UPDATE documents
       SET status = ?,
           current_holder_unit_id = ?,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [nextStatus, targets[0]?.unitId || document.current_holder_unit_id, documentId]
    );
    await writeAuditLog(request, {
      action: "document.send",
      entityType: "document",
      entityId: documentId,
      metadata: { eventId, sendRenderId: null, taskIds }
    }, connection);
    await connection.commit();
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }

  const [eventRows] = await pool.execute<RowDataPacket[]>("SELECT * FROM document_workflow_events WHERE id = ? LIMIT 1", [eventId]);
  const placeholders = taskIds.length ? taskIds.map(() => "?").join(", ") : "NULL";
  const [taskRows] = await pool.execute<RowDataPacket[]>(
    `SELECT * FROM document_tasks WHERE id IN (${placeholders}) ORDER BY id ASC`,
    taskIds
  );
  await refreshSearchIndexForEntitySafe("document", documentId);

  created(response, {
    event: eventRows[0] || null,
    tasks: taskRows,
    sendRender: null,
    message: `Sent to ${recipients.length} receiver${recipients.length === 1 ? "" : "s"}.`
  });
}));

documentRouter.post("/:documentId/finalize", asyncHandler(async (request, response) => {
  const { documentId } = documentIdSchema.parse(request.params);
  const input = finalizeDocumentSchema.parse(request.body);
  const { document, assignment } = await assertDocumentAccess(documentId, request, response);
  await assertLifecyclePermission(document, assignment, response, "can_finalize");

  let serialAssignment: RowDataPacket | null = null;

  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const [lockedRows] = await connection.execute<RowDataPacket[]>(
      "SELECT * FROM documents WHERE id = ? AND deleted_at IS NULL LIMIT 1 FOR UPDATE",
      [documentId]
    );
    const lockedDocument = lockedRows[0];
    if (!lockedDocument) {
      throw notFound("Document");
    }
    if (["archived", "closed"].includes(String(lockedDocument.status))) {
      throw new AppError(409, "document_terminal_status", "Closed or archived documents cannot be finalized.");
    }
    serialAssignment = await assignOfficialSerial(connection, {
      assignmentId: assignment.id,
      documentId,
      status: "finalized"
    });
    await markWalkInRequestFinalizedForDocument(connection, documentId);

    await connection.execute<ResultSetHeader>(
      `INSERT INTO document_workflow_events (
        uuid, document_id, actor_assignment_id, action, from_status,
        to_status, from_unit_id, to_unit_id, note, payload
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        uuid(),
        documentId,
        assignment.id,
        "finalize",
        lockedDocument.status,
        "finalized",
        lockedDocument.current_holder_unit_id,
        lockedDocument.current_holder_unit_id,
        input.note || `Official serial assigned: ${serialAssignment?.serial_value || ""}`.trim(),
        JSON.stringify({ serialAssignmentId: serialAssignment?.id || null, serial: serialAssignment?.serial_value || null })
      ]
    );
    await connection.execute<ResultSetHeader>(
      `UPDATE document_tasks
       SET status = 'completed',
           completed_at = CURRENT_TIMESTAMP,
           completed_by_assignment_id = ?,
           completion_note = COALESCE(completion_note, 'Completed by document finalization.'),
           updated_at = CURRENT_TIMESTAMP
       WHERE document_id = ?
         AND status = 'open'
         AND deleted_at IS NULL
         AND can_finalize = TRUE
         AND (
           assigned_assignment_id = ?
           OR (
             assigned_unit_id = ?
             AND (assigned_position_id IS NULL OR assigned_position_id = ?)
           )
         )`,
      [assignment.id, documentId, assignment.id, assignment.unitId, assignment.positionId]
    );
    await writeAuditLog(request, {
      action: "document.finalize",
      entityType: "document",
      entityId: documentId,
      metadata: { serial: serialAssignment?.serial_value || null }
    }, connection);
    await connection.commit();
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }

  await refreshSearchIndexForEntitySafe("document", documentId);
  ok(response, {
    detail: await getDocumentDetail(documentId),
    finalRender: null,
    serialAssignment
  });
}));

documentRouter.post("/:documentId/archive", asyncHandler(async (request, response) => {
  const { documentId } = documentIdSchema.parse(request.params);
  const input = archiveDocumentSchema.parse(request.body);
  const { document, assignment } = await assertDocumentAccess(documentId, request, response);
  await assertLifecyclePermission(document, assignment, response, "can_archive");

  let serialAssignment: RowDataPacket | null = null;

  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const [lockedRows] = await connection.execute<RowDataPacket[]>(
      "SELECT * FROM documents WHERE id = ? AND deleted_at IS NULL LIMIT 1 FOR UPDATE",
      [documentId]
    );
    const lockedDocument = lockedRows[0];
    if (!lockedDocument) {
      throw notFound("Document");
    }
    if (String(lockedDocument.status) === "archived") {
      throw new AppError(409, "document_already_archived", "This document is already archived.");
    }
    if (String(lockedDocument.status) === "closed") {
      throw new AppError(409, "document_closed", "Closed documents cannot be archived.");
    }
    await assertWalkInArchiveAllowedForDocument(connection, documentId);
    serialAssignment = await assignOfficialSerial(connection, {
      assignmentId: assignment.id,
      documentId,
      status: "archived"
    });
    await connection.execute<ResultSetHeader>(
      `UPDATE documents
       SET status = 'archived',
           archived_at = CURRENT_TIMESTAMP,
           archived_by_assignment_id = ?,
           archive_reason = ?,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [assignment.id, input.reason || input.note || "Archived.", documentId]
    );
    await markWalkInRequestArchivedForDocument(connection, documentId);
    await connection.execute<ResultSetHeader>(
      `INSERT INTO document_workflow_events (
        uuid, document_id, actor_assignment_id, action, from_status,
        to_status, from_unit_id, to_unit_id, note, payload
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        uuid(),
        documentId,
        assignment.id,
        "archive",
        lockedDocument.status,
        "archived",
        lockedDocument.current_holder_unit_id,
        lockedDocument.current_holder_unit_id,
        input.reason || input.note || "Document archived.",
        JSON.stringify({ serialAssignmentId: serialAssignment?.id || null, serial: serialAssignment?.serial_value || null })
      ]
    );
    await connection.execute<ResultSetHeader>(
      `UPDATE document_tasks
       SET status = 'completed',
           completed_at = CURRENT_TIMESTAMP,
           completed_by_assignment_id = ?,
           completion_note = COALESCE(completion_note, 'Completed by document archive.'),
           updated_at = CURRENT_TIMESTAMP
       WHERE document_id = ?
         AND status = 'open'
         AND deleted_at IS NULL
         AND can_archive = TRUE
         AND (
           assigned_assignment_id = ?
           OR (
             assigned_unit_id = ?
             AND (assigned_position_id IS NULL OR assigned_position_id = ?)
           )
         )`,
      [assignment.id, documentId, assignment.id, assignment.unitId, assignment.positionId]
    );
    await writeAuditLog(request, {
      action: "document.archive",
      entityType: "document",
      entityId: documentId,
      metadata: { serial: serialAssignment?.serial_value || null }
    }, connection);
    await connection.commit();
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }

  await refreshSearchIndexForEntitySafe("document", documentId);
  ok(response, {
    detail: await getDocumentDetail(documentId),
    finalRender: null,
    serialAssignment
  });
}));

documentRouter.delete("/:documentId", asyncHandler(async (request, response) => {
  const { documentId } = documentIdSchema.parse(request.params);
  const { assignment } = await assertDocumentAccess(documentId, request, response);
  const admin = isAdmin(response);

  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const [lockedRows] = await connection.execute<RowDataPacket[]>(
      "SELECT * FROM documents WHERE id = ? AND deleted_at IS NULL LIMIT 1 FOR UPDATE",
      [documentId]
    );
    const lockedDocument = lockedRows[0];
    if (!lockedDocument) {
      throw notFound("Document");
    }
    if (String(lockedDocument.status || "draft") !== "draft") {
      throw new AppError(409, "document_delete_draft_only", "Only draft documents can be deleted.");
    }
    if (!admin && Number(lockedDocument.creator_assignment_id) !== assignment.id) {
      throw new AppError(403, "document_delete_not_allowed", "Only the draft creator can delete this document.");
    }

    await connection.execute<ResultSetHeader>(
      `INSERT INTO document_workflow_events (
        uuid, document_id, actor_assignment_id, action, from_status,
        to_status, from_unit_id, to_unit_id, note, payload
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        uuid(),
        documentId,
        assignment.id,
        "delete",
        lockedDocument.status,
        "deleted",
        lockedDocument.current_holder_unit_id,
        lockedDocument.current_holder_unit_id,
        "Draft deleted.",
        JSON.stringify({ deletedByAssignmentId: assignment.id })
      ]
    );
    await connection.execute<ResultSetHeader>(
      `UPDATE document_tasks
       SET status = 'canceled',
           completed_at = CURRENT_TIMESTAMP,
           completed_by_assignment_id = ?,
           completion_note = COALESCE(completion_note, 'Canceled by draft deletion.'),
           deleted_at = CURRENT_TIMESTAMP,
           updated_at = CURRENT_TIMESTAMP
       WHERE document_id = ?
         AND status = 'open'
         AND deleted_at IS NULL`,
      [assignment.id, documentId]
    );
    await connection.execute<ResultSetHeader>(
      `UPDATE document_layout_drafts
       SET status = 'deleted',
           deleted_at = CURRENT_TIMESTAMP,
           updated_at = CURRENT_TIMESTAMP
       WHERE document_id = ?
         AND deleted_at IS NULL`,
      [documentId]
    );
    await connection.execute<ResultSetHeader>(
      "UPDATE documents SET deleted_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
      [documentId]
    );
    await writeAuditLog(request, { action: "document.delete", entityType: "document", entityId: documentId }, connection);
    await connection.commit();
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }

  await refreshSearchIndexForEntitySafe("document", documentId);
  ok(response, { deleted: true, id: documentId, status: "deleted" });
}));

documentRouter.patch("/:documentId", asyncHandler(async (request, response) => {
  const { documentId } = documentIdSchema.parse(request.params);
  const input = updateDocumentSchema.parse(request.body);
  const { document, assignment } = await assertDocumentAccess(documentId, request, response);

  const writePermission = await documentEditPermission(document, assignment, response);

  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const nextVersion = Number(document.current_version_number) + 1;
    const templateFields = input.template_fields === undefined ? undefined : normalizeTemplateFields(input.template_fields);
    const shouldWriteDocumentContent = input.document_content !== undefined
      || templateFields !== undefined
      || input.body !== undefined
      || input.subject !== undefined
      || input.summary !== undefined
      || input.document_date !== undefined;
    const documentContent = shouldWriteDocumentContent
      ? normalizeDocumentContent(input.document_content ?? document.document_content, {
        body: input.body ?? document.body,
        date: input.document_date === undefined ? document.document_date : input.document_date,
        subject: input.subject ?? document.subject,
        summary: input.summary === undefined ? document.summary : input.summary,
        templateFields: templateFields ?? normalizeTemplateFieldRecord(document.template_fields)
      })
      : undefined;
    if (documentContent) {
      assertDocumentContentAllowedByWriteMode(writePermission, documentContent);
    }
    const derivedBody = documentContent ? documentContentToPlainText(documentContent) : input.body;
    const patch = clean({
      subject: input.subject,
      document_date: input.document_date,
      summary: input.summary,
      body: derivedBody,
      template_fields: templateFields === undefined ? undefined : JSON.stringify(templateFields),
      document_content: documentContent === undefined ? undefined : JSON.stringify(documentContent),
      confidentiality_level_id: input.confidentiality_level_id,
      priority_level_id: input.priority_level_id,
      current_version_number: nextVersion
    });
    const set: string[] = [];
    const values: any[] = [];
    for (const column of ["subject", "document_date", "summary", "body", "template_fields", "document_content", "confidentiality_level_id", "priority_level_id", "current_version_number"]) {
      if (patch[column] !== undefined) {
        set.push(`\`${column}\` = ?`);
        values.push(patch[column]);
      }
    }
    await connection.execute<ResultSetHeader>(
      `UPDATE documents
       SET ${set.join(", ")}, updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [...values, documentId]
    );

    const [updatedRows] = await connection.execute<RowDataPacket[]>(
      "SELECT * FROM documents WHERE id = ? LIMIT 1",
      [documentId]
    );
    const updated = updatedRows[0];
    const contentHash = calculateDocumentContentHash(updated);
    await connection.execute<ResultSetHeader>(
      `INSERT INTO document_versions (
        uuid, document_id, version_number, content_hash, changed_by_assignment_id,
        subject, summary, body, template_fields, document_content, material_change, change_reason, snapshot
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        uuid(),
        documentId,
        nextVersion,
        contentHash,
        assignment.id,
        updated.subject,
        updated.summary,
        updated.body,
        jsonColumnString(updated.template_fields),
        jsonColumnString(updated.document_content),
        input.material_change,
        input.change_reason || "Document updated.",
        JSON.stringify(updated)
      ]
    );

    await connection.execute<ResultSetHeader>(
      `INSERT INTO document_workflow_events (
        uuid, document_id, actor_assignment_id, action, from_status,
        to_status, from_unit_id, to_unit_id, note, payload
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        uuid(),
        documentId,
        assignment.id,
        "edit",
        document.status,
        updated.status,
        document.current_holder_unit_id,
        updated.current_holder_unit_id,
        input.change_reason || "Document updated.",
        JSON.stringify({ versionNumber: nextVersion })
      ]
    );

    await writeAuditLog(request, { action: "document.edit", entityType: "document", entityId: documentId }, connection);
    await connection.commit();
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }

  await refreshSearchIndexForEntitySafe("document", documentId);
  ok(response, await getDocumentDetail(documentId));
}));

documentRouter.post("/:documentId/relations", asyncHandler(async (request, response) => {
  const { documentId } = documentIdSchema.parse(request.params);
  const input = createRelationSchema.parse(request.body);
  const { assignment } = await assertDocumentAccess(documentId, request, response);
  await assertDocumentAccess(input.related_document_id, request, response);

  const [result] = await pool.execute<ResultSetHeader>(
    `INSERT INTO document_relations (
      uuid, source_document_id, related_document_id, relation_type,
      created_by_assignment_id, note
    ) VALUES (?, ?, ?, ?, ?, ?)`,
    [uuid(), documentId, input.related_document_id, input.relation_type, assignment.id, input.note || null]
  );
  const id = result.insertId;

  await writeAuditLog(request, { action: "document.relation.create", entityType: "document_relation", entityId: id });
  const [rows] = await pool.execute<RowDataPacket[]>("SELECT * FROM document_relations WHERE id = ? LIMIT 1", [id]);
  created(response, rows[0] || null);
}));

documentRouter.post("/:documentId/attachments/upload", upload.single("file"), asyncHandler(async (request, response) => {
  const { documentId } = documentIdSchema.parse(request.params);
  const input = uploadAttachmentSchema.parse(request.body);
  const file = request.file;
  if (!file) {
    throw new AppError(422, "attachment_file_required", "Upload a file to attach.");
  }

  const { assignment } = await assertDocumentAccess(documentId, request, response);
  const checksum = createHash("sha256").update(file.buffer).digest("hex");
  const storedFilename = `${uuid()}${safeUploadExtension(file)}`;
  const storageDir = path.resolve(process.cwd(), documentAttachmentStorageDir);
  const storagePath = path.join(documentAttachmentStorageDir, storedFilename);
  await fs.mkdir(storageDir, { recursive: true });
  await fs.writeFile(path.resolve(process.cwd(), storagePath), file.buffer);

  let attachmentId = 0;
  let fileAssetId = 0;
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const [fileResult] = await connection.execute<ResultSetHeader>(
      `INSERT INTO file_assets (
        uuid, uploaded_by_user_id, uploaded_by_assignment_id, purpose,
        storage_disk, storage_path, original_filename, stored_filename,
        mime_type, byte_size, checksum_sha256, encryption_status, status, metadata
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        uuid(),
        request.session.userId || null,
        assignment.id,
        "document_attachment",
        "local",
        storagePath,
        file.originalname,
        storedFilename,
        file.mimetype,
        file.size,
        checksum,
        "not_encrypted",
        "active",
        JSON.stringify({ uploadField: "file" })
      ]
    );
    fileAssetId = Number(fileResult.insertId);

    const [attachmentResult] = await connection.execute<ResultSetHeader>(
      `INSERT INTO document_attachments (
        uuid, document_id, file_asset_id, uploaded_by_assignment_id,
        attachment_type, title, description, status
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        uuid(),
        documentId,
        fileAssetId,
        assignment.id,
        input.attachment_type,
        input.title || file.originalname,
        input.description || null,
        "active"
      ]
    );
    attachmentId = Number(attachmentResult.insertId);

    await connection.execute<ResultSetHeader>(
      `INSERT INTO document_workflow_events (
        uuid, document_id, actor_assignment_id, action, from_status,
        to_status, note, payload
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        uuid(),
        documentId,
        assignment.id,
        "attach_file",
        null,
        null,
        input.title || file.originalname,
        JSON.stringify({ fileAssetId, attachmentId, uploaded: true })
      ]
    );

    await writeAuditLog(request, { action: "document.attachment.upload", entityType: "document_attachment", entityId: attachmentId }, connection);
    await connection.commit();
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }

  const [rows] = await pool.execute<RowDataPacket[]>(
    `SELECT
      document_attachments.*,
      file_assets.original_filename AS originalFilename,
      file_assets.mime_type AS mimeType,
      file_assets.byte_size AS byteSize
     FROM document_attachments
     INNER JOIN file_assets ON document_attachments.file_asset_id = file_assets.id
     WHERE document_attachments.id = ?
     LIMIT 1`,
    [attachmentId]
  );
  created(response, rows[0] || null);
}));

documentRouter.post("/:documentId/attachments", asyncHandler(async (request, response) => {
  const { documentId } = documentIdSchema.parse(request.params);
  const input = createAttachmentSchema.parse(request.body);
  const { assignment } = await assertDocumentAccess(documentId, request, response);

  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const [fileResult] = await connection.execute<ResultSetHeader>(
      `INSERT INTO file_assets (
        uuid, uploaded_by_user_id, uploaded_by_assignment_id, purpose,
        storage_disk, storage_path, original_filename, stored_filename,
        mime_type, byte_size, checksum_sha256, encryption_status, status, metadata
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        uuid(),
        request.session.userId || null,
        assignment.id,
        input.purpose,
        input.storage_disk,
        input.storage_path,
        input.original_filename,
        input.stored_filename || null,
        input.mime_type,
        input.byte_size,
        input.checksum_sha256 || null,
        input.encryption_status,
        "active",
        JSON.stringify(input.metadata || {})
      ]
    );
    const fileAssetId = fileResult.insertId;

    const [attachmentResult] = await connection.execute<ResultSetHeader>(
      `INSERT INTO document_attachments (
        uuid, document_id, file_asset_id, uploaded_by_assignment_id,
        attachment_type, title, description, status
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        uuid(),
        documentId,
        fileAssetId,
        assignment.id,
        input.attachment_type,
        input.title || null,
        input.description || null,
        "active"
      ]
    );
    const attachmentId = attachmentResult.insertId;

    await connection.execute<ResultSetHeader>(
      `INSERT INTO document_workflow_events (
        uuid, document_id, actor_assignment_id, action, from_status,
        to_status, note, payload
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        uuid(),
        documentId,
        assignment.id,
        "attach_file",
        null,
        null,
        input.title || input.original_filename,
        JSON.stringify({ fileAssetId, attachmentId })
      ]
    );

    await writeAuditLog(request, { action: "document.attachment.create", entityType: "document_attachment", entityId: attachmentId }, connection);
    await connection.commit();
    const [rows] = await pool.execute<RowDataPacket[]>("SELECT * FROM document_attachments WHERE id = ? LIMIT 1", [attachmentId]);
    created(response, rows[0] || null);
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}));

documentRouter.post("/:documentId/tasks", asyncHandler(async (request, response) => {
  const { documentId } = documentIdSchema.parse(request.params);
  const input = createTaskSchema.parse(request.body);
  const { assignment } = await assertDocumentAccess(documentId, request, response);

  const [result] = await pool.execute<ResultSetHeader>(
    `INSERT INTO document_tasks (
      uuid, document_id, workflow_event_id, created_by_assignment_id,
      assigned_unit_id, assigned_position_id, assigned_assignment_id,
      task_type, title, description, due_at, status
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      uuid(),
      documentId,
      input.workflow_event_id || null,
      assignment.id,
      input.assigned_unit_id || null,
      input.assigned_position_id || null,
      input.assigned_assignment_id || null,
      input.task_type,
      input.title,
      input.description || null,
      input.due_at || null,
      "open"
    ]
  );
  const id = result.insertId;

  await writeAuditLog(request, { action: "document.task.create", entityType: "document_task", entityId: id });
  const [rows] = await pool.execute<RowDataPacket[]>("SELECT * FROM document_tasks WHERE id = ? LIMIT 1", [id]);
  created(response, rows[0] || null);
}));

documentRouter.patch("/:documentId/tasks/:taskId/complete", asyncHandler(async (request, response) => {
  const { documentId } = documentIdSchema.parse(request.params);
  const { taskId } = z.object({ taskId: z.coerce.number().int().positive() }).parse(request.params);
  const input = completeTaskSchema.parse(request.body);
  const { assignment } = await assertDocumentAccess(documentId, request, response);

  const [taskRows] = await pool.execute<RowDataPacket[]>(
    `SELECT *
     FROM document_tasks
     WHERE id = ? AND document_id = ? AND deleted_at IS NULL
     LIMIT 1`,
    [taskId, documentId]
  );
  const task = taskRows[0];

  if (!task) {
    throw notFound("Document task");
  }
  if (String(task.status) !== "open") {
    throw new AppError(409, "document_task_not_open", "Only open requests can be completed.");
  }
  const assignedToActive = Number(task.assigned_assignment_id || 0) === assignment.id
    || Boolean(
      Number(task.assigned_unit_id || 0) === assignment.unitId
      && (!task.assigned_position_id || Number(task.assigned_position_id) === assignment.positionId)
    );
  if (!assignedToActive && !isAdmin(response)) {
    throw new AppError(403, "document_task_not_assigned", "This request is not assigned to your active position.");
  }
  const completionNote = input.completion_note?.trim() || "";
  if (task.requires_comment && !completionNote) {
    throw new AppError(422, "comment_required", "A comment is required to complete this request.");
  }

  await pool.execute<ResultSetHeader>(
    `UPDATE document_tasks
     SET status = 'completed',
         completed_at = CURRENT_TIMESTAMP,
         completed_by_assignment_id = ?,
         responded_by_assignment_id = ?,
         completion_note = ?,
         response_note = ?,
         updated_at = CURRENT_TIMESTAMP
     WHERE id = ?`,
    [assignment.id, assignment.id, completionNote || null, completionNote || null, taskId]
  );

  await writeAuditLog(request, { action: "document.task.complete", entityType: "document_task", entityId: taskId });
  const [rows] = await pool.execute<RowDataPacket[]>("SELECT * FROM document_tasks WHERE id = ? LIMIT 1", [taskId]);
  ok(response, rows[0] || null);
}));
