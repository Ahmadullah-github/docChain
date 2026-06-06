import argon2 from "argon2";
import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { Router } from "express";
import type { Request, Response } from "express";
import type { PoolConnection, ResultSetHeader, RowDataPacket } from "mysql2/promise";
import { z } from "zod";
import { env } from "../../config/env";
import { pool, type Database } from "../../db/mysql";
import { requireAnyRole, requireAuth } from "../../middleware/auth";
import { asyncHandler } from "../../shared/async-handler";
import { writeAuditLog } from "../../shared/audit";
import { assertDocumentAccess, getActiveAssignment, isAdmin } from "../../shared/document-access";
import { calculateDocumentContentHash } from "../../shared/document-hash";
import { AppError, notFound } from "../../shared/errors";
import { created, ok } from "../../shared/http";
import { uuid } from "../../shared/ids";
import { generateAdminCode } from "../admin/code-generator";
import { assignOfficialSerial as assignOfficialSerialForTask } from "./serial-assignment-service";
import { decryptSignatureFile, encryptAndStoreSignature } from "./signature-assets";
import {
  findUnsupportedSerialTokens,
  previewSerialNumber,
  serialResetPolicies,
  serialScopes,
  serialSequenceKey,
  serialStatuses
} from "./serial-numbering";
import type { SerialContext, SerialRuleLike } from "./serial-numbering";

export const signatureRouter = Router();
export const adminSignatureRouter = Router();
export const publicSignatureUploadRouter = Router();

signatureRouter.use(requireAuth);
adminSignatureRouter.use(requireAuth, requireAnyRole(["system_admin", "admin_staff"]));

const optionalNullableString = z.string().trim().min(1).nullable().optional();
const optionalCodeString = (max: number) => z.string().trim().max(max).transform((value) => value || undefined).optional();
const endorsementCommentMaxLength = 300;

const enrollSignatureSchema = z.object({
  pin: z.string().min(4).max(32),
  signature_image_base64: z.string().min(20),
  original_filename: z.string().trim().min(1).max(255).default("signature.png"),
  mime_type: z.string().trim().min(1).max(160).optional()
});

const signatureUploadSchema = z.object({
  signature_image_base64: z.string().min(20),
  original_filename: z.string().trim().min(1).max(255).default("phone-signature.png"),
  mime_type: z.string().trim().min(1).max(160).optional()
});

const confirmUploadSchema = z.object({
  pin: z.string().min(4).max(32),
  signature_image_base64: z.string().min(20).optional(),
  original_filename: z.string().trim().min(1).max(255).optional(),
  mime_type: z.string().trim().min(1).max(160).optional(),
  upload_session_id: z.coerce.number().int().positive()
});

const signaturePrintOptionsSchema = z.object({
  show_name_position: z.boolean().default(true),
  show_date: z.boolean().default(false),
  show_comment: z.boolean().default(false)
}).default({
  show_name_position: true,
  show_date: false,
  show_comment: false
});

const signaturePlacementSchema = z.object({
  render_page: z.coerce.number().int().positive(),
  render_x: z.coerce.number().min(0),
  render_y: z.coerce.number().min(0),
  render_width: z.coerce.number().positive(),
  render_height: z.coerce.number().positive()
}).superRefine((input, context) => {
  if (input.render_x + input.render_width > 210) {
    context.addIssue({ code: "custom", message: "Signature placement must stay inside the page width.", path: ["render_x"] });
  }
  if (input.render_y + input.render_height > 297) {
    context.addIssue({ code: "custom", message: "Signature placement must stay inside the page height.", path: ["render_y"] });
  }
});

const signingSessionSchema = z.object({
  pin: z.string().min(4).max(32),
  expected_document_hash: z.string().trim().length(64).optional(),
  expected_document_version_number: z.coerce.number().int().positive().optional(),
  response_note: z.string().trim().max(endorsementCommentMaxLength).nullable().optional()
});

const completeSignatureSchema = signaturePlacementSchema.extend({
  placement_token: z.string().trim().min(40).max(3000),
  print_options: signaturePrintOptionsSchema,
  response_note: z.string().trim().max(endorsementCommentMaxLength).nullable().optional()
});

const signTaskSchema = z.object({
  pin: z.string().min(4).max(32).optional(),
  placement_token: z.string().trim().min(40).max(3000).optional(),
  expected_document_hash: z.string().trim().length(64).optional(),
  expected_document_version_number: z.coerce.number().int().positive().optional(),
  print_options: signaturePrintOptionsSchema,
  response_note: z.string().trim().max(endorsementCommentMaxLength).nullable().optional(),
  render_page: z.coerce.number().int().positive(),
  render_x: z.coerce.number().min(0),
  render_y: z.coerce.number().min(0),
  render_width: z.coerce.number().positive(),
  render_height: z.coerce.number().positive()
}).superRefine((input, context) => {
  if (input.render_x + input.render_width > 210) {
    context.addIssue({ code: "custom", message: "Signature placement must stay inside the page width.", path: ["render_x"] });
  }
  if (input.render_y + input.render_height > 297) {
    context.addIssue({ code: "custom", message: "Signature placement must stay inside the page height.", path: ["render_y"] });
  }
  if (!input.pin && !input.placement_token) {
    context.addIssue({ code: "custom", message: "PIN or placement token is required.", path: ["placement_token"] });
  }
});

const serialStatusSchema = z.enum(serialStatuses);
const serialScopeSchema = z.enum(serialScopes);
const serialResetPolicySchema = z.enum(serialResetPolicies);

const createSerialRuleSchema = z.object({
  code: optionalCodeString(80),
  name: z.string().trim().min(1).max(140),
  format: z.string().trim().min(1).max(160).default("DOC-{YEAR}-{SEQUENCE}"),
  scope: serialScopeSchema.default("global"),
  reset_policy: serialResetPolicySchema.default("yearly"),
  sequence_padding: z.coerce.number().int().min(1).max(12).default(6),
  is_default: z.boolean().default(false),
  status: serialStatusSchema.default("draft"),
  notes: optionalNullableString
});

const updateSerialRuleSchema = createSerialRuleSchema.partial();

const previewSerialRuleSchema = z.object({
  serial_rule_id: z.coerce.number().int().positive().optional(),
  rule: z.object({
    format: z.string().trim().min(1).max(160).default("DOC-{YEAR}-{SEQUENCE}"),
    scope: serialScopeSchema.default("global"),
    reset_policy: serialResetPolicySchema.default("yearly"),
    sequence_padding: z.coerce.number().int().min(1).max(12).default(6)
  }).optional(),
  context: z.object({
    documentTypeCode: z.string().trim().min(1).max(80).optional(),
    organizationCode: z.string().trim().min(1).max(80).optional(),
    originUnitCode: z.string().trim().min(1).max(80).optional()
  }).optional(),
  current_value: z.coerce.number().int().nonnegative().optional(),
  date: z.coerce.date().optional(),
  sequence_value: z.coerce.number().int().positive().optional()
});

const updateStatusSchema = z.object({
  status: serialStatusSchema
});

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

async function createSignatureFileAsset(connection: PoolConnection, input: {
  assignmentId?: number | null;
  purpose: string;
  status?: string;
  stored: Awaited<ReturnType<typeof encryptAndStoreSignature>>;
  userId: number;
}) {
  const [fileResult] = await connection.execute<ResultSetHeader>(
    `INSERT INTO file_assets (
      uuid, uploaded_by_user_id, uploaded_by_assignment_id, purpose,
      storage_disk, storage_path, original_filename, stored_filename,
      mime_type, byte_size, checksum_sha256, encryption_status, status, metadata
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      uuid(),
      input.userId,
      input.assignmentId || null,
      input.purpose,
      "local_encrypted",
      input.stored.storagePath,
      input.stored.originalFilename,
      input.stored.storedFilename,
      input.stored.mimeType,
      input.stored.byteSize,
      input.stored.checksum,
      "encrypted",
      input.status || "active",
      JSON.stringify(input.stored.metadata)
    ]
  );

  return Number(fileResult.insertId);
}

async function activateSignatureAsset(connection: PoolConnection, request: Request, input: {
  fileAssetId: number;
  pin: string;
  profileMetadata: Record<string, unknown>;
  userId: number;
}) {
  const [existingRows] = await connection.execute<RowDataPacket[]>(
    "SELECT * FROM signature_profiles WHERE user_id = ? AND deleted_at IS NULL LIMIT 1",
    [input.userId]
  );
  const existing = existingRows[0];
  const pinHash = await argon2.hash(input.pin, { type: argon2.argon2id });
  let profileId = 0;

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
      [uuid(), input.userId, pinHash, "active"]
    );
    profileId = Number(profileResult.insertId);
  }

  const [assetResult] = await connection.execute<ResultSetHeader>(
    `INSERT INTO signature_assets (
      uuid, signature_profile_id, file_asset_id, status, processing_status,
      encryption_algorithm, accepted_at, metadata
    ) VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, ?)`,
    [
      uuid(),
      profileId,
      input.fileAssetId,
      "active",
      "background_removed_preview_accepted",
      "aes-256-gcm",
      JSON.stringify(input.profileMetadata)
    ]
  );
  const signatureAssetId = Number(assetResult.insertId);

  await connection.execute<ResultSetHeader>(
    `UPDATE signature_profiles
     SET active_signature_asset_id = ?, updated_at = CURRENT_TIMESTAMP
     WHERE id = ?`,
    [signatureAssetId, profileId]
  );

  await writeAuditLog(request, { action: "signature.profile.enroll", entityType: "signature_profile", entityId: profileId }, connection);
  return profileId;
}

function tokenHash(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

type PlacementTokenPayload = {
  assignmentId: number;
  documentHash: string;
  documentId: number;
  documentVersionNumber: number;
  expiresAt: number;
  pinVerificationEventId: number;
  purpose: "self" | "task";
  signatureAssetId: number;
  taskId?: number | null;
  userId: number;
};

const placementTokenPayloadSchema = z.object({
  assignmentId: z.number().int().positive(),
  documentHash: z.string().length(64),
  documentId: z.number().int().positive(),
  documentVersionNumber: z.number().int().positive(),
  expiresAt: z.number().int().positive(),
  pinVerificationEventId: z.number().int().positive(),
  purpose: z.enum(["self", "task"]),
  signatureAssetId: z.number().int().positive(),
  taskId: z.number().int().positive().nullable().optional(),
  userId: z.number().int().positive()
});

function placementTokenSignature(encodedPayload: string) {
  return createHmac("sha256", env.SESSION_SECRET)
    .update(encodedPayload)
    .digest("base64url");
}

function createPlacementToken(payload: PlacementTokenPayload) {
  const encodedPayload = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${encodedPayload}.${placementTokenSignature(encodedPayload)}`;
}

function parsePlacementToken(token: string): PlacementTokenPayload {
  const [encodedPayload, signature] = token.split(".");
  if (!encodedPayload || !signature) {
    throw new AppError(401, "invalid_signature_token", "Signature placement token is invalid.");
  }

  const expected = placementTokenSignature(encodedPayload);
  const signatureBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expected);
  if (signatureBuffer.length !== expectedBuffer.length || !timingSafeEqual(signatureBuffer, expectedBuffer)) {
    throw new AppError(401, "invalid_signature_token", "Signature placement token is invalid.");
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(Buffer.from(encodedPayload, "base64url").toString("utf8"));
  } catch {
    throw new AppError(401, "invalid_signature_token", "Signature placement token is invalid.");
  }

  const payload = placementTokenPayloadSchema.parse(parsed);
  if (payload.expiresAt <= Date.now()) {
    throw new AppError(401, "signature_token_expired", "Signature placement token expired. Enter your PIN again.");
  }
  return payload;
}

function defaultSignaturePrintOptions(input?: z.infer<typeof signaturePrintOptionsSchema>) {
  return {
    show_name_position: input?.show_name_position ?? true,
    show_date: input?.show_date ?? false,
    show_comment: input?.show_comment ?? false
  };
}

function assertDocumentVersionUnchanged(
  lockedDocument: RowDataPacket,
  input: { expected_document_hash?: string; expected_document_version_number?: number },
  tokenPayload?: PlacementTokenPayload
) {
  const documentHash = calculateDocumentContentHash(lockedDocument);
  const documentVersionNumber = Number(lockedDocument.current_version_number || 1);
  const expectedHash = input.expected_document_hash || tokenPayload?.documentHash;
  const expectedVersion = input.expected_document_version_number || tokenPayload?.documentVersionNumber;

  if (
    (expectedVersion && expectedVersion !== documentVersionNumber)
    || (expectedHash && expectedHash !== documentHash)
  ) {
    throw new AppError(409, "document_version_changed", "The document changed after you opened it. Review the latest version before signing.");
  }

  return { documentHash, documentVersionNumber };
}

async function assertPlacementTokenUnused(connection: PoolConnection, pinVerificationEventId: number) {
  const [rows] = await connection.execute<RowDataPacket[]>(
    "SELECT id FROM signature_events WHERE pin_verification_event_id = ? LIMIT 1",
    [pinVerificationEventId]
  );
  if (rows.length) {
    throw new AppError(409, "signature_token_used", "This signature placement token was already used.");
  }
}

async function hasCompletedSignatureForPosition(database: Database, documentId: number, positionId: number) {
  const [rows] = await database.execute<RowDataPacket[]>(
    `SELECT signature_events.id
     FROM signature_events
     INNER JOIN assignments ON signature_events.assignment_id = assignments.id
     WHERE signature_events.document_id = ?
       AND assignments.position_id = ?
       AND signature_events.status = 'completed'
     LIMIT 1`,
    [documentId, positionId]
  );
  return Boolean(rows[0]);
}

async function assertPositionHasNotSigned(database: Database, documentId: number, positionId: number) {
  if (await hasCompletedSignatureForPosition(database, documentId, positionId)) {
    throw new AppError(409, "document_already_signed_by_position", "This active position has already signed this document.");
  }
}

async function activeSignatureAssetPreview(signatureAssetId: number) {
  const [rows] = await pool.execute<RowDataPacket[]>(
    `SELECT file_assets.storage_path AS storagePath, file_assets.mime_type AS mimeType
     FROM signature_assets
     INNER JOIN file_assets ON signature_assets.file_asset_id = file_assets.id
     WHERE signature_assets.id = ?
       AND signature_assets.status = 'active'
       AND file_assets.status = 'active'
     LIMIT 1`,
    [signatureAssetId]
  );
  const asset = rows[0];
  if (!asset) {
    throw notFound("Signature asset");
  }
  const decrypted = await decryptSignatureFile({
    mimeType: String(asset.mimeType),
    storagePath: String(asset.storagePath)
  });
  return { data_url: decrypted.dataUrl, mime_type: decrypted.mimeType };
}

async function signerPayload(assignmentId: number) {
  const [rows] = await pool.execute<RowDataPacket[]>(
    `SELECT
       persons.display_name AS name,
       positions.title AS position,
       units.name AS unit
     FROM assignments
     INNER JOIN persons ON assignments.person_id = persons.id
     INNER JOIN positions ON assignments.position_id = positions.id
     INNER JOIN units ON positions.unit_id = units.id
     WHERE assignments.id = ?
     LIMIT 1`,
    [assignmentId]
  );
  return rows[0] ? {
    name: rows[0].name || null,
    position: rows[0].position || null,
    unit: rows[0].unit || null
  } : null;
}

async function activeAssignmentHasSigningAuthority(assignmentId: number) {
  const [rows] = await pool.execute<RowDataPacket[]>(
    `SELECT positions.is_signing_authority AS isSigningAuthority
     FROM assignments
     INNER JOIN positions ON assignments.position_id = positions.id
     WHERE assignments.id = ?
     LIMIT 1`,
    [assignmentId]
  );
  return rows[0]?.isSigningAuthority === true || rows[0]?.isSigningAuthority === 1;
}

async function assertSelfSigningAllowed(response: Response, assignmentId: number) {
  if (isAdmin(response)) {
    return;
  }
  if (await activeAssignmentHasSigningAuthority(assignmentId)) {
    return;
  }
  throw new AppError(403, "signature_not_allowed", "Your active position is not allowed to self-sign this document.");
}

function assertDocumentSignable(document: RowDataPacket) {
  if (["archived", "closed", "finalized", "serial_assigned"].includes(String(document.status))) {
    throw new AppError(409, "document_not_signable", "Finalized, closed, or archived documents cannot be signed.");
  }
}

function signingSessionResponse(input: {
  assignmentId: number;
  documentHash: string;
  documentId: number;
  documentVersionNumber: number;
  preview: { data_url: string; mime_type: string };
  purpose: "self" | "task";
  signatureAssetId: number;
  taskId?: number | null;
  pinVerificationEventId: number;
  userId: number;
}) {
  const expiresAt = Date.now() + 5 * 60 * 1000;
  return {
    expires_at: new Date(expiresAt).toISOString(),
    placement: {
      render_page: 1,
      render_x: 128,
      render_y: 226,
      render_width: 46,
      render_height: 18
    },
    placement_token: createPlacementToken({
      assignmentId: input.assignmentId,
      documentHash: input.documentHash,
      documentId: input.documentId,
      documentVersionNumber: input.documentVersionNumber,
      expiresAt,
      pinVerificationEventId: input.pinVerificationEventId,
      purpose: input.purpose,
      signatureAssetId: input.signatureAssetId,
      taskId: input.taskId || null,
      userId: input.userId
    }),
    print_options: defaultSignaturePrintOptions(),
    signature_image: input.preview
  };
}

signatureRouter.get("/profile", asyncHandler(async (_request, response) => {
  const authUser = response.locals.authUser!;
  const profile = await getSignatureProfile(authUser.id);
  ok(response, profile || null);
}));

signatureRouter.get("/profile/asset", asyncHandler(async (_request, response) => {
  const authUser = response.locals.authUser!;
  const [rows] = await pool.execute<RowDataPacket[]>(
    `SELECT file_assets.storage_path AS storagePath, file_assets.mime_type AS mimeType
     FROM signature_profiles
     INNER JOIN signature_assets ON signature_profiles.active_signature_asset_id = signature_assets.id
     INNER JOIN file_assets ON signature_assets.file_asset_id = file_assets.id
     WHERE signature_profiles.user_id = ?
       AND signature_profiles.status = 'active'
       AND signature_profiles.deleted_at IS NULL
       AND signature_assets.status = 'active'
       AND file_assets.status = 'active'
     LIMIT 1`,
    [authUser.id]
  );
  const asset = rows[0];
  if (!asset) {
    throw notFound("Signature asset");
  }
  const decrypted = await decryptSignatureFile({
    mimeType: String(asset.mimeType),
    storagePath: String(asset.storagePath)
  });
  ok(response, { data_url: decrypted.dataUrl, mime_type: decrypted.mimeType });
}));

signatureRouter.post("/profile", asyncHandler(async (request, response) => {
  const input = enrollSignatureSchema.parse(request.body);
  const authUser = response.locals.authUser!;
  const assignment = request.session.activeAssignmentId ? await getActiveAssignment(request) : null;
  const stored = await encryptAndStoreSignature({
    imageBase64: input.signature_image_base64,
    originalFilename: input.original_filename,
    mimeType: input.mime_type
  });

  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const fileAssetId = await createSignatureFileAsset(connection, {
      assignmentId: assignment?.id,
      purpose: "signature_image",
      stored,
      userId: authUser.id
    });
    await activateSignatureAsset(connection, request, {
      fileAssetId,
      pin: input.pin,
      profileMetadata: { backgroundRemoval: "client_simple_cleanup", enrollmentSource: "desktop_upload" },
      userId: authUser.id
    });
    await connection.commit();
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }

  created(response, await getSignatureProfile(authUser.id));
}));

signatureRouter.post("/upload-sessions", asyncHandler(async (request, response) => {
  const authUser = response.locals.authUser!;
  const assignment = request.session.activeAssignmentId ? await getActiveAssignment(request) : null;
  const rawToken = randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000);
  const [result] = await pool.execute<ResultSetHeader>(
    `INSERT INTO signature_upload_sessions (
      uuid, user_id, assignment_id, token_hash, status, expires_at,
      ip_address, user_agent, metadata
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      uuid(),
      authUser.id,
      assignment?.id || null,
      tokenHash(rawToken),
      "pending",
      expiresAt,
      request.ip || null,
      request.get("user-agent") || null,
      JSON.stringify({ uploadMode: "phone_qr" })
    ]
  );
  const id = Number(result.insertId);
  await writeAuditLog(request, { action: "signature.upload_session.create", entityType: "signature_upload_session", entityId: id });
  created(response, {
    id,
    expires_at: expiresAt.toISOString(),
    status: "pending",
    token: rawToken,
    upload_url: `/signature-upload/${rawToken}`
  });
}));

signatureRouter.get("/upload-sessions/:sessionId", asyncHandler(async (request, response) => {
  const { sessionId } = z.object({ sessionId: z.coerce.number().int().positive() }).parse(request.params);
  const authUser = response.locals.authUser!;
  const [rows] = await pool.execute<RowDataPacket[]>(
    `SELECT id, status, expires_at, consumed_at, uploaded_file_asset_id AS uploadedFileAssetId, created_at, updated_at
     FROM signature_upload_sessions
     WHERE id = ? AND user_id = ?
     LIMIT 1`,
    [sessionId, authUser.id]
  );
  const session = rows[0];
  if (!session) {
    throw notFound("Signature upload session");
  }
  ok(response, {
    ...session,
    expired: new Date(session.expires_at) <= new Date(),
    preview_url: session.uploadedFileAssetId ? `/api/signatures/upload-sessions/${sessionId}/asset` : null
  });
}));

signatureRouter.get("/upload-sessions/:sessionId/asset", asyncHandler(async (request, response) => {
  const { sessionId } = z.object({ sessionId: z.coerce.number().int().positive() }).parse(request.params);
  const authUser = response.locals.authUser!;
  const [rows] = await pool.execute<RowDataPacket[]>(
    `SELECT file_assets.storage_path AS storagePath, file_assets.mime_type AS mimeType
     FROM signature_upload_sessions
     INNER JOIN file_assets ON signature_upload_sessions.uploaded_file_asset_id = file_assets.id
     WHERE signature_upload_sessions.id = ?
       AND signature_upload_sessions.user_id = ?
       AND file_assets.status = 'pending'
     LIMIT 1`,
    [sessionId, authUser.id]
  );
  const asset = rows[0];
  if (!asset) {
    throw notFound("Signature upload asset");
  }
  const decrypted = await decryptSignatureFile({
    mimeType: String(asset.mimeType),
    storagePath: String(asset.storagePath)
  });
  ok(response, { data_url: decrypted.dataUrl, mime_type: decrypted.mimeType });
}));

signatureRouter.post("/profile/confirm-upload", asyncHandler(async (request, response) => {
  const input = confirmUploadSchema.parse(request.body);
  const authUser = response.locals.authUser!;

  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const [sessionRows] = await connection.execute<RowDataPacket[]>(
      `SELECT *
       FROM signature_upload_sessions
       WHERE id = ? AND user_id = ?
       LIMIT 1
       FOR UPDATE`,
      [input.upload_session_id, authUser.id]
    );
    const session = sessionRows[0];
    if (!session || !session.uploaded_file_asset_id) {
      throw notFound("Signature upload session");
    }
    if (session.status !== "uploaded" || new Date(session.expires_at) <= new Date()) {
      throw new AppError(409, "signature_upload_session_not_usable", "This signature upload session is no longer usable.");
    }

    let fileAssetId = Number(session.uploaded_file_asset_id);
    let enrollmentSource = "phone_upload";

    if (input.signature_image_base64) {
      const stored = await encryptAndStoreSignature({
        imageBase64: input.signature_image_base64,
        originalFilename: input.original_filename || "phone-signature-edited.png",
        mimeType: input.mime_type || "image/png"
      });
      fileAssetId = await createSignatureFileAsset(connection, {
        assignmentId: session.assignment_id ? Number(session.assignment_id) : null,
        purpose: "signature_image",
        stored,
        userId: authUser.id
      });
      enrollmentSource = "phone_upload_desktop_confirmed_edit";
      await connection.execute<ResultSetHeader>(
        "UPDATE file_assets SET status = 'superseded', updated_at = CURRENT_TIMESTAMP WHERE id = ?",
        [session.uploaded_file_asset_id]
      );
    } else {
      await connection.execute<ResultSetHeader>(
        "UPDATE file_assets SET purpose = 'signature_image', status = 'active', updated_at = CURRENT_TIMESTAMP WHERE id = ?",
        [session.uploaded_file_asset_id]
      );
    }

    await activateSignatureAsset(connection, request, {
      fileAssetId,
      pin: input.pin,
      profileMetadata: { backgroundRemoval: "client_simple_cleanup", enrollmentSource },
      userId: authUser.id
    });
    await connection.execute<ResultSetHeader>(
      `UPDATE signature_upload_sessions
       SET status = 'consumed',
           consumed_at = CURRENT_TIMESTAMP,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [session.id]
    );
    await writeAuditLog(request, { action: "signature.upload_session.consume", entityType: "signature_upload_session", entityId: session.id }, connection);
    await connection.commit();
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }

  ok(response, await getSignatureProfile(authUser.id));
}));

publicSignatureUploadRouter.post("/signature-upload/:token", asyncHandler(async (request, response) => {
  const { token } = z.object({ token: z.string().trim().min(32).max(128) }).parse(request.params);
  const input = signatureUploadSchema.parse(request.body);
  const stored = await encryptAndStoreSignature({
    imageBase64: input.signature_image_base64,
    originalFilename: input.original_filename,
    mimeType: input.mime_type
  });

  let sessionId = 0;
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const [sessionRows] = await connection.execute<RowDataPacket[]>(
      `SELECT *
       FROM signature_upload_sessions
       WHERE token_hash = ?
       LIMIT 1
       FOR UPDATE`,
      [tokenHash(token)]
    );
    const session = sessionRows[0];
    if (!session || session.status !== "pending" || new Date(session.expires_at) <= new Date()) {
      throw new AppError(404, "signature_upload_session_not_found", "Signature upload link is invalid or expired.");
    }
    sessionId = Number(session.id);
    const fileAssetId = await createSignatureFileAsset(connection, {
      assignmentId: session.assignment_id ? Number(session.assignment_id) : null,
      purpose: "signature_upload_pending",
      status: "pending",
      stored,
      userId: Number(session.user_id)
    });
    await connection.execute<ResultSetHeader>(
      `UPDATE signature_upload_sessions
       SET status = 'uploaded',
           uploaded_file_asset_id = ?,
           ip_address = ?,
           user_agent = ?,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [
        fileAssetId,
        request.ip || null,
        request.get("user-agent") || null,
        session.id
      ]
    );
    await connection.commit();
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }

  created(response, { session_id: sessionId, status: "uploaded" });
}));

signatureRouter.post("/documents/:documentId/signing-session", asyncHandler(async (request, response) => {
  const { documentId } = z.object({ documentId: z.coerce.number().int().positive() }).parse(request.params);
  const input = signingSessionSchema.parse(request.body);
  const authUser = response.locals.authUser!;
  const { document, assignment } = await assertDocumentAccess(documentId, request, response);

  assertDocumentSignable(document);
  await assertSelfSigningAllowed(response, assignment.id);
  await assertPositionHasNotSigned(pool, documentId, assignment.positionId);
  const { documentHash, documentVersionNumber } = assertDocumentVersionUnchanged(document, input);
  const verification = await verifySigningPin(request, authUser.id, assignment.id, input.pin);
  const preview = await activeSignatureAssetPreview(verification.signatureAssetId);

  ok(response, {
    ...signingSessionResponse({
      assignmentId: assignment.id,
      documentHash,
      documentId,
      documentVersionNumber,
      pinVerificationEventId: verification.pinEventId,
      preview,
      purpose: "self",
      signatureAssetId: verification.signatureAssetId,
      userId: authUser.id
    }),
    signer: await signerPayload(assignment.id)
  });
}));

signatureRouter.post("/documents/:documentId/sign", asyncHandler(async (request, response) => {
  const { documentId } = z.object({ documentId: z.coerce.number().int().positive() }).parse(request.params);
  const input = completeSignatureSchema.parse(request.body);
  const tokenPayload = parsePlacementToken(input.placement_token);
  const authUser = response.locals.authUser!;
  const { assignment } = await assertDocumentAccess(documentId, request, response);

  if (
    tokenPayload.purpose !== "self"
    || tokenPayload.documentId !== documentId
    || tokenPayload.userId !== authUser.id
    || tokenPayload.assignmentId !== assignment.id
  ) {
    throw new AppError(401, "invalid_signature_token", "Signature placement token is invalid for this document.");
  }
  await assertSelfSigningAllowed(response, assignment.id);

  let signatureEventId = 0;
  const responseNote = input.response_note?.trim() || "";
  const printOptions = defaultSignaturePrintOptions(input.print_options);
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const [lockedDocumentRows] = await connection.execute<RowDataPacket[]>(
      "SELECT * FROM documents WHERE id = ? AND deleted_at IS NULL LIMIT 1 FOR UPDATE",
      [documentId]
    );
    const lockedDocument = lockedDocumentRows[0];
    if (!lockedDocument) {
      throw notFound("Document");
    }
    assertDocumentSignable(lockedDocument);
    await assertPositionHasNotSigned(connection, documentId, assignment.positionId);
    const { documentHash, documentVersionNumber } = assertDocumentVersionUnchanged(lockedDocument, {}, tokenPayload);
    await assertPlacementTokenUnused(connection, tokenPayload.pinVerificationEventId);

    const [eventResult] = await connection.execute<ResultSetHeader>(
      `INSERT INTO signature_events (
        uuid, document_id, document_task_id, user_id, assignment_id,
        signature_asset_id, pin_verification_event_id, document_version_number,
        document_hash, response_note, print_options, status, render_page,
        render_x, render_y, render_width, render_height, ip_address, user_agent
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        uuid(),
        documentId,
        null,
        authUser.id,
        assignment.id,
        tokenPayload.signatureAssetId,
        tokenPayload.pinVerificationEventId,
        documentVersionNumber,
        documentHash,
        responseNote || null,
        JSON.stringify(printOptions),
        "completed",
        input.render_page,
        input.render_x,
        input.render_y,
        input.render_width,
        input.render_height,
        request.ip || null,
        request.get("user-agent") || null
      ]
    );
    signatureEventId = Number(eventResult.insertId);
    const nextStatus = "partially_signed";
    await connection.execute<ResultSetHeader>(
      "UPDATE documents SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
      [nextStatus, documentId]
    );

    await connection.execute<ResultSetHeader>(
      `INSERT INTO document_workflow_events (
        uuid, document_id, actor_assignment_id, action, required_action,
        from_status, to_status, from_unit_id, to_unit_id, to_position_id,
        note, payload, permissions
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        uuid(),
        documentId,
        assignment.id,
        "sign",
        "sign",
        lockedDocument.status,
        nextStatus,
        lockedDocument.current_holder_unit_id,
        assignment.unitId,
        assignment.positionId,
        "Document signed.",
        JSON.stringify({
          documentHash,
          documentVersionNumber,
          responseNote: responseNote || null,
          signatureEventId,
          signatureSource: "self",
          placement: {
            renderPage: input.render_page,
            renderX: input.render_x,
            renderY: input.render_y,
            renderWidth: input.render_width,
            renderHeight: input.render_height
          }
        }),
        JSON.stringify({ selfSigned: true })
      ]
    );

    await writeAuditLog(request, { action: "signature.event.create", entityType: "signature_event", entityId: signatureEventId }, connection);
    await connection.commit();
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }

  const [signatureEventRows] = await pool.execute<RowDataPacket[]>("SELECT * FROM signature_events WHERE id = ? LIMIT 1", [signatureEventId]);
  const [documentRows] = await pool.execute<RowDataPacket[]>("SELECT * FROM documents WHERE id = ? LIMIT 1", [documentId]);
  created(response, {
    document: documentRows[0] || null,
    finalRender: null,
    serialAssignment: null,
    signatureEvent: signatureEventRows[0] || null
  });
}));

signatureRouter.post("/documents/:documentId/tasks/:taskId/signing-session", asyncHandler(async (request, response) => {
  const params = z.object({
    documentId: z.coerce.number().int().positive(),
    taskId: z.coerce.number().int().positive()
  }).parse(request.params);
  const input = signingSessionSchema.parse(request.body);
  const authUser = response.locals.authUser!;
  const { document, assignment } = await assertDocumentAccess(params.documentId, request, response);

  assertDocumentSignable(document);
  await assertPositionHasNotSigned(pool, params.documentId, assignment.positionId);
  const [taskRows] = await pool.execute<RowDataPacket[]>(
    `SELECT *
     FROM document_tasks
     WHERE id = ?
       AND document_id = ?
       AND status = 'open'
       AND deleted_at IS NULL
       AND (required_action = 'sign' OR can_sign = TRUE)
       AND (
         assigned_assignment_id = ?
         OR (
           assigned_unit_id = ?
           AND (assigned_position_id IS NULL OR assigned_position_id = ?)
         )
       )
     LIMIT 1`,
    [params.taskId, params.documentId, assignment.id, assignment.unitId, assignment.positionId]
  );
  const task = taskRows[0];
  if (!task) {
    throw new AppError(404, "signature_task_not_found", "No open signature request is assigned to your active position.");
  }
  const responseNote = input.response_note?.trim() || "";
  if (task.requires_comment && !responseNote) {
    throw new AppError(422, "comment_required", "A comment is required before signing this request.");
  }

  const { documentHash, documentVersionNumber } = assertDocumentVersionUnchanged(document, input);
  const verification = await verifySigningPin(request, authUser.id, assignment.id, input.pin);
  const preview = await activeSignatureAssetPreview(verification.signatureAssetId);
  ok(response, {
    ...signingSessionResponse({
      assignmentId: assignment.id,
      documentHash,
      documentId: params.documentId,
      documentVersionNumber,
      pinVerificationEventId: verification.pinEventId,
      preview,
      purpose: "task",
      signatureAssetId: verification.signatureAssetId,
      taskId: params.taskId,
      userId: authUser.id
    }),
    signer: await signerPayload(assignment.id)
  });
}));

signatureRouter.post("/documents/:documentId/tasks/:taskId/sign", asyncHandler(async (request, response) => {
  const params = z.object({
    documentId: z.coerce.number().int().positive(),
    taskId: z.coerce.number().int().positive()
  }).parse(request.params);
  const input = signTaskSchema.parse(request.body);
  const authUser = response.locals.authUser!;
  const { assignment } = await assertDocumentAccess(params.documentId, request, response);
  const tokenPayload = input.placement_token ? parsePlacementToken(input.placement_token) : null;
  if (tokenPayload && (
    tokenPayload.purpose !== "task"
    || tokenPayload.documentId !== params.documentId
    || tokenPayload.taskId !== params.taskId
    || tokenPayload.userId !== authUser.id
    || tokenPayload.assignmentId !== assignment.id
  )) {
    throw new AppError(401, "invalid_signature_token", "Signature placement token is invalid for this request.");
  }

  let signatureEventId = 0;
  let serialAssignmentAfterSign: RowDataPacket | null = null;

  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const [lockedDocumentRows] = await connection.execute<RowDataPacket[]>(
      "SELECT * FROM documents WHERE id = ? AND deleted_at IS NULL LIMIT 1 FOR UPDATE",
      [params.documentId]
    );
    const lockedDocument = lockedDocumentRows[0];
    if (!lockedDocument) {
      throw notFound("Document");
    }
    assertDocumentSignable(lockedDocument);
    await assertPositionHasNotSigned(connection, params.documentId, assignment.positionId);

    const [taskRows] = await connection.execute<RowDataPacket[]>(
      `SELECT *
       FROM document_tasks
       WHERE id = ?
         AND document_id = ?
         AND status = 'open'
         AND deleted_at IS NULL
         AND (required_action = 'sign' OR can_sign = TRUE)
         AND (
           assigned_assignment_id = ?
           OR (
             assigned_unit_id = ?
             AND (assigned_position_id IS NULL OR assigned_position_id = ?)
           )
         )
       LIMIT 1
       FOR UPDATE`,
      [params.taskId, params.documentId, assignment.id, assignment.unitId, assignment.positionId]
    );
    const task = taskRows[0];

    if (!task) {
      throw new AppError(404, "signature_task_not_found", "No open signature request is assigned to your active position.");
    }
    const responseNote = input.response_note?.trim() || "";
    if (task.requires_comment && !responseNote) {
      throw new AppError(422, "comment_required", "A comment is required before signing this request.");
    }

    const { documentHash, documentVersionNumber } = assertDocumentVersionUnchanged(lockedDocument, input, tokenPayload || undefined);
    let signatureAssetId = tokenPayload?.signatureAssetId || 0;
    let pinVerificationEventId = tokenPayload?.pinVerificationEventId || 0;
    if (tokenPayload) {
      await assertPlacementTokenUnused(connection, tokenPayload.pinVerificationEventId);
    } else {
      const verification = await verifySigningPin(request, authUser.id, assignment.id, input.pin!);
      signatureAssetId = verification.signatureAssetId;
      pinVerificationEventId = verification.pinEventId;
    }
    const printOptions = defaultSignaturePrintOptions(input.print_options);

    const [eventResult] = await connection.execute<ResultSetHeader>(
      `INSERT INTO signature_events (
        uuid, document_id, document_task_id, user_id, assignment_id,
        signature_asset_id, pin_verification_event_id, document_version_number,
        document_hash, response_note, print_options, status, render_page,
        render_x, render_y, render_width, render_height, ip_address, user_agent
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        uuid(),
        params.documentId,
        params.taskId,
        authUser.id,
        assignment.id,
        signatureAssetId,
        pinVerificationEventId,
        documentVersionNumber,
        documentHash,
        responseNote || null,
        JSON.stringify(printOptions),
        "completed",
        input.render_page,
        input.render_x,
        input.render_y,
        input.render_width,
        input.render_height,
        request.ip || null,
        request.get("user-agent") || null
      ]
    );
    const eventId = eventResult.insertId;
    signatureEventId = Number(eventId);

    await connection.execute<ResultSetHeader>(
      `UPDATE document_tasks
       SET status = 'completed',
           completed_at = CURRENT_TIMESTAMP,
           completed_by_assignment_id = ?,
           responded_by_assignment_id = ?,
           completion_note = COALESCE(completion_note, 'Signed.'),
           response_note = ?,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [assignment.id, assignment.id, responseNote || null, params.taskId]
    );

    let nextStatus = "partially_signed";
    if (task.can_finalize) {
      const serialAssignment = await assignOfficialSerialForTask(connection, {
        assignmentId: assignment.id,
        documentId: params.documentId,
        signatureEventId: eventId,
        status: "finalized"
      });
      serialAssignmentAfterSign = serialAssignment;
      nextStatus = "finalized";
    } else {
      await connection.execute<ResultSetHeader>(
        "UPDATE documents SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
        [nextStatus, params.documentId]
      );
    }

    await connection.execute<ResultSetHeader>(
      `INSERT INTO document_workflow_events (
        uuid, document_id, actor_assignment_id, action, required_action,
        from_status, to_status, from_unit_id, to_unit_id, to_position_id,
        note, payload, permissions
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        uuid(),
        params.documentId,
        assignment.id,
        "sign",
        "sign",
        lockedDocument.status,
        nextStatus,
        lockedDocument.current_holder_unit_id,
        assignment.unitId,
        assignment.positionId,
        serialAssignmentAfterSign ? `Document signed and serial assigned: ${serialAssignmentAfterSign.serial_value}` : "Document signed.",
        JSON.stringify({
          documentHash,
          documentTaskId: params.taskId,
          documentVersionNumber,
          placement: {
            renderPage: input.render_page,
            renderX: input.render_x,
            renderY: input.render_y,
            renderWidth: input.render_width,
            renderHeight: input.render_height
          },
          printOptions,
          responseNote: responseNote || null,
          signatureEventId: eventId,
          serialAssignmentId: serialAssignmentAfterSign?.id || null
        }),
        JSON.stringify({
          canArchive: Boolean(task.can_archive),
          canFinalize: Boolean(task.can_finalize),
          canForward: Boolean(task.can_forward),
          canReview: Boolean(task.can_review)
        })
      ]
    );

    await writeAuditLog(request, { action: "signature.event.create", entityType: "signature_event", entityId: eventId }, connection);
    if (serialAssignmentAfterSign) {
      await writeAuditLog(request, {
        action: "serial.assign",
        entityType: "document",
        entityId: params.documentId,
        metadata: { serial: serialAssignmentAfterSign.serial_value }
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
  const [taskRows] = await pool.execute<RowDataPacket[]>("SELECT * FROM document_tasks WHERE id = ? LIMIT 1", [params.taskId]);
  const [serialAssignmentRows] = await pool.execute<RowDataPacket[]>("SELECT * FROM serial_assignments WHERE document_id = ? LIMIT 1", [params.documentId]);
  created(response, {
    signatureEvent: signatureEventRows[0] || null,
    task: taskRows[0] || null,
    document: documentRows[0] || null,
    serialAssignment: serialAssignmentAfterSign || serialAssignmentRows[0] || null,
    finalRender: null
  });
}));

async function fetchSerialRule(serialRuleId: number) {
  const [rows] = await pool.execute<RowDataPacket[]>("SELECT * FROM serial_rules WHERE id = ? LIMIT 1", [serialRuleId]);
  return rows[0] || null;
}

function assertSupportedSerialFormat(format: string) {
  const unsupportedTokens = findUnsupportedSerialTokens(format);
  if (unsupportedTokens.length) {
    throw new AppError(422, "unsupported_serial_tokens", "Serial format contains unsupported tokens.", { unsupportedTokens });
  }
}

async function unsetOtherDefaultSerialRules(connection: PoolConnection, serialRuleId?: number) {
  await connection.execute<ResultSetHeader>(
    serialRuleId
      ? "UPDATE serial_rules SET is_default = FALSE, updated_at = CURRENT_TIMESTAMP WHERE is_default = TRUE AND id <> ?"
      : "UPDATE serial_rules SET is_default = FALSE, updated_at = CURRENT_TIMESTAMP WHERE is_default = TRUE",
    serialRuleId ? [serialRuleId] : []
  );
}

function isDuplicateEntryError(error: unknown) {
  return Boolean(
    error &&
    typeof error === "object" &&
    "code" in error &&
    (error as { code?: unknown }).code === "ER_DUP_ENTRY"
  );
}

function rethrowCodeConflict(error: unknown): never {
  if (isDuplicateEntryError(error)) {
    throw new AppError(409, "code_conflict", "This code is already in use for the selected scope.");
  }

  throw error;
}

async function currentSerialSequenceValue(rule: SerialRuleLike & { id?: unknown }, context: SerialContext, date = new Date()) {
  if (!rule.id) {
    return 0;
  }

  const key = serialSequenceKey(rule, context, date);
  const [rows] = await pool.execute<RowDataPacket[]>(
    `SELECT current_value AS currentValue
     FROM serial_sequences
     WHERE serial_rule_id = ?
       AND sequence_scope = ?
       AND sequence_period = ?
     LIMIT 1`,
    [Number(rule.id), key.sequenceScope, key.sequencePeriod]
  );

  return Number(rows[0]?.currentValue || 0);
}

adminSignatureRouter.get("/serial-rules", asyncHandler(async (_request, response) => {
  const [rows] = await pool.execute<RowDataPacket[]>("SELECT * FROM serial_rules ORDER BY id ASC");
  ok(response, rows);
}));

adminSignatureRouter.post("/serial-rules/preview", asyncHandler(async (request, response) => {
  const input = previewSerialRuleSchema.parse(request.body);
  const existingRule = input.serial_rule_id ? await fetchSerialRule(input.serial_rule_id) : null;

  if (input.serial_rule_id && !existingRule) {
    throw notFound("Serial rule");
  }

  const rule = {
    ...(existingRule || {}),
    ...(input.rule || {})
  };
  assertSupportedSerialFormat(String(rule.format || "DOC-{YEAR}-{SEQUENCE}"));

  const date = input.date || new Date();
  const currentValue = input.current_value ?? await currentSerialSequenceValue(rule, input.context || {}, date);
  ok(response, previewSerialNumber(rule, {
    context: input.context,
    currentValue,
    date,
    sequenceValue: input.sequence_value
  }));
}));

adminSignatureRouter.post("/serial-rules", asyncHandler(async (request, response) => {
  const input = createSerialRuleSchema.parse(request.body);
  assertSupportedSerialFormat(input.format);
  let serialRuleId = 0;

  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    if (input.is_default) {
      await unsetOtherDefaultSerialRules(connection);
    }

    const code = input.code || (await generateAdminCode(connection, {
      entity_type: "serial_rule",
      name: input.name
    })).code;
    const [result] = await connection.execute<ResultSetHeader>(
      `INSERT INTO serial_rules (
        uuid, code, name, format, scope, reset_policy, sequence_padding,
        is_default, status, activated_by_user_id, activated_at, notes
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        uuid(),
        code,
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
    rethrowCodeConflict(error);
  } finally {
    connection.release();
  }

  created(response, await fetchSerialRule(serialRuleId));
}));

adminSignatureRouter.patch("/serial-rules/:serialRuleId", asyncHandler(async (request, response) => {
  const { serialRuleId } = z.object({ serialRuleId: z.coerce.number().int().positive() }).parse(request.params);
  const input = updateSerialRuleSchema.parse(request.body);
  const existingRule = await fetchSerialRule(serialRuleId);
  if (!existingRule) {
    throw notFound("Serial rule");
  }

  if (input.format !== undefined) {
    assertSupportedSerialFormat(input.format);
  }

  const assignments: Array<[string, string | number | boolean | Date | null]> = [];
  const addAssignment = (column: string, value: string | number | boolean | Date | null | undefined) => {
    if (value !== undefined) {
      assignments.push([column, value]);
    }
  };

  addAssignment("code", input.code);
  addAssignment("name", input.name);
  addAssignment("format", input.format);
  addAssignment("scope", input.scope);
  addAssignment("reset_policy", input.reset_policy);
  addAssignment("sequence_padding", input.sequence_padding);
  addAssignment("is_default", input.is_default);
  addAssignment("status", input.status);
  addAssignment("notes", input.notes === undefined ? undefined : input.notes || null);

  if (input.status !== undefined) {
    addAssignment("activated_by_user_id", input.status === "active" ? request.session.userId || null : null);
    addAssignment("activated_at", input.status === "active" ? new Date() : null);
  }

  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    if (input.is_default) {
      await unsetOtherDefaultSerialRules(connection, serialRuleId);
    }
    if (assignments.length) {
      await connection.execute<ResultSetHeader>(
        `UPDATE serial_rules
         SET ${assignments.map(([column]) => `${column} = ?`).join(", ")},
             updated_at = CURRENT_TIMESTAMP
         WHERE id = ?`,
        [...assignments.map(([, value]) => value), serialRuleId]
      );
      await writeAuditLog(request, {
        action: "admin.serial_rule.update",
        entityType: "serial_rule",
        entityId: serialRuleId,
        metadata: { fields: assignments.map(([column]) => column) }
      }, connection);
    }
    await connection.commit();
  } catch (error) {
    await connection.rollback();
    rethrowCodeConflict(error);
  } finally {
    connection.release();
  }

  ok(response, await fetchSerialRule(serialRuleId));
}));

adminSignatureRouter.patch("/serial-rules/:serialRuleId/status", asyncHandler(async (request, response) => {
  const { serialRuleId } = z.object({ serialRuleId: z.coerce.number().int().positive() }).parse(request.params);
  const input = updateStatusSchema.parse(request.body);

  const rule = await fetchSerialRule(serialRuleId);
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

  ok(response, await fetchSerialRule(serialRuleId));
}));

adminSignatureRouter.delete("/serial-rules/:serialRuleId", asyncHandler(async (request, response) => {
  const { serialRuleId } = z.object({ serialRuleId: z.coerce.number().int().positive() }).parse(request.params);
  const rule = await fetchSerialRule(serialRuleId);
  if (!rule) {
    throw notFound("Serial rule");
  }

  await pool.execute<ResultSetHeader>(
    `UPDATE serial_rules
     SET status = 'archived',
         is_default = FALSE,
         updated_at = CURRENT_TIMESTAMP
     WHERE id = ?`,
    [serialRuleId]
  );

  await writeAuditLog(request, {
    action: "admin.serial_rule.archive",
    entityType: "serial_rule",
    entityId: serialRuleId,
    metadata: { code: rule.code, name: rule.name }
  });

  ok(response, { id: serialRuleId, archived: true });
}));
