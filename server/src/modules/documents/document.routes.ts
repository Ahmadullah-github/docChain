import { randomBytes } from "node:crypto";
import { Router } from "express";
import type { ResultSetHeader, RowDataPacket } from "mysql2/promise";
import { z } from "zod";
import { pool } from "../../db/mysql";
import { requireAuth } from "../../middleware/auth";
import { asyncHandler } from "../../shared/async-handler";
import { writeAuditLog } from "../../shared/audit";
import { assertDocumentAccess, getActiveAssignment, isAdmin } from "../../shared/document-access";
import { AppError, notFound } from "../../shared/errors";
import { created, ok } from "../../shared/http";
import { uuid } from "../../shared/ids";
import { refreshSearchIndexForEntitySafe } from "../search/global-search.service";
import { executeWorkflowAction, listAllowedWorkflowActions, workflowActionInputSchema } from "../workflow/workflow.service";

export const documentRouter = Router();

documentRouter.use(requireAuth);

const documentIdSchema = z.object({
  documentId: z.coerce.number().int().positive()
});

const optionalNullableString = z.string().trim().min(1).nullable().optional();

const createDocumentSchema = z.object({
  document_type_id: z.coerce.number().int().positive(),
  subject: z.string().trim().min(1).max(255),
  summary: optionalNullableString,
  body: z.string().default(""),
  confidentiality_level_id: z.coerce.number().int().positive(),
  priority_level_id: z.coerce.number().int().positive(),
  origin_unit_id: z.coerce.number().int().positive().optional(),
  owner_unit_id: z.coerce.number().int().positive().optional(),
  current_holder_unit_id: z.coerce.number().int().positive().optional(),
  change_reason: optionalNullableString
});

const updateDocumentSchema = z.object({
  subject: z.string().trim().min(1).max(255).optional(),
  summary: optionalNullableString,
  body: z.string().optional(),
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

const completeTaskSchema = z.object({
  completion_note: optionalNullableString
});

function makeInternalReference() {
  const date = new Date().toISOString().slice(0, 10).replaceAll("-", "");
  return `DOC-${date}-${randomBytes(4).toString("hex").toUpperCase()}`;
}

function clean<T extends Record<string, unknown>>(value: T): Record<string, unknown> {
  return Object.fromEntries(Object.entries(value).filter(([, item]) => item !== undefined));
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

  const [versions, attachments, relations, workflowEvents, tasks, signatureSlots, signatureEvents, serialAssignment] = await Promise.all([
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
      "SELECT * FROM document_tasks WHERE document_id = ? AND deleted_at IS NULL ORDER BY id DESC",
      [documentId]
    ).then(([rows]) => rows),
    pool.execute<RowDataPacket[]>(
      `SELECT
        signature_slots.*,
        positions.title AS requiredPositionTitle,
        positions.code AS requiredPositionCode,
        units.name AS targetUnitName
      FROM signature_slots
      INNER JOIN positions ON signature_slots.required_position_id = positions.id
      LEFT JOIN units ON signature_slots.target_unit_id = units.id
      WHERE signature_slots.document_id = ?
      ORDER BY signature_slots.step_number ASC, signature_slots.id ASC`,
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
      INNER JOIN units ON assignments.unit_id = units.id
      WHERE signature_events.document_id = ?
      ORDER BY signature_events.created_at DESC`,
      [documentId]
    ).then(([rows]) => rows),
    pool.execute<RowDataPacket[]>(
      "SELECT * FROM serial_assignments WHERE document_id = ? LIMIT 1",
      [documentId]
    ).then(([rows]) => rows[0] || null)
  ]);

  return {
    document,
    versions,
    attachments,
    relations,
    workflowEvents,
    tasks,
    signatureSlots,
    signatureEvents,
    serialAssignment: serialAssignment || null
  };
}

documentRouter.get("/", asyncHandler(async (request, response) => {
  const assignment = await getActiveAssignment(request);
  const query = z.object({
    status: z.string().trim().min(1).optional(),
    q: z.string().trim().min(1).optional(),
    document_type_id: z.coerce.number().int().positive().optional(),
    limit: z.coerce.number().int().min(1).max(100).default(50)
  }).parse(request.query);

  const [assignmentRows] = await pool.execute<RowDataPacket[]>(
    "SELECT id FROM assignments WHERE person_id = ? AND deleted_at IS NULL",
    [assignment.personId]
  );
  const userAssignmentIds = assignmentRows.map((row) => Number(row.id));

  const where = ["documents.deleted_at IS NULL"];
  const params: any[] = [];
  if (!isAdmin(response)) {
    const placeholders = userAssignmentIds.length ? userAssignmentIds.map(() => "?").join(", ") : "NULL";
    where.push(`(
      documents.creator_assignment_id IN (${placeholders})
      OR documents.origin_unit_id = ?
      OR documents.owner_unit_id = ?
      OR documents.current_holder_unit_id = ?
    )`);
    params.push(...userAssignmentIds, assignment.unitId, assignment.unitId, assignment.unitId);
  }

  if (query.status) {
    where.push("documents.status = ?");
    params.push(query.status);
  }

  if (query.document_type_id) {
    where.push("documents.document_type_id = ?");
    params.push(query.document_type_id);
  }

  if (query.q) {
    where.push(`(
      documents.subject LIKE ?
      OR documents.internal_reference LIKE ?
      OR documents.official_serial LIKE ?
    )`);
    const like = `%${query.q}%`;
    params.push(like, like, like);
  }

  params.push(query.limit);
  const [rows] = await pool.execute<RowDataPacket[]>(
    `SELECT
      documents.id,
      documents.uuid,
      documents.internal_reference AS internalReference,
      documents.subject,
      documents.status,
      documents.official_serial AS officialSerial,
      documents.created_at AS createdAt,
      documents.updated_at AS updatedAt,
      document_types.code AS documentTypeCode,
      document_types.name AS documentTypeName,
      holder_units.name AS currentHolderUnitName
    FROM documents
    INNER JOIN document_types ON documents.document_type_id = document_types.id
    INNER JOIN units AS holder_units ON documents.current_holder_unit_id = holder_units.id
    WHERE ${where.join(" AND ")}
    ORDER BY documents.updated_at DESC
    LIMIT ?`,
    params
  );

  ok(response, rows);
}));

documentRouter.post("/", asyncHandler(async (request, response) => {
  const input = createDocumentSchema.parse(request.body);
  const assignment = await getActiveAssignment(request);
  let createdDocumentId = 0;

  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const unitId = assignment.unitId;
    const originUnitId = input.origin_unit_id || unitId;
    const ownerUnitId = input.owner_unit_id || unitId;
    const holderUnitId = input.current_holder_unit_id || unitId;
    const internalReference = makeInternalReference();

    const [documentResult] = await connection.execute<ResultSetHeader>(
      `INSERT INTO documents (
        uuid, internal_reference, document_type_id, subject, summary, body,
        origin_unit_id, owner_unit_id, current_holder_unit_id, creator_assignment_id,
        confidentiality_level_id, priority_level_id, status, current_version_number
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        uuid(),
        internalReference,
        input.document_type_id,
        input.subject,
        input.summary || null,
        input.body,
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
      subject: input.subject,
      summary: input.summary || null,
      body: input.body,
      status: "draft"
    };

    await connection.execute<ResultSetHeader>(
      `INSERT INTO document_versions (
        uuid, document_id, version_number, changed_by_assignment_id,
        subject, summary, body, material_change, change_reason, snapshot
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        uuid(),
        documentId,
        1,
        assignment.id,
        input.subject,
        input.summary || null,
        input.body,
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

documentRouter.get("/:documentId", asyncHandler(async (request, response) => {
  const { documentId } = documentIdSchema.parse(request.params);
  await assertDocumentAccess(documentId, request, response);
  ok(response, await getDocumentDetail(documentId));
}));

documentRouter.get("/:documentId/workflow-actions", asyncHandler(async (request, response) => {
  const { documentId } = documentIdSchema.parse(request.params);
  ok(response, await listAllowedWorkflowActions(documentId, request, response));
}));

documentRouter.patch("/:documentId", asyncHandler(async (request, response) => {
  const { documentId } = documentIdSchema.parse(request.params);
  const input = updateDocumentSchema.parse(request.body);
  const { document, assignment } = await assertDocumentAccess(documentId, request, response);

  if (!["draft", "under_review"].includes(document.status)) {
    throw new AppError(409, "document_not_editable", "Only draft or under-review documents are editable in Phase 2.");
  }

  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const nextVersion = Number(document.current_version_number) + 1;
    const patch = clean({
      subject: input.subject,
      summary: input.summary,
      body: input.body,
      confidentiality_level_id: input.confidentiality_level_id,
      priority_level_id: input.priority_level_id,
      current_version_number: nextVersion
    });
    const set: string[] = [];
    const values: any[] = [];
    for (const column of ["subject", "summary", "body", "confidentiality_level_id", "priority_level_id", "current_version_number"]) {
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
    await connection.execute<ResultSetHeader>(
      `INSERT INTO document_versions (
        uuid, document_id, version_number, changed_by_assignment_id,
        subject, summary, body, material_change, change_reason, snapshot
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        uuid(),
        documentId,
        nextVersion,
        assignment.id,
        updated.subject,
        updated.summary,
        updated.body,
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

documentRouter.post("/:documentId/events", asyncHandler(async (request, response) => {
  const { documentId } = documentIdSchema.parse(request.params);
  const input = workflowActionInputSchema.parse(request.body);
  created(response, await executeWorkflowAction(documentId, input, request, response));
}));

documentRouter.post("/:documentId/workflow-actions", asyncHandler(async (request, response) => {
  const { documentId } = documentIdSchema.parse(request.params);
  const input = workflowActionInputSchema.parse(request.body);
  created(response, await executeWorkflowAction(documentId, input, request, response));
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

  await pool.execute<ResultSetHeader>(
    `UPDATE document_tasks
     SET status = 'completed',
         completed_at = CURRENT_TIMESTAMP,
         completed_by_assignment_id = ?,
         completion_note = ?,
         updated_at = CURRENT_TIMESTAMP
     WHERE id = ?`,
    [assignment.id, input.completion_note || null, taskId]
  );

  await writeAuditLog(request, { action: "document.task.complete", entityType: "document_task", entityId: taskId });
  const [rows] = await pool.execute<RowDataPacket[]>("SELECT * FROM document_tasks WHERE id = ? LIMIT 1", [taskId]);
  ok(response, rows[0] || null);
}));
