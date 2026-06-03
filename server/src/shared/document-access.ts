import type { Request, Response } from "express";
import type { RowDataPacket } from "mysql2/promise";
import { pool } from "../db/mysql";
import { AppError, forbidden, notFound } from "./errors";

export type ActiveAssignment = {
  id: number;
  personId: number;
  unitId: number;
  unitCode: string;
  unitName: string;
  positionId: number;
  positionTitle: string;
  organizationId: number;
  unitTypeId: number;
  unitTypeCode: string;
  unitTypeName: string;
  positionCode: string;
};

export function isAdmin(response: Response) {
  const roles = response.locals.authUser?.roles || [];
  return roles.includes("system_admin") || roles.includes("admin_staff");
}

export async function getActiveAssignment(request: Request, actionDescription = "this action"): Promise<ActiveAssignment> {
  if (!request.session.activeAssignmentId) {
    throw new AppError(409, "active_assignment_required", `Select an active assignment before ${actionDescription}.`);
  }

  const [assignmentRows] = await pool.execute<RowDataPacket[]>(
    `SELECT
      assignments.id,
      assignments.person_id AS personId,
      positions.unit_id AS unitId,
      units.code AS unitCode,
      units.name AS unitName,
      assignments.position_id AS positionId,
      positions.title AS positionTitle,
      units.organization_id AS organizationId,
      units.unit_type_id AS unitTypeId,
      unit_types.code AS unitTypeCode,
      unit_types.name AS unitTypeName,
      positions.code AS positionCode
    FROM assignments
    INNER JOIN positions ON assignments.position_id = positions.id
    INNER JOIN units ON positions.unit_id = units.id
    INNER JOIN unit_types ON units.unit_type_id = unit_types.id
    WHERE assignments.id = ?
      AND assignments.status = 'active'
      AND assignments.deleted_at IS NULL
    LIMIT 1`,
    [request.session.activeAssignmentId]
  );
  const assignment = assignmentRows[0];

  if (!assignment) {
    throw new AppError(409, "active_assignment_invalid", "The selected assignment is no longer active.");
  }

  return {
    id: Number(assignment.id),
    personId: Number(assignment.personId),
    unitId: Number(assignment.unitId),
    unitCode: String(assignment.unitCode),
    unitName: String(assignment.unitName),
    positionId: Number(assignment.positionId),
    positionTitle: String(assignment.positionTitle),
    organizationId: Number(assignment.organizationId),
    unitTypeId: Number(assignment.unitTypeId),
    unitTypeCode: String(assignment.unitTypeCode),
    unitTypeName: String(assignment.unitTypeName),
    positionCode: String(assignment.positionCode)
  };
}

export async function assertDocumentAccess(documentId: number, request: Request, response: Response) {
  const assignment = await getActiveAssignment(request, "working with this document");
  const [documentRows] = await pool.execute<RowDataPacket[]>(
    "SELECT * FROM documents WHERE id = ? AND deleted_at IS NULL LIMIT 1",
    [documentId]
  );
  const document = documentRows[0];

  if (!document) {
    throw notFound("Document");
  }

  if (isAdmin(response)) {
    return { document, assignment };
  }

  const [relatedAssignmentRows] = await pool.execute<RowDataPacket[]>(
    "SELECT id FROM assignments WHERE person_id = ? AND deleted_at IS NULL",
    [assignment.personId]
  );

  const relatedAssignmentIds = relatedAssignmentRows.map((row) => Number(row.id));
  const relatedAssignmentPlaceholders = relatedAssignmentIds.length ? relatedAssignmentIds.map(() => "?").join(", ") : "NULL";
  const [taskRows] = await pool.execute<RowDataPacket[]>(
    `SELECT id
     FROM document_tasks
     WHERE document_id = ?
       AND deleted_at IS NULL
       AND (
         assigned_assignment_id IN (${relatedAssignmentPlaceholders})
         OR (
           assigned_unit_id = ?
           AND (assigned_position_id IS NULL OR assigned_position_id = ?)
         )
       )
     LIMIT 1`,
    [documentId, ...relatedAssignmentIds, assignment.unitId, assignment.positionId]
  );
  const [signatureRows] = await pool.execute<RowDataPacket[]>(
    `SELECT id
     FROM signature_events
     WHERE document_id = ?
       AND assignment_id IN (${relatedAssignmentPlaceholders})
     LIMIT 1`,
    [documentId, ...relatedAssignmentIds]
  );

  const canAccess = relatedAssignmentIds.includes(Number(document.creator_assignment_id))
    || Number(document.origin_unit_id) === assignment.unitId
    || Number(document.owner_unit_id) === assignment.unitId
    || Number(document.current_holder_unit_id) === assignment.unitId
    || taskRows.length > 0
    || signatureRows.length > 0;

  if (!canAccess) {
    throw forbidden();
  }

  return { document, assignment };
}
