import argon2 from "argon2";
import { createCipheriv, createHash, randomBytes } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import { Router } from "express";
import type { Request } from "express";
import type { PoolConnection, ResultSetHeader, RowDataPacket } from "mysql2/promise";
import { z } from "zod";
import { env } from "../../config/env";
import { pool } from "../../db/mysql";
import { requireAnyRole, requireAuth } from "../../middleware/auth";
import { asyncHandler } from "../../shared/async-handler";
import { writeAuditLog } from "../../shared/audit";
import { assertDocumentAccess, getActiveAssignment } from "../../shared/document-access";
import { AppError, notFound } from "../../shared/errors";
import { created, ok } from "../../shared/http";
import { uuid } from "../../shared/ids";

export const signatureRouter = Router();
export const adminSignatureRouter = Router();

signatureRouter.use(requireAuth);
adminSignatureRouter.use(requireAuth, requireAnyRole(["system_admin", "admin_staff"]));

const optionalNullableString = z.string().trim().min(1).nullable().optional();

const enrollSignatureSchema = z.object({
  pin: z.string().min(4).max(32),
  signature_image_base64: z.string().min(20),
  original_filename: z.string().trim().min(1).max(255).default("signature.png"),
  mime_type: z.string().trim().min(1).max(160).optional()
});

const generateSlotsSchema = z.object({
  force: z.boolean().default(false)
});

const signSlotSchema = z.object({
  pin: z.string().min(4).max(32),
  render_page: z.coerce.number().int().nonnegative().nullable().optional(),
  render_x: z.coerce.number().nullable().optional(),
  render_y: z.coerce.number().nullable().optional(),
  render_width: z.coerce.number().positive().nullable().optional(),
  render_height: z.coerce.number().positive().nullable().optional()
});

const createSignatureRuleSchema = z.object({
  document_type_id: z.coerce.number().int().positive(),
  origin_unit_type_id: z.coerce.number().int().positive().nullable().optional(),
  step_number: z.coerce.number().int().positive(),
  required_position_id: z.coerce.number().int().positive(),
  required_unit_scope: z.string().trim().min(1).max(80),
  signature_mode: z.string().trim().min(1).max(80).default("pin_signature_image"),
  is_required: z.boolean().default(true),
  is_parallel: z.boolean().default(false),
  can_finalize_document: z.boolean().default(false),
  can_be_hidden_later: z.boolean().default(false),
  status: z.enum(["draft", "active", "inactive", "archived"]).default("draft"),
  notes: optionalNullableString
});

const createSerialRuleSchema = z.object({
  code: z.string().trim().min(1).max(80),
  name: z.string().trim().min(1).max(140),
  format: z.string().trim().min(1).max(160).default("DOC-{YEAR}-{SEQUENCE}"),
  scope: z.enum(["global"]).default("global"),
  reset_policy: z.enum(["yearly"]).default("yearly"),
  sequence_padding: z.coerce.number().int().min(1).max(12).default(6),
  is_default: z.boolean().default(false),
  status: z.enum(["draft", "active", "inactive", "archived"]).default("draft"),
  notes: optionalNullableString
});

const updateStatusSchema = z.object({
  status: z.enum(["draft", "active", "inactive", "archived"])
});

function encryptionKey() {
  return createHash("sha256").update(env.SIGNATURE_ENCRYPTION_KEY).digest();
}

function parseBase64Image(value: string, fallbackMimeType?: string) {
  const dataUrlMatch = value.match(/^data:([^;]+);base64,(.+)$/);
  const mimeType = dataUrlMatch?.[1] || fallbackMimeType || "image/png";
  const base64 = dataUrlMatch?.[2] || value;
  const buffer = Buffer.from(base64, "base64");

  if (!buffer.length) {
    throw new AppError(422, "invalid_signature_image", "Signature image payload is not valid base64.");
  }

  return { buffer, mimeType };
}

async function encryptAndStoreSignature(input: {
  userId: number;
  assignmentId?: number;
  imageBase64: string;
  originalFilename: string;
  mimeType?: string;
}) {
  const { buffer, mimeType } = parseBase64Image(input.imageBase64, input.mimeType);
  const checksum = createHash("sha256").update(buffer).digest("hex");
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(buffer), cipher.final()]);
  const tag = cipher.getAuthTag();
  const encryptedPayload = Buffer.concat([iv, tag, ciphertext]);
  const storageUuid = uuid();
  const storageDir = path.resolve(process.cwd(), env.SIGNATURE_STORAGE_DIR);
  const relativePath = path.join(env.SIGNATURE_STORAGE_DIR, `${storageUuid}.sigenc`);
  const absolutePath = path.resolve(process.cwd(), relativePath);

  await fs.mkdir(storageDir, { recursive: true });
  await fs.writeFile(absolutePath, encryptedPayload);

  return {
    storagePath: relativePath,
    originalFilename: input.originalFilename,
    storedFilename: `${storageUuid}.sigenc`,
    mimeType,
    byteSize: encryptedPayload.length,
    checksum,
    metadata: {
      encrypted: true,
      algorithm: "aes-256-gcm",
      iv: iv.toString("base64"),
      tag: tag.toString("base64"),
      plaintextByteSize: buffer.length
    }
  };
}

async function findAncestorUnit(startUnitId: number, targetUnitTypeCode: string) {
  const fetchUnit = async (unitId: number) => {
    const [rows] = await pool.execute<RowDataPacket[]>(
      `SELECT units.id, units.parent_unit_id AS parentUnitId, unit_types.code AS unitTypeCode
       FROM units
       INNER JOIN unit_types ON units.unit_type_id = unit_types.id
       WHERE units.id = ?
       LIMIT 1`,
      [unitId]
    );
    return rows[0] || null;
  };

  let current = await fetchUnit(startUnitId);

  while (current) {
    if (current.unitTypeCode === targetUnitTypeCode) {
      return Number(current.id);
    }

    if (!current.parentUnitId) {
      return null;
    }

    current = await fetchUnit(Number(current.parentUnitId));
  }

  return null;
}

async function resolveTargetUnitId(originUnitId: number, scope: string) {
  const [originRows] = await pool.execute<RowDataPacket[]>(
    "SELECT id, organization_id AS organizationId FROM units WHERE id = ? LIMIT 1",
    [originUnitId]
  );
  const origin = originRows[0];
  if (!origin) {
    return null;
  }

  if (["same_unit", "same_department", "same_faculty", "same_committee"].includes(scope)) {
    return originUnitId;
  }

  if (scope === "parent_faculty") {
    return findAncestorUnit(originUnitId, "faculty");
  }

  if (scope === "parent_vice_chancellery") {
    return findAncestorUnit(originUnitId, "vice_chancellery");
  }

  if (["university", "same_university"].includes(scope)) {
    const [universityRows] = await pool.execute<RowDataPacket[]>(
      `SELECT units.id
       FROM units
       INNER JOIN unit_types ON units.unit_type_id = unit_types.id
       WHERE units.organization_id = ?
         AND unit_types.code = 'university'
         AND units.deleted_at IS NULL
       LIMIT 1`,
      [origin.organizationId]
    );
    const university = universityRows[0];

    return university ? Number(university.id) : null;
  }

  return null;
}

async function getDocumentOriginUnitType(documentId: number) {
  const [rows] = await pool.execute<RowDataPacket[]>(
    `SELECT units.unit_type_id AS unitTypeId
     FROM documents
     INNER JOIN units ON documents.origin_unit_id = units.id
     WHERE documents.id = ?
     LIMIT 1`,
    [documentId]
  );
  const row = rows[0];

  return row ? Number(row.unitTypeId) : null;
}

async function getSignatureProfile(userId: number) {
  const [rows] = await pool.execute<RowDataPacket[]>(
    `SELECT
      signature_profiles.id,
      signature_profiles.uuid,
      signature_profiles.user_id AS userId,
      signature_profiles.status,
      signature_profiles.failed_pin_attempts AS failedPinAttempts,
      signature_profiles.locked_until AS lockedUntil,
      signature_profiles.active_signature_asset_id AS activeSignatureAssetId,
      signature_profiles.created_at AS createdAt,
      signature_profiles.updated_at AS updatedAt,
      signature_assets.uuid AS activeAssetUuid,
      signature_assets.status AS activeAssetStatus,
      file_assets.original_filename AS activeOriginalFilename
    FROM signature_profiles
    LEFT JOIN signature_assets ON signature_profiles.active_signature_asset_id = signature_assets.id
    LEFT JOIN file_assets ON signature_assets.file_asset_id = file_assets.id
    WHERE signature_profiles.user_id = ?
      AND signature_profiles.deleted_at IS NULL
    LIMIT 1`,
    [userId]
  );
  return rows[0] || null;
}

async function createPinEvent(request: Request, input: {
  userId: number;
  signatureProfileId?: number;
  assignmentId?: number;
  outcome: "success" | "failed";
  failureReason?: string;
}) {
  const [result] = await pool.execute<ResultSetHeader>(
    `INSERT INTO pin_verification_events (
      uuid, user_id, signature_profile_id, assignment_id,
      outcome, failure_reason, ip_address, user_agent
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      uuid(),
      input.userId,
      input.signatureProfileId || null,
      input.assignmentId || null,
      input.outcome,
      input.failureReason || null,
      request.ip || null,
      request.get("user-agent") || null
    ]
  );

  return Number(result.insertId);
}

async function verifySigningPin(request: Request, userId: number, assignmentId: number, pin: string) {
  const [profileRows] = await pool.execute<RowDataPacket[]>(
    "SELECT * FROM signature_profiles WHERE user_id = ? AND deleted_at IS NULL LIMIT 1",
    [userId]
  );
  const profile = profileRows[0];

  if (!profile || profile.status !== "active" || !profile.active_signature_asset_id) {
    const pinEventId = await createPinEvent(request, {
      userId,
      signatureProfileId: profile?.id,
      assignmentId,
      outcome: "failed",
      failureReason: "signature_profile_not_active"
    });
    throw new AppError(409, "signature_profile_required", "Active signature profile is required before signing.", { pinEventId });
  }

  if (profile.locked_until && new Date(profile.locked_until) > new Date()) {
    const pinEventId = await createPinEvent(request, {
      userId,
      signatureProfileId: profile.id,
      assignmentId,
      outcome: "failed",
      failureReason: "pin_locked"
    });
    throw new AppError(423, "pin_locked", "PIN verification is temporarily locked.", { pinEventId });
  }

  const pinOk = await argon2.verify(profile.pin_hash, pin);
  if (!pinOk) {
    const failedAttempts = Number(profile.failed_pin_attempts || 0) + 1;
    const lockedUntil = failedAttempts >= 5
      ? new Date(Date.now() + 15 * 60 * 1000)
      : profile.locked_until || null;

    await pool.execute<ResultSetHeader>(
      `UPDATE signature_profiles
       SET failed_pin_attempts = ?,
           locked_until = ?,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [failedAttempts, lockedUntil, profile.id]
    );

    const pinEventId = await createPinEvent(request, {
      userId,
      signatureProfileId: profile.id,
      assignmentId,
      outcome: "failed",
      failureReason: "invalid_pin"
    });
    throw new AppError(401, "invalid_pin", "PIN verification failed.", { pinEventId });
  }

  await pool.execute<ResultSetHeader>(
    `UPDATE signature_profiles
     SET failed_pin_attempts = 0,
         locked_until = NULL,
         updated_at = CURRENT_TIMESTAMP
     WHERE id = ?`,
    [profile.id]
  );

  const pinEventId = await createPinEvent(request, {
    userId,
    signatureProfileId: profile.id,
    assignmentId,
    outcome: "success"
  });

  return {
    profile,
    pinEventId,
    signatureAssetId: Number(profile.active_signature_asset_id)
  };
}

function formatSerial(rule: Record<string, any>, year: number, nextValue: number) {
  const sequence = String(nextValue).padStart(Number(rule.sequence_padding), "0");
  return String(rule.format)
    .replaceAll("{YEAR}", String(year))
    .replaceAll("{SEQUENCE}", sequence);
}

async function assignOfficialSerial(connection: PoolConnection, input: {
  documentId: number;
  assignmentId: number;
  signatureEventId: number;
}) {
  const [existingRows] = await connection.execute<RowDataPacket[]>(
    "SELECT * FROM serial_assignments WHERE document_id = ? LIMIT 1",
    [input.documentId]
  );
  const existing = existingRows[0];
  if (existing) {
    return existing;
  }

  const [serialRuleRows] = await connection.execute<RowDataPacket[]>(
    `SELECT *
     FROM serial_rules
     WHERE status = 'active' AND is_default = TRUE
     ORDER BY id ASC
     LIMIT 1`
  );
  const serialRule = serialRuleRows[0];

  if (!serialRule) {
    throw new AppError(409, "serial_rule_required", "No active default serial rule exists.");
  }

  const year = new Date().getUTCFullYear();
  const sequenceScope = "global";

  await connection.execute<ResultSetHeader>(
    `INSERT IGNORE INTO serial_sequences (
      serial_rule_id, sequence_scope, sequence_year, current_value
    ) VALUES (?, ?, ?, ?)`,
    [serialRule.id, sequenceScope, year, 0]
  );

  const [sequenceRows] = await connection.execute<RowDataPacket[]>(
    `SELECT *
     FROM serial_sequences
     WHERE serial_rule_id = ?
       AND sequence_scope = ?
       AND sequence_year = ?
     LIMIT 1
     FOR UPDATE`,
    [serialRule.id, sequenceScope, year]
  );
  const sequence = sequenceRows[0];

  const nextValue = Number(sequence.current_value) + 1;
  const serialValue = formatSerial(serialRule, year, nextValue);

  await connection.execute<ResultSetHeader>(
    "UPDATE serial_sequences SET current_value = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
    [nextValue, sequence.id]
  );

  const [serialAssignmentResult] = await connection.execute<ResultSetHeader>(
    `INSERT INTO serial_assignments (
      uuid, document_id, serial_rule_id, serial_sequence_id, serial_value,
      assigned_by_assignment_id, signature_event_id, metadata
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      uuid(),
      input.documentId,
      serialRule.id,
      sequence.id,
      serialValue,
      input.assignmentId,
      input.signatureEventId,
      JSON.stringify({ year, sequenceScope, sequenceValue: nextValue })
    ]
  );
  const serialAssignmentId = serialAssignmentResult.insertId;

  await connection.execute<ResultSetHeader>(
    "UPDATE signature_events SET serial_assignment_id = ? WHERE id = ?",
    [serialAssignmentId, input.signatureEventId]
  );

  await connection.execute<ResultSetHeader>(
    `UPDATE documents
     SET official_serial = ?,
         status = 'serial_assigned',
         finalized_at = CURRENT_TIMESTAMP,
         finalized_by_assignment_id = ?,
         official_serial_generated_at = CURRENT_TIMESTAMP,
         official_serial_generated_by_assignment_id = ?,
         updated_at = CURRENT_TIMESTAMP
     WHERE id = ?`,
    [serialValue, input.assignmentId, input.assignmentId, input.documentId]
  );

  const [assignmentRows] = await connection.execute<RowDataPacket[]>(
    "SELECT * FROM serial_assignments WHERE id = ? LIMIT 1",
    [serialAssignmentId]
  );
  return assignmentRows[0] || null;
}

async function getSlotsForDocument(documentId: number) {
  const [rows] = await pool.execute<RowDataPacket[]>(
    `SELECT
      signature_slots.*,
      positions.code AS requiredPositionCode,
      positions.title AS requiredPositionTitle,
      units.name AS targetUnitName
    FROM signature_slots
    INNER JOIN positions ON signature_slots.required_position_id = positions.id
    LEFT JOIN units ON signature_slots.target_unit_id = units.id
    WHERE signature_slots.document_id = ?
    ORDER BY signature_slots.step_number ASC, signature_slots.id ASC`,
    [documentId]
  );
  return rows;
}

signatureRouter.get("/profile", asyncHandler(async (_request, response) => {
  const authUser = response.locals.authUser!;
  const profile = await getSignatureProfile(authUser.id);
  ok(response, profile || null);
}));

signatureRouter.post("/profile", asyncHandler(async (request, response) => {
  const input = enrollSignatureSchema.parse(request.body);
  const authUser = response.locals.authUser!;
  const assignment = request.session.activeAssignmentId ? await getActiveAssignment(request) : null;
  const stored = await encryptAndStoreSignature({
    userId: authUser.id,
    assignmentId: assignment?.id,
    imageBase64: input.signature_image_base64,
    originalFilename: input.original_filename,
    mimeType: input.mime_type
  });

  let profileId = 0;

  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const [existingRows] = await connection.execute<RowDataPacket[]>(
      "SELECT * FROM signature_profiles WHERE user_id = ? AND deleted_at IS NULL LIMIT 1",
      [authUser.id]
    );
    const existing = existingRows[0];
    const pinHash = await argon2.hash(input.pin, { type: argon2.argon2id });

    if (existing) {
      profileId = Number(existing.id);
      await connection.execute<ResultSetHeader>(
        `UPDATE signature_profiles
         SET pin_hash = ?,
             status = 'active',
             failed_pin_attempts = 0,
             locked_until = NULL,
             updated_at = CURRENT_TIMESTAMP
         WHERE id = ?`,
        [pinHash, existing.id]
      );
      await connection.execute<ResultSetHeader>(
        `UPDATE signature_assets
         SET status = 'superseded', updated_at = CURRENT_TIMESTAMP
         WHERE signature_profile_id = ? AND status = 'active'`,
        [existing.id]
      );
    } else {
      const [profileResult] = await connection.execute<ResultSetHeader>(
        "INSERT INTO signature_profiles (uuid, user_id, pin_hash, status) VALUES (?, ?, ?, ?)",
        [uuid(), authUser.id, pinHash, "active"]
      );
      profileId = Number(profileResult.insertId);
    }

    const [fileResult] = await connection.execute<ResultSetHeader>(
      `INSERT INTO file_assets (
        uuid, uploaded_by_user_id, uploaded_by_assignment_id, purpose,
        storage_disk, storage_path, original_filename, stored_filename,
        mime_type, byte_size, checksum_sha256, encryption_status, status, metadata
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        uuid(),
        authUser.id,
        assignment?.id || null,
        "signature_image",
        "local_encrypted",
        stored.storagePath,
        stored.originalFilename,
        stored.storedFilename,
        stored.mimeType,
        stored.byteSize,
        stored.checksum,
        "encrypted",
        "active",
        JSON.stringify(stored.metadata)
      ]
    );
    const fileAssetId = fileResult.insertId;

    const [assetResult] = await connection.execute<ResultSetHeader>(
      `INSERT INTO signature_assets (
        uuid, signature_profile_id, file_asset_id, status, processing_status,
        encryption_algorithm, accepted_at, metadata
      ) VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, ?)`,
      [
        uuid(),
        profileId,
        fileAssetId,
        "active",
        "accepted_without_background_removal",
        "aes-256-gcm",
        JSON.stringify({ phase: 3, backgroundRemoval: "not_implemented_yet" })
      ]
    );
    const signatureAssetId = assetResult.insertId;

    await connection.execute<ResultSetHeader>(
      `UPDATE signature_profiles
       SET active_signature_asset_id = ?, updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [signatureAssetId, profileId]
    );

    await writeAuditLog(request, { action: "signature.profile.enroll", entityType: "signature_profile", entityId: profileId }, connection);
    await connection.commit();
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }

  created(response, await getSignatureProfile(authUser.id));
}));

signatureRouter.get("/documents/:documentId/slots", asyncHandler(async (request, response) => {
  const { documentId } = z.object({ documentId: z.coerce.number().int().positive() }).parse(request.params);
  await assertDocumentAccess(documentId, request, response);
  ok(response, await getSlotsForDocument(documentId));
}));

signatureRouter.post("/documents/:documentId/slots/generate", asyncHandler(async (request, response) => {
  const { documentId } = z.object({ documentId: z.coerce.number().int().positive() }).parse(request.params);
  const input = generateSlotsSchema.parse(request.body);
  const { document, assignment } = await assertDocumentAccess(documentId, request, response);
  const originUnitTypeId = await getDocumentOriginUnitType(documentId);

  let createdCount = 0;

  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const [existingSlots] = await connection.execute<RowDataPacket[]>(
      "SELECT * FROM signature_slots WHERE document_id = ?",
      [documentId]
    );
    if (existingSlots.length && !input.force) {
      await connection.commit();
      return;
    }

    if (existingSlots.length && input.force) {
      const hasCompleted = existingSlots.some((slot) => slot.status === "completed");
      if (hasCompleted) {
        throw new AppError(409, "completed_slots_exist", "Cannot regenerate signature slots after signing has started.");
      }
      await connection.execute<ResultSetHeader>(
        "DELETE FROM signature_slots WHERE document_id = ?",
        [documentId]
      );
    }

    const [rules] = await connection.execute<RowDataPacket[]>(
      `SELECT *
       FROM signature_rules
       WHERE document_type_id = ?
         AND status = 'active'
         AND (origin_unit_type_id = ? OR origin_unit_type_id IS NULL)
       ORDER BY step_number ASC, id ASC`,
      [document.document_type_id, originUnitTypeId]
    );

    if (!rules.length) {
      throw new AppError(409, "signature_rules_missing", "No active signature rules match this document.");
    }

    for (const rule of rules) {
      const targetUnitId = await resolveTargetUnitId(Number(document.origin_unit_id), rule.required_unit_scope);
      await connection.execute<ResultSetHeader>(
        `INSERT INTO signature_slots (
          uuid, document_id, signature_rule_id, step_number, required_position_id,
          target_unit_id, required_unit_scope, signature_mode, is_required,
          is_parallel, can_finalize_document, can_be_hidden_later, status
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          uuid(),
          documentId,
          rule.id,
          rule.step_number,
          rule.required_position_id,
          targetUnitId,
          rule.required_unit_scope,
          rule.signature_mode,
          rule.is_required,
          rule.is_parallel,
          rule.can_finalize_document,
          rule.can_be_hidden_later,
          "pending"
        ]
      );
      createdCount += 1;
    }

    if (["draft", "under_review"].includes(document.status)) {
      await connection.execute<ResultSetHeader>(
        "UPDATE documents SET status = 'pending_signatures', updated_at = CURRENT_TIMESTAMP WHERE id = ?",
        [documentId]
      );
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
        "generate_signature_slots",
        document.status,
        ["draft", "under_review"].includes(document.status) ? "pending_signatures" : document.status,
        document.current_holder_unit_id,
        document.current_holder_unit_id,
        `Generated ${createdCount} signature slot(s).`,
        JSON.stringify({ createdCount })
      ]
    );

    await writeAuditLog(request, { action: "signature.slots.generate", entityType: "document", entityId: documentId }, connection);
    await connection.commit();
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }

  created(response, await getSlotsForDocument(documentId));
}));

signatureRouter.post("/documents/:documentId/slots/:slotId/sign", asyncHandler(async (request, response) => {
  const params = z.object({
    documentId: z.coerce.number().int().positive(),
    slotId: z.coerce.number().int().positive()
  }).parse(request.params);
  const input = signSlotSchema.parse(request.body);
  const authUser = response.locals.authUser!;
  const { document, assignment } = await assertDocumentAccess(params.documentId, request, response);
  const verification = await verifySigningPin(request, authUser.id, assignment.id, input.pin);

  let signatureEventId = 0;

  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const [slotRows] = await connection.execute<RowDataPacket[]>(
      `SELECT *
       FROM signature_slots
       WHERE id = ? AND document_id = ?
       LIMIT 1
       FOR UPDATE`,
      [params.slotId, params.documentId]
    );
    const slot = slotRows[0];

    if (!slot) {
      throw notFound("Signature slot");
    }

    if (slot.status !== "pending") {
      throw new AppError(409, "signature_slot_not_pending", "This signature slot is not pending.");
    }

    if (Number(slot.required_position_id) !== assignment.positionId) {
      throw new AppError(403, "signature_position_mismatch", "Your active assignment position cannot sign this slot.");
    }

    if (slot.target_unit_id && Number(slot.target_unit_id) !== assignment.unitId) {
      throw new AppError(403, "signature_unit_mismatch", "Your active assignment unit cannot sign this slot.");
    }

    const [incompletePrerequisitesRows] = await connection.execute<RowDataPacket[]>(
      `SELECT COUNT(*) AS count
       FROM signature_slots
       WHERE document_id = ?
         AND is_required = TRUE
         AND step_number < ?
         AND status <> 'completed'`,
      [params.documentId, slot.step_number]
    );
    const incompletePrerequisites = incompletePrerequisitesRows[0];

    if (Number(incompletePrerequisites?.count || 0) > 0) {
      throw new AppError(409, "signature_prerequisites_incomplete", "Earlier required signature slots must be completed first.");
    }

    const [eventResult] = await connection.execute<ResultSetHeader>(
      `INSERT INTO signature_events (
        uuid, document_id, signature_slot_id, user_id, assignment_id,
        signature_asset_id, pin_verification_event_id, status, render_page,
        render_x, render_y, render_width, render_height, ip_address, user_agent
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        uuid(),
        params.documentId,
        params.slotId,
        authUser.id,
        assignment.id,
        verification.signatureAssetId,
        verification.pinEventId,
        "completed",
        input.render_page || null,
        input.render_x || null,
        input.render_y || null,
        input.render_width || null,
        input.render_height || null,
        request.ip || null,
        request.get("user-agent") || null
      ]
    );
    const eventId = eventResult.insertId;
    signatureEventId = Number(eventId);

    await connection.execute<ResultSetHeader>(
      `UPDATE signature_slots
       SET status = 'completed',
           completed_by_signature_event_id = ?,
           completed_at = CURRENT_TIMESTAMP,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [eventId, params.slotId]
    );

    const [remainingRequiredRows] = await connection.execute<RowDataPacket[]>(
      `SELECT COUNT(*) AS count
       FROM signature_slots
       WHERE document_id = ?
         AND is_required = TRUE
         AND status <> 'completed'`,
      [params.documentId]
    );
    const remainingRequired = remainingRequiredRows[0];
    const requiredRemaining = Number(remainingRequired?.count || 0);

    let nextStatus = requiredRemaining === 0 ? "fully_signed" : "partially_signed";
    let serialAssignment = null;
    if (requiredRemaining === 0 && slot.can_finalize_document) {
      serialAssignment = await assignOfficialSerial(connection, {
        documentId: params.documentId,
        assignmentId: assignment.id,
        signatureEventId: eventId
      });
      nextStatus = "serial_assigned";
    } else {
      await connection.execute<ResultSetHeader>(
        "UPDATE documents SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
        [nextStatus, params.documentId]
      );
    }

    await connection.execute<ResultSetHeader>(
      `INSERT INTO document_workflow_events (
        uuid, document_id, actor_assignment_id, action, from_status,
        to_status, from_unit_id, to_unit_id, note, payload
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        uuid(),
        params.documentId,
        assignment.id,
        "sign",
        document.status,
        nextStatus,
        document.current_holder_unit_id,
        document.current_holder_unit_id,
        serialAssignment ? `Document signed and serial assigned: ${serialAssignment.serial_value}` : "Document signed.",
        JSON.stringify({
          signatureSlotId: params.slotId,
          signatureEventId: eventId,
          serialAssignmentId: serialAssignment?.id || null
        })
      ]
    );

    await writeAuditLog(request, { action: "signature.event.create", entityType: "signature_event", entityId: eventId }, connection);
    if (serialAssignment) {
      await writeAuditLog(request, {
        action: "serial.assign",
        entityType: "document",
        entityId: params.documentId,
        metadata: { serial: serialAssignment.serial_value }
      }, connection);
    }
    await connection.commit();
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }

  const [signatureEventRows] = await pool.execute<RowDataPacket[]>("SELECT * FROM signature_events WHERE id = ? LIMIT 1", [signatureEventId]);
  const [documentRows] = await pool.execute<RowDataPacket[]>("SELECT * FROM documents WHERE id = ? LIMIT 1", [params.documentId]);
  const [serialAssignmentRows] = await pool.execute<RowDataPacket[]>("SELECT * FROM serial_assignments WHERE document_id = ? LIMIT 1", [params.documentId]);
  created(response, {
    signatureEvent: signatureEventRows[0] || null,
    slots: await getSlotsForDocument(params.documentId),
    document: documentRows[0] || null,
    serialAssignment: serialAssignmentRows[0] || null
  });
}));

adminSignatureRouter.get("/signature-rules", asyncHandler(async (_request, response) => {
  const [rules] = await pool.execute<RowDataPacket[]>(
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
    ORDER BY signature_rules.document_type_id ASC, signature_rules.step_number ASC`
  );

  ok(response, rules);
}));

adminSignatureRouter.post("/signature-rules", asyncHandler(async (request, response) => {
  const input = createSignatureRuleSchema.parse(request.body);
  const [result] = await pool.execute<ResultSetHeader>(
    `INSERT INTO signature_rules (
      uuid, document_type_id, origin_unit_type_id, step_number,
      required_position_id, required_unit_scope, signature_mode,
      is_required, is_parallel, can_finalize_document, can_be_hidden_later,
      status, activated_by_user_id, activated_at, notes
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      uuid(),
      input.document_type_id,
      input.origin_unit_type_id || null,
      input.step_number,
      input.required_position_id,
      input.required_unit_scope,
      input.signature_mode,
      input.is_required,
      input.is_parallel,
      input.can_finalize_document,
      input.can_be_hidden_later,
      input.status,
      input.status === "active" ? request.session.userId || null : null,
      input.status === "active" ? new Date() : null,
      input.notes || null
    ]
  );
  const id = result.insertId;

  await writeAuditLog(request, { action: "admin.signature_rule.create", entityType: "signature_rule", entityId: id });
  const [rows] = await pool.execute<RowDataPacket[]>("SELECT * FROM signature_rules WHERE id = ? LIMIT 1", [id]);
  created(response, rows[0] || null);
}));

adminSignatureRouter.patch("/signature-rules/:signatureRuleId/status", asyncHandler(async (request, response) => {
  const { signatureRuleId } = z.object({ signatureRuleId: z.coerce.number().int().positive() }).parse(request.params);
  const input = updateStatusSchema.parse(request.body);

  const [ruleRows] = await pool.execute<RowDataPacket[]>(
    "SELECT id FROM signature_rules WHERE id = ? LIMIT 1",
    [signatureRuleId]
  );
  const rule = ruleRows[0];
  if (!rule) {
    throw notFound("Signature rule");
  }

  await pool.execute<ResultSetHeader>(
    `UPDATE signature_rules
     SET status = ?,
         activated_by_user_id = ?,
         activated_at = ?,
         updated_at = CURRENT_TIMESTAMP
     WHERE id = ?`,
    [
      input.status,
      input.status === "active" ? request.session.userId || null : null,
      input.status === "active" ? new Date() : null,
      signatureRuleId
    ]
  );

  await writeAuditLog(request, {
    action: "admin.signature_rule.status_update",
    entityType: "signature_rule",
    entityId: signatureRuleId,
    metadata: { status: input.status }
  });

  const [rows] = await pool.execute<RowDataPacket[]>("SELECT * FROM signature_rules WHERE id = ? LIMIT 1", [signatureRuleId]);
  ok(response, rows[0] || null);
}));

adminSignatureRouter.get("/serial-rules", asyncHandler(async (_request, response) => {
  const [rows] = await pool.execute<RowDataPacket[]>("SELECT * FROM serial_rules ORDER BY id ASC");
  ok(response, rows);
}));

adminSignatureRouter.post("/serial-rules", asyncHandler(async (request, response) => {
  const input = createSerialRuleSchema.parse(request.body);
  let serialRuleId = 0;

  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    if (input.is_default) {
      await connection.execute<ResultSetHeader>(
        "UPDATE serial_rules SET is_default = FALSE, updated_at = CURRENT_TIMESTAMP WHERE is_default = TRUE"
      );
    }

    const [result] = await connection.execute<ResultSetHeader>(
      `INSERT INTO serial_rules (
        uuid, code, name, format, scope, reset_policy, sequence_padding,
        is_default, status, activated_by_user_id, activated_at, notes
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        uuid(),
        input.code,
        input.name,
        input.format,
        input.scope,
        input.reset_policy,
        input.sequence_padding,
        input.is_default,
        input.status,
        input.status === "active" ? request.session.userId || null : null,
        input.status === "active" ? new Date() : null,
        input.notes || null
      ]
    );
    serialRuleId = Number(result.insertId);

    await writeAuditLog(request, { action: "admin.serial_rule.create", entityType: "serial_rule", entityId: serialRuleId }, connection);
    await connection.commit();
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }

  const [createdRows] = await pool.execute<RowDataPacket[]>("SELECT * FROM serial_rules WHERE id = ? LIMIT 1", [serialRuleId]);
  created(response, createdRows[0] || null);
}));

adminSignatureRouter.patch("/serial-rules/:serialRuleId/status", asyncHandler(async (request, response) => {
  const { serialRuleId } = z.object({ serialRuleId: z.coerce.number().int().positive() }).parse(request.params);
  const input = updateStatusSchema.parse(request.body);

  const [ruleRows] = await pool.execute<RowDataPacket[]>(
    "SELECT id FROM serial_rules WHERE id = ? LIMIT 1",
    [serialRuleId]
  );
  const rule = ruleRows[0];
  if (!rule) {
    throw notFound("Serial rule");
  }

  await pool.execute<ResultSetHeader>(
    `UPDATE serial_rules
     SET status = ?,
         activated_by_user_id = ?,
         activated_at = ?,
         updated_at = CURRENT_TIMESTAMP
     WHERE id = ?`,
    [
      input.status,
      input.status === "active" ? request.session.userId || null : null,
      input.status === "active" ? new Date() : null,
      serialRuleId
    ]
  );

  await writeAuditLog(request, {
    action: "admin.serial_rule.status_update",
    entityType: "serial_rule",
    entityId: serialRuleId,
    metadata: { status: input.status }
  });

  const [rows] = await pool.execute<RowDataPacket[]>("SELECT * FROM serial_rules WHERE id = ? LIMIT 1", [serialRuleId]);
  ok(response, rows[0] || null);
}));
