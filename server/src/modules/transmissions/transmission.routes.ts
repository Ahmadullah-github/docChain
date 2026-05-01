import { Router } from "express";
import type { ResultSetHeader, RowDataPacket } from "mysql2/promise";
import { z } from "zod";
import { pool } from "../../db/mysql";
import { requireAuth } from "../../middleware/auth";
import { assertDocumentAccess, getActiveAssignment } from "../../shared/document-access";
import { asyncHandler } from "../../shared/async-handler";
import { writeAuditLog } from "../../shared/audit";
import { notFound } from "../../shared/errors";
import { created, ok } from "../../shared/http";
import { fetchById, optionalNullableString } from "../../shared/route-utils";
import { uuid } from "../../shared/ids";

export const transmissionRouter = Router();

transmissionRouter.use(requireAuth);

const recipientSchema = z.object({
  recipient_type: z.enum(["unit", "assignment", "external_organization", "external_recipient"]),
  to_unit_id: z.coerce.number().int().positive().nullable().optional(),
  to_assignment_id: z.coerce.number().int().positive().nullable().optional(),
  external_organization_id: z.coerce.number().int().positive().nullable().optional(),
  external_recipient_id: z.coerce.number().int().positive().nullable().optional(),
  recipient_label: optionalNullableString,
  note: optionalNullableString
}).superRefine((recipient, context) => {
  const requiredTargetByType = {
    unit: "to_unit_id",
    assignment: "to_assignment_id",
    external_organization: "external_organization_id",
    external_recipient: "external_recipient_id"
  } as const;
  const requiredTarget = requiredTargetByType[recipient.recipient_type];

  if (!recipient[requiredTarget]) {
    context.addIssue({
      code: "custom",
      path: [requiredTarget],
      message: `Required when recipient_type is ${recipient.recipient_type}.`
    });
  }
});

transmissionRouter.get("/documents/:documentId/transmissions", asyncHandler(async (request, response) => {
  const { documentId } = z.object({ documentId: z.coerce.number().int().positive() }).parse(request.params);
  await assertDocumentAccess(documentId, request, response);
  const [transmissions] = await pool.execute<RowDataPacket[]>(
    `SELECT *
     FROM transmissions
     WHERE document_id = ?
     ORDER BY created_at DESC`,
    [documentId]
  );
  const transmissionIds = transmissions.map((row) => row.id);
  let recipients: RowDataPacket[] = [];
  if (transmissionIds.length) {
    const placeholders = transmissionIds.map(() => "?").join(", ");
    const [recipientRows] = await pool.execute<RowDataPacket[]>(
      `SELECT *
       FROM transmission_recipients
       WHERE transmission_id IN (${placeholders})
       ORDER BY id ASC`,
      transmissionIds
    );
    recipients = recipientRows;
  }
  ok(response, { transmissions, recipients });
}));

transmissionRouter.post("/documents/:documentId/transmissions", asyncHandler(async (request, response) => {
  const { documentId } = z.object({ documentId: z.coerce.number().int().positive() }).parse(request.params);
  const input = z.object({
    transmission_type: z.string().trim().min(1).max(80),
    visibility_policy: z.string().trim().min(1).max(80).default("show_all"),
    visibility_rule_id: z.coerce.number().int().positive().nullable().optional(),
    subject_override: optionalNullableString,
    message: optionalNullableString,
    recipients: z.array(recipientSchema).min(1),
    metadata: z.record(z.string(), z.unknown()).optional()
  }).parse(request.body);
  const { document, assignment } = await assertDocumentAccess(documentId, request, response);
  let transmissionId = 0;

  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const [transmissionResult] = await connection.execute<ResultSetHeader>(
      `INSERT INTO transmissions (
        uuid, document_id, from_unit_id, from_assignment_id, transmission_type,
        visibility_policy, visibility_rule_id, status, subject_override,
        message, sent_at, metadata
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, ?)`,
      [
        uuid(),
        documentId,
        assignment.unitId,
        assignment.id,
        input.transmission_type,
        input.visibility_policy,
        input.visibility_rule_id || null,
        "sent",
        input.subject_override || null,
        input.message || null,
        JSON.stringify(input.metadata || {})
      ]
    );
    const id = transmissionResult.insertId;
    transmissionId = Number(id);

    for (const recipient of input.recipients) {
      await connection.execute<ResultSetHeader>(
        `INSERT INTO transmission_recipients (
          uuid, transmission_id, recipient_type, to_unit_id, to_assignment_id,
          external_organization_id, external_recipient_id, recipient_label,
          note, status
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          uuid(),
          id,
          recipient.recipient_type,
          recipient.to_unit_id || null,
          recipient.to_assignment_id || null,
          recipient.external_organization_id || null,
          recipient.external_recipient_id || null,
          recipient.recipient_label || null,
          recipient.note || null,
          "sent"
        ]
      );

      if (recipient.to_assignment_id) {
        const [targetRows] = await connection.execute<RowDataPacket[]>(
          `SELECT users.id AS userId
           FROM assignments
           INNER JOIN users ON assignments.person_id = users.person_id
           WHERE assignments.id = ? AND users.status = 'active'
           LIMIT 1`,
          [recipient.to_assignment_id]
        );
        const target = targetRows[0];
        if (target) {
          await connection.execute<ResultSetHeader>(
            `INSERT INTO notifications (
              uuid, recipient_user_id, recipient_assignment_id, document_id,
              transmission_id, notification_type, channel, title, body,
              status, payload
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
              uuid(),
              target.userId,
              recipient.to_assignment_id,
              documentId,
              id,
              "document_transmission",
              "in_app",
              "Document transmitted",
              document.subject,
              "queued",
              JSON.stringify({ transmissionId: id })
            ]
          );
        }
      }
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
        input.transmission_type,
        document.status,
        input.transmission_type === "dispatch" ? "dispatched" : document.status,
        document.current_holder_unit_id,
        null,
        input.message || "Transmission created.",
        JSON.stringify({ transmissionId: id, recipients: input.recipients.length })
      ]
    );

    if (input.transmission_type === "dispatch") {
      await connection.execute<ResultSetHeader>(
        "UPDATE documents SET status = 'dispatched', updated_at = CURRENT_TIMESTAMP WHERE id = ?",
        [documentId]
      );
    }

    await writeAuditLog(request, { action: "document.transmission.create", entityType: "transmission", entityId: id }, connection);
    await connection.commit();
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }

  const [recipientRows] = await pool.execute<RowDataPacket[]>(
    "SELECT * FROM transmission_recipients WHERE transmission_id = ?",
    [transmissionId]
  );
  created(response, {
    transmission: await fetchById("transmissions", transmissionId),
    recipients: recipientRows
  });
}));

transmissionRouter.patch("/transmission-recipients/:recipientId/status", asyncHandler(async (request, response) => {
  const { recipientId } = z.object({ recipientId: z.coerce.number().int().positive() }).parse(request.params);
  const input = z.object({
    status: z.enum(["received", "acknowledged", "under_action", "completed"]),
    note: optionalNullableString
  }).parse(request.body);
  const assignment = await getActiveAssignment(request, "updating a transmission recipient");
  const [recipientRows] = await pool.execute<RowDataPacket[]>(
    `SELECT transmission_recipients.*, transmissions.document_id AS documentId
     FROM transmission_recipients
     INNER JOIN transmissions ON transmission_recipients.transmission_id = transmissions.id
     WHERE transmission_recipients.id = ?
     LIMIT 1`,
    [recipientId]
  );
  const recipient = recipientRows[0];
  if (!recipient) {
    throw notFound("Transmission recipient");
  }

  const isDirectRecipient = Number(recipient.to_assignment_id) === assignment.id
    || Number(recipient.to_unit_id) === assignment.unitId;
  if (!isDirectRecipient) {
    await assertDocumentAccess(Number(recipient.documentId), request, response);
  }

  await pool.execute<ResultSetHeader>(
    `UPDATE transmission_recipients
     SET status = ?,
         note = ?,
         received_at = ?,
         acknowledged_at = ?,
         completed_at = ?,
         received_by_assignment_id = ?,
         acknowledged_by_assignment_id = ?,
         updated_at = CURRENT_TIMESTAMP
     WHERE id = ?`,
    [
      input.status,
      input.note || recipient.note,
      input.status === "received" ? new Date() : recipient.received_at,
      input.status === "acknowledged" ? new Date() : recipient.acknowledged_at,
      input.status === "completed" ? new Date() : recipient.completed_at,
      input.status === "received" ? assignment.id : recipient.received_by_assignment_id,
      input.status === "acknowledged" ? assignment.id : recipient.acknowledged_by_assignment_id,
      recipientId
    ]
  );
  await writeAuditLog(request, { action: "transmission_recipient.status_update", entityType: "transmission_recipient", entityId: recipientId });
  ok(response, await fetchById("transmission_recipients", recipientId));
}));

transmissionRouter.post("/documents/:documentId/renders", asyncHandler(async (request, response) => {
  const { documentId } = z.object({ documentId: z.coerce.number().int().positive() }).parse(request.params);
  const input = z.object({
    transmission_id: z.coerce.number().int().positive().nullable().optional(),
    file_asset_id: z.coerce.number().int().positive().nullable().optional(),
    render_type: z.string().trim().min(1).max(80).default("html_definition"),
    visibility_policy: z.string().trim().min(1).max(80).default("show_all"),
    source_version_number: z.coerce.number().int().positive().nullable().optional(),
    render_definition: z.record(z.string(), z.unknown()).default({}),
    signature_visibility: z.array(z.object({
      signature_event_id: z.coerce.number().int().positive().nullable().optional(),
      signature_slot_id: z.coerce.number().int().positive().nullable().optional(),
      is_visible: z.boolean(),
      visibility_reason: optionalNullableString
    })).default([])
  }).parse(request.body);
  const { assignment } = await assertDocumentAccess(documentId, request, response);
  let renderId = 0;

  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const [renderResult] = await connection.execute<ResultSetHeader>(
      `INSERT INTO document_renders (
        uuid, document_id, transmission_id, file_asset_id, render_key,
        render_type, visibility_policy, source_version_number, status,
        created_by_assignment_id, render_definition, metadata
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        uuid(),
        documentId,
        input.transmission_id || null,
        input.file_asset_id || null,
        `render_${uuid()}`,
        input.render_type,
        input.visibility_policy,
        input.source_version_number || null,
        "generated",
        assignment.id,
        JSON.stringify(input.render_definition),
        JSON.stringify({})
      ]
    );
    const id = renderResult.insertId;
    renderId = Number(id);

    for (const item of input.signature_visibility) {
      await connection.execute<ResultSetHeader>(
        `INSERT INTO render_signature_visibility (
          uuid, document_render_id, signature_event_id, signature_slot_id,
          is_visible, visibility_reason, visibility_policy
        ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
          uuid(),
          id,
          item.signature_event_id || null,
          item.signature_slot_id || null,
          item.is_visible,
          item.visibility_reason || null,
          input.visibility_policy
        ]
      );
    }

    await writeAuditLog(request, { action: "document.render.create", entityType: "document_render", entityId: id }, connection);
    await connection.commit();
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }

  const [signatureVisibility] = await pool.execute<RowDataPacket[]>(
    "SELECT * FROM render_signature_visibility WHERE document_render_id = ?",
    [renderId]
  );
  created(response, {
    render: await fetchById("document_renders", renderId),
    signatureVisibility
  });
}));

transmissionRouter.post("/documents/:documentId/archive", asyncHandler(async (request, response) => {
  const { documentId } = z.object({ documentId: z.coerce.number().int().positive() }).parse(request.params);
  const input = z.object({
    archive_render_id: z.coerce.number().int().positive().nullable().optional(),
    retention_policy_id: z.coerce.number().int().positive().nullable().optional(),
    reason: optionalNullableString,
    metadata: z.record(z.string(), z.unknown()).optional()
  }).parse(request.body);
  const { assignment } = await assertDocumentAccess(documentId, request, response);
  let archiveId = 0;

  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    let defaultPolicyId = null;
    if (!input.retention_policy_id) {
      const [defaultRows] = await connection.execute<RowDataPacket[]>(
        "SELECT id FROM retention_policies WHERE is_default = TRUE AND status = 'active' LIMIT 1"
      );
      defaultPolicyId = defaultRows[0]?.id || null;
    }
    const retentionPolicyId = input.retention_policy_id
      || defaultPolicyId
      || null;
    let policy = null;
    if (retentionPolicyId) {
      const [policyRows] = await connection.execute<RowDataPacket[]>(
        "SELECT * FROM retention_policies WHERE id = ? LIMIT 1",
        [retentionPolicyId]
      );
      policy = policyRows[0] || null;
    }
    const reviewAt = policy?.retention_months
      ? new Date(Date.now() + Number(policy.retention_months) * 30 * 24 * 60 * 60 * 1000)
      : null;

    const [archiveResult] = await connection.execute<ResultSetHeader>(
      `INSERT INTO archive_records (
        uuid, document_id, archive_render_id, retention_policy_id,
        archived_by_assignment_id, archive_status, retention_review_at,
        disposition_due_at, reason, metadata
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        uuid(),
        documentId,
        input.archive_render_id || null,
        retentionPolicyId,
        assignment.id,
        "archived",
        reviewAt,
        reviewAt,
        input.reason || null,
        JSON.stringify(input.metadata || {})
      ]
    );
    const id = archiveResult.insertId;
    archiveId = Number(id);

    await connection.execute<ResultSetHeader>(
      `UPDATE documents
       SET status = 'archived',
           archived_at = CURRENT_TIMESTAMP,
           archived_by_assignment_id = ?,
           archive_reason = ?,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [assignment.id, input.reason || null, documentId]
    );
    await writeAuditLog(request, { action: "document.archive", entityType: "archive_record", entityId: id }, connection);
    await connection.commit();
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }

  created(response, await fetchById("archive_records", archiveId));
}));
