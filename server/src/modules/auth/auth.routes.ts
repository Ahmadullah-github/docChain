import argon2 from "argon2";
import { Router } from "express";
import type { ResultSetHeader, RowDataPacket } from "mysql2/promise";
import { z } from "zod";
import { pool } from "../../db/mysql";
import { requireAuth } from "../../middleware/auth";
import { ensureCsrfToken } from "../../middleware/csrf";
import { asyncHandler } from "../../shared/async-handler";
import { writeAuditLog } from "../../shared/audit";
import { AppError } from "../../shared/errors";
import { ok } from "../../shared/http";

export const authRouter = Router();

const loginSchema = z.object({
  identifier: z.string().trim().min(1),
  password: z.string().min(1)
});

const changePasswordSchema = z.object({
  current_password: z.string().min(1),
  new_password: z.string().min(8).max(128)
});

const activeAssignmentSchema = z.object({
  assignmentId: z.coerce.number().int().positive()
});

function regenerateSession(request: Express.Request) {
  return new Promise<void>((resolve, reject) => {
    request.session.regenerate((error) => {
      if (error) {
        reject(error);
        return;
      }
      resolve();
    });
  });
}

function destroySession(request: Express.Request) {
  return new Promise<void>((resolve, reject) => {
    request.session.destroy((error) => {
      if (error) {
        reject(error);
        return;
      }
      resolve();
    });
  });
}

async function getUserPayload(userId: number, activeAssignmentId?: number) {
  const [userRows] = await pool.execute<RowDataPacket[]>(
    `SELECT
      users.id,
      users.uuid,
      users.person_id AS personId,
      users.email,
      users.username,
      users.status,
      users.must_change_password AS mustChangePassword,
      persons.display_name AS displayName
    FROM users
    INNER JOIN persons ON users.person_id = persons.id
    WHERE users.id = ? AND users.deleted_at IS NULL
    LIMIT 1`,
    [userId]
  );
  const user = userRows[0];

  if (!user) {
    throw new AppError(401, "unauthorized", "Authentication is required.");
  }

  const [roles] = await pool.execute<RowDataPacket[]>(
    `SELECT roles.name, roles.display_name AS displayName
     FROM roles
     INNER JOIN user_roles ON roles.id = user_roles.role_id
     WHERE user_roles.user_id = ?`,
    [userId]
  );

  const [assignments] = await pool.execute<RowDataPacket[]>(
    `SELECT
      assignments.id,
      assignments.uuid,
      assignments.status,
      assignments.is_primary AS isPrimary,
      units.id AS unitId,
      units.name AS unitName,
      units.code AS unitCode,
      positions.id AS positionId,
      positions.title AS positionTitle,
      positions.code AS positionCode
    FROM assignments
    INNER JOIN positions ON assignments.position_id = positions.id
    INNER JOIN units ON positions.unit_id = units.id
    WHERE assignments.person_id = ?
      AND assignments.status = 'active'
      AND assignments.deleted_at IS NULL
    ORDER BY assignments.is_primary DESC, assignments.id ASC`,
    [user.personId]
  );

  return {
    user: {
      id: Number(user.id),
      uuid: user.uuid,
      personId: Number(user.personId),
      email: user.email,
      username: user.username,
      status: user.status,
      mustChangePassword: Boolean(user.mustChangePassword),
      displayName: user.displayName
    },
    roles,
    assignments,
    activeAssignmentId: activeAssignmentId || null
  };
}

authRouter.post("/login", asyncHandler(async (request, response) => {
  const input = loginSchema.parse(request.body);

  const [userRows] = await pool.execute<RowDataPacket[]>(
    `SELECT *
     FROM users
     WHERE (email = ? OR username = ?)
       AND deleted_at IS NULL
     LIMIT 1`,
    [input.identifier, input.identifier]
  );
  const user = userRows[0];

  if (!user) {
    throw new AppError(401, "invalid_credentials", "Invalid email/username or password.");
  }

  if (user.locked_until && new Date(user.locked_until) > new Date()) {
    throw new AppError(423, "account_locked", "This account is temporarily locked.");
  }

  if (user.status !== "active") {
    throw new AppError(403, "account_not_active", "This account is not active.");
  }

  const passwordOk = await argon2.verify(user.password_hash, input.password);
  if (!passwordOk) {
    const failedAttempts = Number(user.failed_login_attempts || 0) + 1;
    const lockedUntil = failedAttempts >= 5
      ? new Date(Date.now() + 15 * 60 * 1000)
      : user.locked_until || null;

    await pool.execute<ResultSetHeader>(
      `UPDATE users
       SET failed_login_attempts = ?,
           locked_until = ?,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [failedAttempts, lockedUntil, user.id]
    );

    throw new AppError(401, "invalid_credentials", "Invalid email/username or password.");
  }

  await regenerateSession(request);
  request.session.userId = Number(user.id);
  ensureCsrfToken(request);

  const [primaryAssignmentRows] = await pool.execute<RowDataPacket[]>(
    `SELECT id
     FROM assignments
     WHERE person_id = ?
       AND status = 'active'
       AND deleted_at IS NULL
     ORDER BY is_primary DESC, id ASC
     LIMIT 1`,
    [user.person_id]
  );
  const primaryAssignment = primaryAssignmentRows[0];

  if (primaryAssignment) {
    request.session.activeAssignmentId = Number(primaryAssignment.id);
  }

  await pool.execute<ResultSetHeader>(
    `UPDATE users
     SET failed_login_attempts = 0,
         locked_until = NULL,
         last_login_at = CURRENT_TIMESTAMP,
         updated_at = CURRENT_TIMESTAMP
     WHERE id = ?`,
    [user.id]
  );

  await writeAuditLog(request, {
    action: "auth.login",
    entityType: "user",
    entityId: user.id
  });

  ok(response, {
    ...await getUserPayload(Number(user.id), request.session.activeAssignmentId),
    csrfToken: request.session.csrfToken
  });
}));

authRouter.post("/logout", asyncHandler(async (request, response) => {
  if (request.session.userId) {
    await writeAuditLog(request, {
      action: "auth.logout",
      entityType: "user",
      entityId: request.session.userId
    });
  }

  await destroySession(request);
  ok(response, { loggedOut: true });
}));

authRouter.get("/me", requireAuth, asyncHandler(async (request, response) => {
  const csrfToken = ensureCsrfToken(request);
  ok(response, {
    ...await getUserPayload(request.session.userId!, request.session.activeAssignmentId),
    csrfToken
  });
}));

authRouter.post("/change-password", requireAuth, asyncHandler(async (request, response) => {
  const input = changePasswordSchema.parse(request.body);
  const userId = request.session.userId!;
  const [rows] = await pool.execute<RowDataPacket[]>(
    "SELECT id, password_hash FROM users WHERE id = ? AND deleted_at IS NULL LIMIT 1",
    [userId]
  );
  const user = rows[0];
  if (!user) {
    throw new AppError(401, "unauthorized", "Authentication is required.");
  }

  const currentOk = await argon2.verify(user.password_hash, input.current_password);
  if (!currentOk) {
    throw new AppError(401, "invalid_current_password", "Current password is not correct.");
  }

  const passwordHash = await argon2.hash(input.new_password, { type: argon2.argon2id });
  await pool.execute<ResultSetHeader>(
    `UPDATE users
     SET password_hash = ?,
         must_change_password = FALSE,
         failed_login_attempts = 0,
         locked_until = NULL,
         updated_at = CURRENT_TIMESTAMP
     WHERE id = ?`,
    [passwordHash, userId]
  );
  await writeAuditLog(request, { action: "auth.change_password", entityType: "user", entityId: userId });
  const csrfToken = ensureCsrfToken(request);
  ok(response, {
    ...await getUserPayload(userId, request.session.activeAssignmentId),
    csrfToken
  });
}));

authRouter.post("/active-assignment", requireAuth, asyncHandler(async (request, response) => {
  const input = activeAssignmentSchema.parse(request.body);
  const authUser = response.locals.authUser!;
  const [rows] = await pool.execute<RowDataPacket[]>(
    `SELECT id
     FROM assignments
     WHERE id = ?
       AND person_id = ?
       AND status = 'active'
       AND deleted_at IS NULL
     LIMIT 1`,
    [input.assignmentId, authUser.personId]
  );

  if (!rows[0]) {
    throw new AppError(403, "invalid_assignment", "Selected assignment is not available for this user.");
  }

  request.session.activeAssignmentId = input.assignmentId;
  const csrfToken = ensureCsrfToken(request);
  ok(response, {
    ...await getUserPayload(authUser.id, request.session.activeAssignmentId),
    csrfToken
  });
}));
