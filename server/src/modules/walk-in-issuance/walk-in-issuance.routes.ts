import { randomBytes } from "node:crypto";
import { Router } from "express";
import type { Response } from "express";
import type { PoolConnection, ResultSetHeader, RowDataPacket } from "mysql2/promise";
import { z } from "zod";
import { pool } from "../../db/mysql";
import { requireAuth } from "../../middleware/auth";
import { asyncHandler } from "../../shared/async-handler";
import { writeAuditLog } from "../../shared/audit";
import { getActiveAssignment, isAdmin, type ActiveAssignment } from "../../shared/document-access";
import { calculateDocumentContentHash } from "../../shared/document-hash";
import { assertDocumentWritePermission, listDocumentWritePermissions, type DocumentWritePermission } from "../../shared/document-write-rules";
import { AppError, notFound } from "../../shared/errors";
import { created, ok } from "../../shared/http";
import { uuid } from "../../shared/ids";
import { refreshSearchIndexForEntitySafe } from "../search/global-search.service";
import { documentContentToPlainText, normalizeDocumentContent } from "../documents/document-content";
import { markWalkInRequestArchivedForDocument } from "./walk-in-issuance.service";

export const walkInIssuanceRouter = Router();

walkInIssuanceRouter.use(requireAuth);

const kabulTimeZone = "Asia/Kabul";
const optionalNullableString = z.string().trim().min(1).nullable().optional();
const optionalNullableDate = z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional();
const templateFieldKeySchema = z.string().trim().min(1).max(80).regex(/^[a-zA-Z0-9_.-]+$/);
const templateFieldsSchema = z.record(templateFieldKeySchema, z.string().max(10_000)).optional();

const requestIdSchema = z.object({
  requestId: z.coerce.number().int().positive()
});

const externalPersonInputSchema = z.object({
  first_name: z.string().trim().min(1).max(120),
  last_name: z.string().trim().min(1).max(120),
  father_name: z.string().trim().min(1).max(120),
  phone_number: z.string().trim().min(1).max(60),
  tazkira_number: z.string().trim().min(1).max(120),
  relationship_to_subject: z.string().trim().min(1).max(80).optional(),
  address: optionalNullableString,
  notes: optionalNullableString
});

const studentFieldsSchema = z.object({
  is_student: z.boolean().default(false),
  faculty_id: z.coerce.number().int().positive().optional(),
  department_id: z.coerce.number().int().positive().optional(),
  semester: z.string().trim().min(1).max(40).optional(),
  academic_year: z.string().trim().min(1).max(40).nullable().optional(),
  student_registration_number: z.string().trim().min(1).max(120).nullable().optional(),
  student_status: z.string().trim().min(1).max(80).nullable().optional(),
  student_notes: z.string().trim().min(1).max(2000).nullable().optional()
});

const createIssuanceRequestSchema = studentFieldsSchema.extend({
  document_type_id: z.coerce.number().int().positive(),
  person: externalPersonInputSchema.optional(),
  requester: externalPersonInputSchema.optional(),
  subject: externalPersonInputSchema.optional(),
  taker: externalPersonInputSchema.optional(),
  relationship_to_subject: z.string().trim().min(1).max(80).optional(),
  purpose: optionalNullableString,
  destination_organization: optionalNullableString
});

const updateIssuancePersonsSchema = studentFieldsSchema.partial().extend({
  person: externalPersonInputSchema.optional(),
  requester: externalPersonInputSchema.optional(),
  subject: externalPersonInputSchema.optional(),
  taker: externalPersonInputSchema.optional(),
  relationship_to_subject: z.string().trim().min(1).max(80).optional()
});

const createDocumentFromRequestSchema = z.object({
  subject: z.string().trim().min(1).max(255).optional(),
  document_date: optionalNullableDate,
  summary: optionalNullableString,
  body: z.string().default(""),
  document_content: z.unknown().optional(),
  template_fields: templateFieldsSchema,
  confidentiality_level_id: z.coerce.number().int().positive().optional(),
  priority_level_id: z.coerce.number().int().positive().optional(),
  change_reason: optionalNullableString
});

const printEventSchema = z.object({
  print_type: z.enum(["original", "copy", "reprint"]).default("original"),
  print_reason: optionalNullableString,
  copy_number: z.coerce.number().int().positive().default(1)
});

const handoverSchema = z.object({
  handover_method: z.enum(["physical_original", "physical_copy", "reprint"]).default("physical_original"),
  copy_count: z.coerce.number().int().positive().default(1),
  receiver_signature_asset_id: z.coerce.number().int().positive().nullable().optional(),
  receiver_thumbprint_asset_id: z.coerce.number().int().positive().nullable().optional(),
  printed_snapshot_id: z.coerce.number().int().positive().nullable().optional(),
  handover_note: optionalNullableString
});

const archiveSchema = z.object({
  reason: z.string().trim().min(1).max(2000).optional(),
  note: optionalNullableString
});

const cancelSchema = z.object({
  reason: z.string().trim().min(1).max(2000).optional(),
  note: optionalNullableString
});

type ExternalPersonInput = z.infer<typeof externalPersonInputSchema>;
type CreateIssuanceRequestInput = z.infer<typeof createIssuanceRequestSchema>;
type UpdateIssuancePersonsInput = z.infer<typeof updateIssuancePersonsSchema>;
type CreateDocumentFromRequestInput = z.infer<typeof createDocumentFromRequestSchema>;

type RolePeople = {
  relationshipToSubject: string;
  requester: ExternalPersonInput;
  subject: ExternalPersonInput;
  taker: ExternalPersonInput;
};

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

function makeInternalReference() {
  const date = new Date().toISOString().slice(0, 10).replaceAll("-", "");
  return `DOC-${date}-${randomBytes(4).toString("hex").toUpperCase()}`;
}

function normalizeTemplateFields(value?: Record<string, string>) {
  return Object.fromEntries(
    Object.entries(value || {})
      .map(([key, item]) => [key.trim(), item.replace(/\r\n?/g, "\n").trimEnd()])
      .filter(([key, item]) => key && item)
  );
}

function personName(person: Pick<ExternalPersonInput, "father_name" | "first_name" | "last_name">) {
  return [person.first_name, person.last_name, `child of ${person.father_name}`].filter(Boolean).join(" ");
}

function personIdentityKey(person: ExternalPersonInput) {
  return JSON.stringify({
    address: person.address || null,
    father_name: person.father_name,
    first_name: person.first_name,
    last_name: person.last_name,
    notes: person.notes || null,
    phone_number: person.phone_number,
    tazkira_number: person.tazkira_number
  });
}

function rolePeopleFromInput(input: Pick<CreateIssuanceRequestInput, "person" | "relationship_to_subject" | "requester" | "subject" | "taker">): RolePeople {
  const base = input.person || input.taker || input.subject || input.requester;
  if (!base) {
    throw new AppError(422, "external_person_required", "Provide requester, subject, or taker information.");
  }

  const requester = input.requester || base;
  const subject = input.subject || base;
  const taker = input.taker || base;
  const sameTakerAndSubject = personIdentityKey(taker) === personIdentityKey(subject);
  const relationshipToSubject = taker.relationship_to_subject || input.relationship_to_subject || (sameTakerAndSubject ? "self" : "");

  if (!relationshipToSubject.trim()) {
    throw new AppError(422, "relationship_to_subject_required", "Relationship to the document subject is required for the physical receiver.");
  }

  return {
    relationshipToSubject: relationshipToSubject.trim(),
    requester,
    subject,
    taker
  };
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

async function listAvailableWalkInDocumentTypes(assignment: ActiveAssignment, roles: string[], response: Response) {
  const permissions = isAdmin(response) ? null : await listDocumentWritePermissions(assignment, roles);
  const allowedIds = permissions ? permissions.map((permission) => permission.documentTypeId) : [];
  const allowedClause = permissions ? `AND document_types.id IN (${allowedIds.length ? allowedIds.map(() => "?").join(", ") : "NULL"})` : "";

  const [rows] = await pool.execute<RowDataPacket[]>(
    `SELECT DISTINCT
       document_types.id,
       document_types.uuid,
       document_types.code,
       document_types.name,
       document_types.description,
       document_types.requires_serial,
       document_types.status
     FROM document_types
     WHERE document_types.status = 'active'
       ${allowedClause}
       AND EXISTS (
         SELECT 1
         FROM document_template_bindings
         INNER JOIN document_templates ON document_template_bindings.template_id = document_templates.id
         INNER JOIN document_template_versions ON document_template_bindings.template_version_id = document_template_versions.id
         WHERE document_template_bindings.status = 'active'
           AND document_templates.status = 'published'
           AND document_template_versions.status = 'active'
           AND document_template_bindings.variant = 'official'
           AND (
             document_template_bindings.document_type_id = document_types.id
             OR document_template_bindings.document_type_id IS NULL
           )
       )
     ORDER BY document_types.name ASC`,
    allowedIds
  );
  return rows;
}

async function assertWalkInDocumentTypeAvailable(documentTypeId: number, assignment: ActiveAssignment, roles: string[], response: Response) {
  const permission = isAdmin(response)
    ? null
    : await assertDocumentWritePermission(documentTypeId, assignment, roles);
  const [rows] = await pool.execute<RowDataPacket[]>(
    `SELECT document_types.id
     FROM document_types
     WHERE document_types.id = ?
       AND document_types.status = 'active'
       AND EXISTS (
         SELECT 1
         FROM document_template_bindings
         INNER JOIN document_templates ON document_template_bindings.template_id = document_templates.id
         INNER JOIN document_template_versions ON document_template_bindings.template_version_id = document_template_versions.id
         WHERE document_template_bindings.status = 'active'
           AND document_templates.status = 'published'
           AND document_template_versions.status = 'active'
           AND document_template_bindings.variant = 'official'
           AND (
             document_template_bindings.document_type_id = document_types.id
             OR document_template_bindings.document_type_id IS NULL
           )
       )
     LIMIT 1`,
    [documentTypeId]
  );
  if (!rows[0]) {
    throw new AppError(403, "walk_in_document_type_unavailable", "This document type is not available for walk-in issuance.");
  }
  return permission;
}

async function assertIssuanceAccess(row: RowDataPacket, assignment: ActiveAssignment, response: Response) {
  if (isAdmin(response) || Number(row.handled_by_assignment_id) === assignment.id) {
    return;
  }
  throw new AppError(403, "walk_in_request_access_denied", "You cannot work with this walk-in issuance request.");
}

async function lockedIssuanceRequest(connection: PoolConnection, requestId: number, assignment: ActiveAssignment, response: Response) {
  const [rows] = await connection.execute<RowDataPacket[]>(
    "SELECT * FROM document_issuance_requests WHERE id = ? LIMIT 1 FOR UPDATE",
    [requestId]
  );
  const row = rows[0];
  if (!row) {
    throw notFound("Walk-in issuance request");
  }
  await assertIssuanceAccess(row, assignment, response);
  return row;
}

async function insertExternalPerson(connection: PoolConnection, person: ExternalPersonInput) {
  const [result] = await connection.execute<ResultSetHeader>(
    `INSERT INTO external_persons (
      uuid, first_name, last_name, father_name, phone_number,
      tazkira_number, address, notes
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      uuid(),
      person.first_name,
      person.last_name,
      person.father_name,
      person.phone_number,
      person.tazkira_number,
      person.address || null,
      person.notes || null
    ]
  );
  return Number(result.insertId);
}

async function insertRolePeople(connection: PoolConnection, people: RolePeople) {
  const idsByKey = new Map<string, number>();
  async function idFor(person: ExternalPersonInput) {
    const key = personIdentityKey(person);
    const existing = idsByKey.get(key);
    if (existing) {
      return existing;
    }
    const id = await insertExternalPerson(connection, person);
    idsByKey.set(key, id);
    return id;
  }

  return {
    requesterPersonId: await idFor(people.requester),
    subjectPersonId: await idFor(people.subject),
    takerPersonId: await idFor(people.taker)
  };
}

async function assertUnitKind(connection: PoolConnection, unitId: number, unitTypeCode: "department" | "faculty") {
  const [rows] = await connection.execute<RowDataPacket[]>(
    `SELECT units.id
     FROM units
     INNER JOIN unit_types ON units.unit_type_id = unit_types.id
     WHERE units.id = ?
       AND units.status = 'active'
       AND units.deleted_at IS NULL
       AND unit_types.code = ?
     LIMIT 1`,
    [unitId, unitTypeCode]
  );
  if (!rows[0]) {
    throw new AppError(422, `invalid_${unitTypeCode}`, `Selected ${unitTypeCode} does not exist or is inactive.`);
  }
}

async function upsertStudentProfile(connection: PoolConnection, subjectPersonId: number, input: Pick<CreateIssuanceRequestInput, "academic_year" | "department_id" | "faculty_id" | "is_student" | "semester" | "student_notes" | "student_registration_number" | "student_status">) {
  if (!input.is_student) {
    await connection.execute<ResultSetHeader>("DELETE FROM student_claimant_profiles WHERE external_person_id = ?", [subjectPersonId]);
    return;
  }

  if (!input.faculty_id || !input.department_id || !input.semester) {
    throw new AppError(422, "student_details_required", "Faculty, department, and semester are required for student walk-in issuance.");
  }

  await assertUnitKind(connection, input.faculty_id, "faculty");
  await assertUnitKind(connection, input.department_id, "department");
  await connection.execute<ResultSetHeader>(
    `INSERT INTO student_claimant_profiles (
      uuid, external_person_id, faculty_id, department_id, semester,
      academic_year, student_registration_number, student_status, notes
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON DUPLICATE KEY UPDATE
      faculty_id = VALUES(faculty_id),
      department_id = VALUES(department_id),
      semester = VALUES(semester),
      academic_year = VALUES(academic_year),
      student_registration_number = VALUES(student_registration_number),
      student_status = VALUES(student_status),
      notes = VALUES(notes),
      updated_at = CURRENT_TIMESTAMP`,
    [
      uuid(),
      subjectPersonId,
      input.faculty_id,
      input.department_id,
      input.semester,
      input.academic_year || null,
      input.student_registration_number || null,
      input.student_status || null,
      input.student_notes || null
    ]
  );
}

async function defaultReferenceId(connection: PoolConnection, table: "confidentiality_levels" | "priority_levels") {
  const [rows] = await connection.execute<RowDataPacket[]>(
    `SELECT id
     FROM ${table}
     WHERE status = 'active'
     ORDER BY is_default DESC, \`rank\` ASC, id ASC
     LIMIT 1`
  );
  const row = rows[0];
  if (!row) {
    throw new AppError(409, `${table}_required`, `No active ${table.replaceAll("_", " ")} record exists.`);
  }
  return Number(row.id);
}

async function fetchIssuanceRequestDetail(requestId: number, assignment: ActiveAssignment, response: Response) {
  const [requestRows] = await pool.execute<RowDataPacket[]>(
    `SELECT
       document_issuance_requests.*,
       document_types.code AS documentTypeCode,
       document_types.name AS documentTypeName,
       documents.status AS documentStatus,
       documents.official_serial AS officialSerial
     FROM document_issuance_requests
     INNER JOIN document_types ON document_issuance_requests.document_type_id = document_types.id
     LEFT JOIN documents ON document_issuance_requests.document_id = documents.id
     WHERE document_issuance_requests.id = ?
     LIMIT 1`,
    [requestId]
  );
  const issuanceRequest = requestRows[0];
  if (!issuanceRequest) {
    throw notFound("Walk-in issuance request");
  }
  await assertIssuanceAccess(issuanceRequest, assignment, response);

  const personIds = Array.from(new Set([
    Number(issuanceRequest.requester_person_id),
    Number(issuanceRequest.subject_person_id),
    Number(issuanceRequest.taker_person_id)
  ]));
  const [personRows] = await pool.execute<RowDataPacket[]>(
    `SELECT *
     FROM external_persons
     WHERE id IN (${personIds.map(() => "?").join(", ")})`,
    personIds
  );
  const personById = new Map(personRows.map((row) => [Number(row.id), row]));

  const [profileRows] = await pool.execute<RowDataPacket[]>(
    `SELECT
       student_claimant_profiles.*,
       faculties.name AS facultyName,
       departments.name AS departmentName
     FROM student_claimant_profiles
     LEFT JOIN units AS faculties ON student_claimant_profiles.faculty_id = faculties.id
     LEFT JOIN units AS departments ON student_claimant_profiles.department_id = departments.id
     WHERE student_claimant_profiles.external_person_id = ?
     LIMIT 1`,
    [issuanceRequest.subject_person_id]
  );

  const [documentRows, printRows, handoverRows] = await Promise.all([
    issuanceRequest.document_id
      ? pool.execute<RowDataPacket[]>("SELECT * FROM documents WHERE id = ? LIMIT 1", [issuanceRequest.document_id]).then(([rows]) => rows)
      : Promise.resolve([]),
    pool.execute<RowDataPacket[]>(
      `SELECT *
       FROM document_print_events
       WHERE issuance_request_id = ?
       ORDER BY printed_at DESC, id DESC`,
      [requestId]
    ).then(([rows]) => rows),
    pool.execute<RowDataPacket[]>(
      `SELECT *
       FROM document_handover_records
       WHERE issuance_request_id = ?
       ORDER BY handed_over_at DESC, id DESC`,
      [requestId]
    ).then(([rows]) => rows)
  ]);

  return {
    document: documentRows[0] || null,
    handoverRecords: handoverRows,
    printEvents: printRows,
    request: issuanceRequest,
    requester: personById.get(Number(issuanceRequest.requester_person_id)) || null,
    studentProfile: profileRows[0] || null,
    subject: personById.get(Number(issuanceRequest.subject_person_id)) || null,
    taker: personById.get(Number(issuanceRequest.taker_person_id)) || null
  };
}

async function fetchDocumentForUpdate(connection: PoolConnection, documentId: number) {
  const [rows] = await connection.execute<RowDataPacket[]>(
    "SELECT * FROM documents WHERE id = ? AND deleted_at IS NULL LIMIT 1 FOR UPDATE",
    [documentId]
  );
  const document = rows[0];
  if (!document) {
    throw notFound("Document");
  }
  return document;
}

async function insertWorkflowEvent(connection: PoolConnection, input: {
  action: string;
  assignmentId: number;
  document: RowDataPacket;
  fromStatus?: string | null;
  note: string;
  payload?: Record<string, unknown>;
  toStatus?: string;
}) {
  await connection.execute<ResultSetHeader>(
    `INSERT INTO document_workflow_events (
      uuid, document_id, actor_assignment_id, action, from_status,
      to_status, from_unit_id, to_unit_id, note, payload
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      uuid(),
      input.document.id,
      input.assignmentId,
      input.action,
      input.fromStatus ?? input.document.status,
      input.toStatus ?? input.document.status,
      input.document.current_holder_unit_id,
      input.document.current_holder_unit_id,
      input.note,
      JSON.stringify(input.payload || {})
    ]
  );
}

async function createDraftDocumentForRequest(connection: PoolConnection, input: {
  assignment: ActiveAssignment;
  documentInput: CreateDocumentFromRequestInput;
  issuanceRequest: RowDataPacket;
  subjectPerson: ExternalPersonInput;
  writePermission: DocumentWritePermission | null;
}) {
  const documentDate = input.documentInput.document_date || todayInKabul();
  const templateFields = normalizeTemplateFields(input.documentInput.template_fields);
  const subject = input.documentInput.subject || `Walk-in document for ${personName(input.subjectPerson)}`;
  const summary = input.documentInput.summary || input.issuanceRequest.purpose || null;
  const documentContent = normalizeDocumentContent(input.documentInput.document_content, {
    body: input.documentInput.body,
    date: documentDate,
    subject,
    summary,
    templateFields
  });
  assertDocumentContentAllowedByWriteMode(input.writePermission, documentContent);
  const derivedBody = documentContentToPlainText(documentContent) || input.documentInput.body;
  const confidentialityId = input.documentInput.confidentiality_level_id || await defaultReferenceId(connection, "confidentiality_levels");
  const priorityId = input.documentInput.priority_level_id || await defaultReferenceId(connection, "priority_levels");
  const internalReference = makeInternalReference();

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
      input.issuanceRequest.document_type_id,
      subject,
      summary,
      derivedBody,
      JSON.stringify(templateFields),
      JSON.stringify(documentContent),
      input.assignment.unitId,
      input.assignment.unitId,
      input.assignment.unitId,
      input.assignment.id,
      confidentialityId,
      priorityId,
      "draft",
      1
    ]
  );
  const documentId = Number(documentResult.insertId);
  const [createdRows] = await connection.execute<RowDataPacket[]>(
    "SELECT * FROM documents WHERE id = ? LIMIT 1",
    [documentId]
  );
  const createdDocument = createdRows[0];
  if (!createdDocument) {
    throw notFound("Document");
  }
  const contentHash = calculateDocumentContentHash(createdDocument);
  const snapshot = {
    documentContent,
    documentDate,
    documentId,
    internalReference,
    status: "draft",
    subject,
    summary,
    templateFields
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
      input.assignment.id,
      subject,
      summary,
      derivedBody,
      JSON.stringify(templateFields),
      JSON.stringify(documentContent),
      true,
      input.documentInput.change_reason || "Walk-in issuance draft created.",
      JSON.stringify(snapshot)
    ]
  );

  const [documentRows] = await connection.execute<RowDataPacket[]>(
    "SELECT * FROM documents WHERE id = ? LIMIT 1",
    [documentId]
  );
  const document = documentRows[0];
  await insertWorkflowEvent(connection, {
    action: "walk_in_create",
    assignmentId: input.assignment.id,
    document,
    fromStatus: null,
    note: "Walk-in issuance draft created.",
    payload: { internalReference, issuanceRequestId: Number(input.issuanceRequest.id) },
    toStatus: "draft"
  });

  return documentId;
}

walkInIssuanceRouter.get("/document-types", asyncHandler(async (request, response) => {
  const assignment = await getActiveAssignment(request, "loading walk-in document types");
  const rows = await listAvailableWalkInDocumentTypes(assignment, response.locals.authUser?.roles || [], response);
  ok(response, rows);
}));

walkInIssuanceRouter.get("/reference", asyncHandler(async (request, response) => {
  const assignment = await getActiveAssignment(request, "loading walk-in issuance reference data");
  const documentTypesPromise = listAvailableWalkInDocumentTypes(assignment, response.locals.authUser?.roles || [], response);
  const [documentTypes, confidentialityLevels, priorityLevels, faculties, departments] = await Promise.all([
    documentTypesPromise,
    pool.execute<RowDataPacket[]>(
      `SELECT id, uuid, code, name, \`rank\`, is_default, requires_access_log, description, status
       FROM confidentiality_levels
       WHERE status = 'active'
       ORDER BY \`rank\` ASC, name ASC`
    ).then(([rows]) => rows),
    pool.execute<RowDataPacket[]>(
      `SELECT id, uuid, code, name, \`rank\`, is_default, default_due_days, color, description, status
       FROM priority_levels
       WHERE status = 'active'
       ORDER BY \`rank\` ASC, name ASC`
    ).then(([rows]) => rows),
    pool.execute<RowDataPacket[]>(
      `SELECT units.id, units.uuid, units.code, units.name, units.name_local, units.parent_unit_id
       FROM units
       INNER JOIN unit_types ON units.unit_type_id = unit_types.id
       WHERE units.status = 'active'
         AND units.deleted_at IS NULL
         AND unit_types.code = 'faculty'
       ORDER BY units.name ASC`
    ).then(([rows]) => rows),
    pool.execute<RowDataPacket[]>(
      `SELECT units.id, units.uuid, units.code, units.name, units.name_local, units.parent_unit_id
       FROM units
       INNER JOIN unit_types ON units.unit_type_id = unit_types.id
       WHERE units.status = 'active'
         AND units.deleted_at IS NULL
         AND unit_types.code = 'department'
       ORDER BY units.name ASC`
    ).then(([rows]) => rows)
  ]);

  ok(response, {
    confidentialityLevels,
    departments,
    documentTypes,
    faculties,
    priorityLevels
  });
}));

walkInIssuanceRouter.post("/requests", asyncHandler(async (request, response) => {
  const input = createIssuanceRequestSchema.parse(request.body);
  const assignment = await getActiveAssignment(request, "creating a walk-in issuance request");
  await assertWalkInDocumentTypeAvailable(input.document_type_id, assignment, response.locals.authUser?.roles || [], response);
  const rolePeople = rolePeopleFromInput(input);
  let requestId = 0;

  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const peopleIds = await insertRolePeople(connection, rolePeople);
    await upsertStudentProfile(connection, peopleIds.subjectPersonId, input);
    const [result] = await connection.execute<ResultSetHeader>(
      `INSERT INTO document_issuance_requests (
        uuid, document_type_id, requester_person_id, subject_person_id,
        taker_person_id, taker_relationship_to_subject, handled_by_assignment_id,
        handled_by_unit_id, purpose, destination_organization, is_student, status
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        uuid(),
        input.document_type_id,
        peopleIds.requesterPersonId,
        peopleIds.subjectPersonId,
        peopleIds.takerPersonId,
        rolePeople.relationshipToSubject,
        assignment.id,
        assignment.unitId,
        input.purpose || null,
        input.destination_organization || null,
        input.is_student,
        "intake"
      ]
    );
    requestId = Number(result.insertId);
    await writeAuditLog(request, {
      action: "walk_in_issuance.request.create",
      entityType: "document_issuance_request",
      entityId: requestId
    }, connection);
    await connection.commit();
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }

  created(response, await fetchIssuanceRequestDetail(requestId, assignment, response));
}));

walkInIssuanceRouter.get("/requests/:requestId", asyncHandler(async (request, response) => {
  const { requestId } = requestIdSchema.parse(request.params);
  const assignment = await getActiveAssignment(request, "loading a walk-in issuance request");
  ok(response, await fetchIssuanceRequestDetail(requestId, assignment, response));
}));

walkInIssuanceRouter.patch("/requests/:requestId/persons", asyncHandler(async (request, response) => {
  const { requestId } = requestIdSchema.parse(request.params);
  const input = updateIssuancePersonsSchema.parse(request.body);
  const rolePeople = rolePeopleFromInput(input);
  const assignment = await getActiveAssignment(request, "updating walk-in issuance people");
  let documentId: number | null = null;

  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const issuanceRequest = await lockedIssuanceRequest(connection, requestId, assignment, response);
    if (["handed_over", "archived", "canceled"].includes(String(issuanceRequest.status))) {
      throw new AppError(409, "walk_in_request_locked", "People cannot be changed after handover, archive, or cancel.");
    }
    const peopleIds = await insertRolePeople(connection, rolePeople);
    const isStudent = input.is_student ?? Boolean(issuanceRequest.is_student);
    await upsertStudentProfile(connection, peopleIds.subjectPersonId, {
      academic_year: input.academic_year,
      department_id: input.department_id,
      faculty_id: input.faculty_id,
      is_student: isStudent,
      semester: input.semester,
      student_notes: input.student_notes,
      student_registration_number: input.student_registration_number,
      student_status: input.student_status
    });
    await connection.execute<ResultSetHeader>(
      `UPDATE document_issuance_requests
       SET requester_person_id = ?,
           subject_person_id = ?,
           taker_person_id = ?,
           taker_relationship_to_subject = ?,
           is_student = ?,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [
        peopleIds.requesterPersonId,
        peopleIds.subjectPersonId,
        peopleIds.takerPersonId,
        rolePeople.relationshipToSubject,
        isStudent,
        requestId
      ]
    );
    documentId = issuanceRequest.document_id ? Number(issuanceRequest.document_id) : null;
    await writeAuditLog(request, {
      action: "walk_in_issuance.persons.update",
      entityType: "document_issuance_request",
      entityId: requestId
    }, connection);
    await connection.commit();
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }

  if (documentId) {
    await refreshSearchIndexForEntitySafe("document", documentId);
  }
  ok(response, await fetchIssuanceRequestDetail(requestId, assignment, response));
}));

walkInIssuanceRouter.post("/requests/:requestId/create-document", asyncHandler(async (request, response) => {
  const { requestId } = requestIdSchema.parse(request.params);
  const input = createDocumentFromRequestSchema.parse(request.body);
  const assignment = await getActiveAssignment(request, "creating a walk-in document");
  let createdDocumentId = 0;

  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const issuanceRequest = await lockedIssuanceRequest(connection, requestId, assignment, response);
    if (issuanceRequest.document_id) {
      throw new AppError(409, "walk_in_document_already_created", "This walk-in request already has a document.");
    }
    if (String(issuanceRequest.status) !== "intake") {
      throw new AppError(409, "walk_in_request_not_intake", "A document can be created only from an intake request.");
    }
    const writePermission = await assertWalkInDocumentTypeAvailable(Number(issuanceRequest.document_type_id), assignment, response.locals.authUser?.roles || [], response);
    const [subjectRows] = await connection.execute<RowDataPacket[]>(
      "SELECT * FROM external_persons WHERE id = ? LIMIT 1",
      [issuanceRequest.subject_person_id]
    );
    const subjectPerson = subjectRows[0];
    if (!subjectPerson) {
      throw new AppError(409, "walk_in_subject_missing", "The document subject record is missing.");
    }
    createdDocumentId = await createDraftDocumentForRequest(connection, {
      assignment,
      documentInput: input,
      issuanceRequest,
      subjectPerson: subjectPerson as ExternalPersonInput,
      writePermission
    });
    await connection.execute<ResultSetHeader>(
      `UPDATE document_issuance_requests
       SET document_id = ?,
           status = 'draft_created',
           updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [createdDocumentId, requestId]
    );
    await writeAuditLog(request, {
      action: "walk_in_issuance.document.create",
      entityType: "document",
      entityId: createdDocumentId,
      metadata: { issuanceRequestId: requestId }
    }, connection);
    await connection.commit();
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }

  await refreshSearchIndexForEntitySafe("document", createdDocumentId);
  created(response, await fetchIssuanceRequestDetail(requestId, assignment, response));
}));

walkInIssuanceRouter.post("/requests/:requestId/print-events", asyncHandler(async (request, response) => {
  const { requestId } = requestIdSchema.parse(request.params);
  const input = printEventSchema.parse(request.body);
  const assignment = await getActiveAssignment(request, "recording a walk-in print event");
  let documentId = 0;
  let printEventId = 0;

  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const issuanceRequest = await lockedIssuanceRequest(connection, requestId, assignment, response);
    if (!issuanceRequest.document_id) {
      throw new AppError(409, "walk_in_document_required", "Create the document before recording print events.");
    }
    const document = await fetchDocumentForUpdate(connection, Number(issuanceRequest.document_id));
    documentId = Number(document.id);
    if (!document.official_serial || !["finalized", "archived"].includes(String(document.status))) {
      throw new AppError(409, "walk_in_document_not_finalized", "Print events require a finalized document with an official serial.");
    }
    const [printResult] = await connection.execute<ResultSetHeader>(
      `INSERT INTO document_print_events (
        uuid, document_id, issuance_request_id, printed_by_assignment_id,
        print_type, print_reason, copy_number
      ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        uuid(),
        documentId,
        requestId,
        assignment.id,
        input.print_type,
        input.print_reason || null,
        input.copy_number
      ]
    );
    printEventId = Number(printResult.insertId);
    if (!["handed_over", "archived"].includes(String(issuanceRequest.status))) {
      await connection.execute<ResultSetHeader>(
        `UPDATE document_issuance_requests
         SET status = 'printed',
             updated_at = CURRENT_TIMESTAMP
         WHERE id = ?`,
        [requestId]
      );
    }
    await insertWorkflowEvent(connection, {
      action: "walk_in_print",
      assignmentId: assignment.id,
      document,
      note: `Walk-in ${input.print_type} print recorded.`,
      payload: { copyNumber: input.copy_number, issuanceRequestId: requestId, printEventId, printType: input.print_type }
    });
    await writeAuditLog(request, {
      action: "walk_in_issuance.print",
      entityType: "document_print_event",
      entityId: printEventId,
      metadata: { documentId, issuanceRequestId: requestId, printType: input.print_type }
    }, connection);
    await connection.commit();
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }

  await refreshSearchIndexForEntitySafe("document", documentId);
  created(response, await fetchIssuanceRequestDetail(requestId, assignment, response));
}));

walkInIssuanceRouter.post("/requests/:requestId/handover", asyncHandler(async (request, response) => {
  const { requestId } = requestIdSchema.parse(request.params);
  const input = handoverSchema.parse(request.body);
  const assignment = await getActiveAssignment(request, "recording a walk-in handover");
  let documentId = 0;
  let handoverId = 0;

  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const issuanceRequest = await lockedIssuanceRequest(connection, requestId, assignment, response);
    if (!issuanceRequest.document_id) {
      throw new AppError(409, "walk_in_document_required", "Create the document before recording handover.");
    }
    if (["handed_over", "archived", "canceled"].includes(String(issuanceRequest.status))) {
      throw new AppError(409, "walk_in_handover_not_allowed", "This walk-in request cannot receive another normal handover record.");
    }
    const document = await fetchDocumentForUpdate(connection, Number(issuanceRequest.document_id));
    documentId = Number(document.id);
    if (!document.official_serial || String(document.status) !== "finalized") {
      throw new AppError(409, "walk_in_document_not_finalized", "Handover requires a finalized document with an official serial.");
    }
    const [printRows] = await connection.execute<RowDataPacket[]>(
      "SELECT id FROM document_print_events WHERE issuance_request_id = ? AND document_id = ? LIMIT 1",
      [requestId, documentId]
    );
    if (!printRows[0]) {
      throw new AppError(409, "walk_in_print_required", "Record a print event before physical handover.");
    }
    const [handoverResult] = await connection.execute<ResultSetHeader>(
      `INSERT INTO document_handover_records (
        uuid, document_id, issuance_request_id, official_serial_number,
        taker_person_id, handed_by_assignment_id, handover_method, copy_count,
        receiver_signature_asset_id, receiver_thumbprint_asset_id,
        printed_snapshot_id, handover_note
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        uuid(),
        documentId,
        requestId,
        document.official_serial,
        issuanceRequest.taker_person_id,
        assignment.id,
        input.handover_method,
        input.copy_count,
        input.receiver_signature_asset_id || null,
        input.receiver_thumbprint_asset_id || null,
        input.printed_snapshot_id || null,
        input.handover_note || null
      ]
    );
    handoverId = Number(handoverResult.insertId);
    await connection.execute<ResultSetHeader>(
      `UPDATE document_issuance_requests
       SET status = 'handed_over',
           handed_over_at = CURRENT_TIMESTAMP,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [requestId]
    );
    await insertWorkflowEvent(connection, {
      action: "walk_in_handover",
      assignmentId: assignment.id,
      document,
      note: "Walk-in physical handover recorded.",
      payload: { handoverId, issuanceRequestId: requestId, officialSerial: document.official_serial }
    });
    await writeAuditLog(request, {
      action: "walk_in_issuance.handover",
      entityType: "document_handover_record",
      entityId: handoverId,
      metadata: { documentId, issuanceRequestId: requestId, officialSerial: document.official_serial }
    }, connection);
    await connection.commit();
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }

  await refreshSearchIndexForEntitySafe("document", documentId);
  created(response, await fetchIssuanceRequestDetail(requestId, assignment, response));
}));

walkInIssuanceRouter.post("/requests/:requestId/archive", asyncHandler(async (request, response) => {
  const { requestId } = requestIdSchema.parse(request.params);
  const input = archiveSchema.parse(request.body);
  const assignment = await getActiveAssignment(request, "archiving a walk-in issuance request");
  let documentId = 0;

  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const issuanceRequest = await lockedIssuanceRequest(connection, requestId, assignment, response);
    if (!issuanceRequest.document_id) {
      throw new AppError(409, "walk_in_document_required", "Create the document before archive.");
    }
    const document = await fetchDocumentForUpdate(connection, Number(issuanceRequest.document_id));
    documentId = Number(document.id);
    if (String(document.status) === "closed") {
      throw new AppError(409, "document_closed", "Closed documents cannot be archived.");
    }
    const [handoverRows] = await connection.execute<RowDataPacket[]>(
      "SELECT id FROM document_handover_records WHERE issuance_request_id = ? AND document_id = ? LIMIT 1",
      [requestId, documentId]
    );
    if (!handoverRows[0]) {
      throw new AppError(409, "walk_in_handover_required", "Record physical handover before archive.");
    }
    if (String(document.status) !== "archived") {
      await connection.execute<ResultSetHeader>(
        `UPDATE documents
         SET status = 'archived',
             archived_at = CURRENT_TIMESTAMP,
             archived_by_assignment_id = ?,
             archive_reason = ?,
             updated_at = CURRENT_TIMESTAMP
         WHERE id = ?`,
        [assignment.id, input.reason || input.note || "Walk-in issuance archived after handover.", documentId]
      );
      await insertWorkflowEvent(connection, {
        action: "archive",
        assignmentId: assignment.id,
        document,
        note: input.reason || input.note || "Walk-in issuance archived after handover.",
        payload: { issuanceRequestId: requestId },
        toStatus: "archived"
      });
    }
    await markWalkInRequestArchivedForDocument(connection, documentId);
    await writeAuditLog(request, {
      action: "document.archive",
      entityType: "document",
      entityId: documentId,
      metadata: { issuanceRequestId: requestId, source: "walk_in_issuance" }
    }, connection);
    await connection.commit();
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }

  await refreshSearchIndexForEntitySafe("document", documentId);
  ok(response, await fetchIssuanceRequestDetail(requestId, assignment, response));
}));

walkInIssuanceRouter.post("/requests/:requestId/cancel", asyncHandler(async (request, response) => {
  const { requestId } = requestIdSchema.parse(request.params);
  const input = cancelSchema.parse(request.body);
  const assignment = await getActiveAssignment(request, "canceling a walk-in issuance request");
  let documentId: number | null = null;

  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const issuanceRequest = await lockedIssuanceRequest(connection, requestId, assignment, response);
    if (["finalized", "printed", "handed_over", "archived"].includes(String(issuanceRequest.status))) {
      throw new AppError(409, "walk_in_cancel_not_allowed", "Walk-in issuance cannot be canceled after finalization.");
    }
    let document: RowDataPacket | null = null;
    if (issuanceRequest.document_id) {
      document = await fetchDocumentForUpdate(connection, Number(issuanceRequest.document_id));
      documentId = Number(document.id);
      if (document.official_serial || document.finalized_at || ["finalized", "archived", "closed"].includes(String(document.status))) {
        throw new AppError(409, "walk_in_cancel_not_allowed", "Walk-in issuance cannot be canceled after finalization.");
      }
      await connection.execute<ResultSetHeader>(
        `UPDATE documents
         SET status = 'closed',
             closed_at = CURRENT_TIMESTAMP,
             archive_reason = ?,
             updated_at = CURRENT_TIMESTAMP
         WHERE id = ?`,
        [input.reason || input.note || "Walk-in issuance canceled.", documentId]
      );
      await insertWorkflowEvent(connection, {
        action: "cancel",
        assignmentId: assignment.id,
        document,
        note: input.reason || input.note || "Walk-in issuance canceled.",
        payload: { issuanceRequestId: requestId },
        toStatus: "closed"
      });
    }
    await connection.execute<ResultSetHeader>(
      `UPDATE document_issuance_requests
       SET status = 'canceled',
           canceled_at = CURRENT_TIMESTAMP,
           cancel_reason = ?,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [input.reason || input.note || "Canceled.", requestId]
    );
    await writeAuditLog(request, {
      action: "walk_in_issuance.cancel",
      entityType: "document_issuance_request",
      entityId: requestId,
      metadata: { documentId }
    }, connection);
    await connection.commit();
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }

  if (documentId) {
    await refreshSearchIndexForEntitySafe("document", documentId);
  }
  ok(response, await fetchIssuanceRequestDetail(requestId, assignment, response));
}));
