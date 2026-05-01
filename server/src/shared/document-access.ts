import type { Request, Response } from "express";
import type { RowDataPacket } from "mysql2/promise";
import { pool } from "../db/mysql";
import { AppError, forbidden, notFound } from "./errors";

export type ActiveAssignment = {
  id: number;
  personId: number;
  unitId: number;
  positionId: number;
  organizationId: number;
  unitTypeId: number;
  unitTypeCode: string;
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
      assignments.unit_id AS unitId,
      assignments.position_id AS positionId,
      units.organization_id AS organizationId,
      units.unit_type_id AS unitTypeId,
      unit_types.code AS unitTypeCode,
      positions.code AS positionCode
    FROM assignments
    INNER JOIN units ON assignments.unit_id = units.id
    INNER JOIN unit_types ON units.unit_type_id = unit_types.id
    INNER JOIN positions ON assignments.position_id = positions.id
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
    positionId: Number(assignment.positionId),
    organizationId: Number(assignment.organizationId),
    unitTypeId: Number(assignment.unitTypeId),
    unitTypeCode: String(assignment.unitTypeCode),
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

  const canAccess = relatedAssignmentRows.map((row) => Number(row.id)).includes(Number(document.creator_assignment_id))
    || Number(document.origin_unit_id) === assignment.unitId
    || Number(document.owner_unit_id) === assignment.unitId
    || Number(document.current_holder_unit_id) === assignment.unitId;

  if (!canAccess) {
    throw forbidden();
  }

  return { document, assignment };
}
