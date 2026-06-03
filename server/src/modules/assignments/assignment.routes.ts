import { Router } from "express";
import type { RowDataPacket } from "mysql2/promise";
import { z } from "zod";
import { pool } from "../../db/mysql";
import { requireAuth } from "../../middleware/auth";
import { asyncHandler } from "../../shared/async-handler";
import { writeAuditLog } from "../../shared/audit";
import { AppError } from "../../shared/errors";
import { ok } from "../../shared/http";

export const assignmentRouter = Router();

const selectActiveAssignmentSchema = z.object({
  assignmentId: z.coerce.number().int().positive()
});

assignmentRouter.use(requireAuth);

assignmentRouter.get("/my", asyncHandler(async (_request, response) => {
  const authUser = response.locals.authUser!;

  const [assignments] = await pool.execute<RowDataPacket[]>(
    `SELECT
      assignments.id,
      assignments.uuid,
      assignments.status,
      assignments.is_primary AS isPrimary,
      assignments.starts_at AS startsAt,
      assignments.ends_at AS endsAt,
      units.id AS unitId,
      units.name AS unitName,
      units.code AS unitCode,
      unit_types.code AS unitType,
      positions.id AS positionId,
      positions.title AS positionTitle,
      positions.code AS positionCode,
      positions.is_signing_authority AS isSigningAuthority
    FROM assignments
    INNER JOIN positions ON assignments.position_id = positions.id
    INNER JOIN units ON positions.unit_id = units.id
    INNER JOIN unit_types ON units.unit_type_id = unit_types.id
    WHERE assignments.person_id = ?
      AND assignments.deleted_at IS NULL
    ORDER BY assignments.is_primary DESC, assignments.id ASC`,
    [authUser.personId]
  );

  ok(response, assignments);
}));

assignmentRouter.post("/select-active", asyncHandler(async (request, response) => {
  const input = selectActiveAssignmentSchema.parse(request.body);
  const authUser = response.locals.authUser!;

  const [assignmentRows] = await pool.execute<RowDataPacket[]>(
    `SELECT *
     FROM assignments
     WHERE id = ?
       AND person_id = ?
       AND status = 'active'
       AND deleted_at IS NULL
     LIMIT 1`,
    [input.assignmentId, authUser.personId]
  );
  const assignment = assignmentRows[0];

  if (!assignment) {
    throw new AppError(404, "assignment_not_found", "Active assignment was not found for this user.");
  }

  request.session.activeAssignmentId = Number(assignment.id);

  await writeAuditLog(request, {
    action: "assignment.select_active",
    entityType: "assignment",
    entityId: assignment.id
  });

  ok(response, { activeAssignmentId: Number(assignment.id) });
}));
