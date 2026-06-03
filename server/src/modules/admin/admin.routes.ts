import argon2 from "argon2";
import { Router } from "express";
import type { Pool, PoolConnection, ResultSetHeader, RowDataPacket } from "mysql2/promise";
import { z } from "zod";
import { pool } from "../../db/mysql";
import { requireAnyRole, requireAuth } from "../../middleware/auth";
import { asyncHandler } from "../../shared/async-handler";
import { writeAuditLog } from "../../shared/audit";
import { AppError } from "../../shared/errors";
import { created, ok } from "../../shared/http";
import { uuid } from "../../shared/ids";
import { refreshSearchIndexForEntitySafe } from "../search/global-search.service";

export const adminRouter = Router();

adminRouter.use(requireAuth, requireAnyRole(["system_admin", "admin_staff"]));

const statusSchema = z.string().trim().min(1).default("active");

const optionalString = z.string().trim().min(1).optional();
const optionalNullableString = z.string().trim().min(1).nullable().optional();
const roleSeparator = "|||";

function clean<T extends Record<string, unknown>>(value: T): Record<string, unknown> {
  return Object.fromEntries(Object.entries(value).filter(([, item]) => item !== undefined));
}

const adminTables = new Set([
  "assignments",
  "confidentiality_levels",
  "document_types",
  "organizations",
  "persons",
  "positions",
  "priority_levels",
  "roles",
  "unit_types",
  "units",
  "users"
]);

function tableName(table: string) {
  if (!adminTables.has(table)) {
    throw new Error(`Table is not allowlisted: ${table}`);
  }
  return `\`${table}\``;
}

function columnName(column: string) {
  if (!/^[a-zA-Z0-9_]+$/.test(column)) {
    throw new Error(`Unsafe column: ${column}`);
  }
  return `\`${column}\``;
}

async function fetchById(table: string, id: number) {
  const [rows] = await pool.execute<RowDataPacket[]>(
    `SELECT * FROM ${tableName(table)} WHERE id = ? LIMIT 1`,
    [id]
  );
  return rows[0] || null;
}

async function fetchUserAdminRow(executor: Pool | PoolConnection, id: number) {
  const [rows] = await executor.execute<RowDataPacket[]>(
    `SELECT
      users.id,
      users.uuid,
      users.person_id AS personId,
      persons.display_name AS personDisplayName,
      users.email,
      users.username,
      users.status,
      users.must_change_password AS mustChangePassword,
      users.last_login_at AS lastLoginAt,
      users.created_at AS createdAt,
      GROUP_CONCAT(roles.name ORDER BY roles.name SEPARATOR '|||') AS roleNames,
      GROUP_CONCAT(roles.display_name ORDER BY roles.name SEPARATOR '|||') AS roleDisplayNames
    FROM users
    INNER JOIN persons ON users.person_id = persons.id
    LEFT JOIN user_roles ON users.id = user_roles.user_id
    LEFT JOIN roles ON user_roles.role_id = roles.id
    WHERE users.id = ? AND users.deleted_at IS NULL
    GROUP BY users.id, users.uuid, users.person_id, persons.display_name, users.email,
      users.username, users.status, users.must_change_password, users.last_login_at, users.created_at
    LIMIT 1`,
    [id]
  );
  const row = rows[0];
  if (!row) {
    return null;
  }

  return {
    ...row,
    mustChangePassword: Boolean(row.mustChangePassword),
    roleDisplayNames: row.roleDisplayNames ? String(row.roleDisplayNames).split(roleSeparator) : [],
    roleNames: row.roleNames ? String(row.roleNames).split(roleSeparator) : []
  };
}

async function fetchPositionAdminRow(executor: Pool | PoolConnection, id: number) {
  const [rows] = await executor.execute<RowDataPacket[]>(
    `SELECT
      positions.*,
      units.code AS unitCode,
      units.name AS unitName,
      units.organization_id AS organizationId,
      organizations.name AS organizationName
    FROM positions
    INNER JOIN units ON positions.unit_id = units.id
    INNER JOIN organizations ON units.organization_id = organizations.id
    WHERE positions.id = ?
      AND positions.deleted_at IS NULL
    LIMIT 1`,
    [id]
  );

  return rows[0] || null;
}

async function fetchAssignmentAdminRow(executor: Pool | PoolConnection, id: number) {
  const [rows] = await executor.execute<RowDataPacket[]>(
    `SELECT
      assignments.*,
      positions.unit_id AS unit_id,
      positions.unit_id AS unitId,
      persons.display_name AS personDisplayName,
      units.name AS unitName,
      units.code AS unitCode,
      positions.title AS positionTitle,
      positions.code AS positionCode
    FROM assignments
    INNER JOIN persons ON assignments.person_id = persons.id
    INNER JOIN positions ON assignments.position_id = positions.id
    INNER JOIN units ON positions.unit_id = units.id
    WHERE assignments.id = ?
      AND assignments.deleted_at IS NULL
    LIMIT 1`,
    [id]
  );

  return rows[0] || null;
}

async function resolveRoles(connection: PoolConnection, roleNames: string[]) {
  const uniqueRoleNames = Array.from(new Set(roleNames.map((role) => role.trim()).filter(Boolean)));
  if (!uniqueRoleNames.length) {
    return [] as RowDataPacket[];
  }

  const rolePlaceholders = uniqueRoleNames.map(() => "?").join(", ");
  const [roles] = await connection.execute<RowDataPacket[]>(
    `SELECT id, name FROM roles WHERE name IN (${rolePlaceholders})`,
    uniqueRoleNames
  );
  if (roles.length !== uniqueRoleNames.length) {
    throw new AppError(422, "invalid_roles", "One or more selected roles do not exist.");
  }

  return roles;
}

function listRoute(table: string, orderColumn = "id") {
  return asyncHandler(async (_request, response) => {
    const [rows] = await pool.execute<RowDataPacket[]>(
      `SELECT * FROM ${tableName(table)} ORDER BY ${columnName(orderColumn)} DESC LIMIT 250`
    );
    ok(response, rows);
  });
}

function updateParts(input: Record<string, unknown>, columns: string[]) {
  const set: string[] = [];
  const values: any[] = [];
  for (const column of columns) {
    if (input[column] !== undefined) {
      set.push(`${columnName(column)} = ?`);
      values.push(input[column]);
    }
  }
  return { set, values };
}

function requirePatch(input: Record<string, unknown>) {
  if (Object.keys(input).length === 0) {
    throw new AppError(422, "empty_patch", "At least one field is required.");
  }
}

async function validateUnitHierarchy(input: { organization_id?: number; unit_type_id?: number; parent_unit_id?: number | null }, unitId?: number) {
  if (input.unit_type_id) {
    const [unitTypeRows] = await pool.execute<RowDataPacket[]>(
      "SELECT id FROM unit_types WHERE id = ? AND status = 'active' LIMIT 1",
      [input.unit_type_id]
    );
    const unitType = unitTypeRows[0];

    if (!unitType) {
      throw new AppError(422, "invalid_unit_type", "Selected unit type does not exist or is inactive.");
    }
  }

  if (!input.parent_unit_id) {
    return;
  }

  if (unitId && input.parent_unit_id === unitId) {
    throw new AppError(422, "invalid_parent_unit", "A unit cannot be its own parent.");
  }

  const [parentRows] = await pool.execute<RowDataPacket[]>(
    `SELECT
      units.id,
      units.organization_id AS organizationId,
      unit_types.allows_children AS allowsChildren
    FROM units
    INNER JOIN unit_types ON units.unit_type_id = unit_types.id
    WHERE units.id = ?
      AND units.status = 'active'
      AND units.deleted_at IS NULL
    LIMIT 1`,
    [input.parent_unit_id]
  );
  const parent = parentRows[0];

  if (!parent) {
    throw new AppError(422, "invalid_parent_unit", "Parent unit does not exist or is inactive.");
  }

  if (!parent.allowsChildren) {
    throw new AppError(422, "parent_disallows_children", "Selected parent unit type does not allow child units.");
  }

  if (input.organization_id && Number(parent.organizationId) !== input.organization_id) {
    throw new AppError(422, "organization_mismatch", "Parent unit must belong to the same organization.");
  }
}

async function validatePositionUnit(executor: Pool | PoolConnection, unitId: number) {
  const [unitRows] = await executor.execute<RowDataPacket[]>(
    `SELECT id
     FROM units
     WHERE id = ?
       AND status = 'active'
       AND deleted_at IS NULL
     LIMIT 1`,
    [unitId]
  );

  if (!unitRows[0]) {
    throw new AppError(422, "invalid_unit", "Selected unit does not exist or is inactive.");
  }
}

async function validateAssignmentPerson(executor: Pool | PoolConnection, personId: number) {
  const [personRows] = await executor.execute<RowDataPacket[]>(
    `SELECT id
     FROM persons
     WHERE id = ?
       AND status = 'active'
       AND deleted_at IS NULL
     LIMIT 1`,
    [personId]
  );

  if (!personRows[0]) {
    throw new AppError(422, "invalid_person", "Selected person does not exist or is inactive.");
  }
}

async function activePositionContext(executor: Pool | PoolConnection, positionId: number) {
  const [positionRows] = await executor.execute<RowDataPacket[]>(
    `SELECT
      positions.id,
      positions.unit_id AS unitId,
      positions.allows_multiple_active_assignments AS allowsMultipleActiveAssignments
     FROM positions
     INNER JOIN units ON positions.unit_id = units.id
     WHERE positions.id = ?
       AND positions.status = 'active'
       AND positions.deleted_at IS NULL
       AND units.status = 'active'
       AND units.deleted_at IS NULL
     LIMIT 1`,
    [positionId]
  );
  const position = positionRows[0];

  if (!position) {
    throw new AppError(422, "invalid_position", "Selected position does not exist, is inactive, or belongs to an inactive unit.");
  }

  return {
    allowsMultipleActiveAssignments: Boolean(position.allowsMultipleActiveAssignments),
    id: Number(position.id),
    unitId: Number(position.unitId)
  };
}

function assignmentStatusCanHoldActivePosition(status: string, endsAt: Date | string | null | undefined) {
  if (status !== "active") {
    return false;
  }
  if (!endsAt) {
    return true;
  }
  return new Date(endsAt) > new Date();
}

async function validateAssignmentTarget(executor: Pool | PoolConnection, input: {
  assignmentId?: number;
  endsAt?: Date | string | null;
  personId: number;
  positionId: number;
  status: string;
}) {
  await validateAssignmentPerson(executor, input.personId);
  const position = await activePositionContext(executor, input.positionId);

  if (position.allowsMultipleActiveAssignments || !assignmentStatusCanHoldActivePosition(input.status, input.endsAt)) {
    return position;
  }

  const where = [
    "position_id = ?",
    "status = 'active'",
    "deleted_at IS NULL",
    "(ends_at IS NULL OR ends_at > CURRENT_TIMESTAMP)"
  ];
  const params: any[] = [input.positionId];
  if (input.assignmentId) {
    where.push("id <> ?");
    params.push(input.assignmentId);
  }

  const [holderRows] = await executor.execute<RowDataPacket[]>(
    `SELECT id
     FROM assignments
     WHERE ${where.join(" AND ")}
     LIMIT 1`,
    params
  );

  if (holderRows[0]) {
    throw new AppError(409, "position_active_holder_exists", "Selected position already has an active assignment.");
  }

  return position;
}

const auditLogQuerySchema = z.object({
  action: z.string().trim().min(1).max(120).optional(),
  actor_user_id: z.coerce.number().int().positive().optional(),
  date_from: z.string().trim().min(1).max(40).optional(),
  date_to: z.string().trim().min(1).max(40).optional(),
  entity_type: z.string().trim().min(1).max(120).optional(),
  limit: z.coerce.number().int().min(1).max(500).default(250),
  q: z.string().trim().min(1).max(160).optional()
});

adminRouter.get("/audit-logs", asyncHandler(async (request, response) => {
  const input = auditLogQuerySchema.parse(request.query);
  const where: string[] = [];
  const params: any[] = [];

  if (input.action) {
    where.push("audit_logs.action = ?");
    params.push(input.action);
  }

  if (input.entity_type) {
    where.push("audit_logs.entity_type = ?");
    params.push(input.entity_type);
  }

  if (input.actor_user_id) {
    where.push("audit_logs.actor_user_id = ?");
    params.push(input.actor_user_id);
  }

  if (input.date_from) {
    where.push("audit_logs.created_at >= ?");
    params.push(input.date_from);
  }

  if (input.date_to) {
    where.push("audit_logs.created_at <= ?");
    params.push(input.date_to);
  }

  if (input.q) {
    const search = `%${input.q}%`;
    where.push(`(
      audit_logs.action LIKE ?
      OR audit_logs.entity_type LIKE ?
      OR audit_logs.entity_id LIKE ?
      OR audit_logs.ip_address LIKE ?
      OR users.username LIKE ?
      OR persons.display_name LIKE ?
      OR CAST(audit_logs.metadata AS CHAR) LIKE ?
    )`);
    params.push(search, search, search, search, search, search, search);
  }

  const whereClause = where.length ? `WHERE ${where.join(" AND ")}` : "";
  const [rows] = await pool.execute<RowDataPacket[]>(
    `SELECT
      audit_logs.id,
      audit_logs.actor_user_id AS actorUserId,
      audit_logs.actor_assignment_id AS actorAssignmentId,
      audit_logs.action,
      audit_logs.entity_type AS entityType,
      audit_logs.entity_id AS entityId,
      audit_logs.ip_address AS ipAddress,
      audit_logs.user_agent AS userAgent,
      audit_logs.metadata,
      audit_logs.created_at AS createdAt,
      users.username AS actorUsername,
      persons.display_name AS actorDisplayName,
      positions.title AS actorPositionTitle,
      units.name AS actorUnitName
     FROM audit_logs
     LEFT JOIN users ON audit_logs.actor_user_id = users.id
     LEFT JOIN persons ON users.person_id = persons.id
     LEFT JOIN assignments ON audit_logs.actor_assignment_id = assignments.id
     LEFT JOIN positions ON assignments.position_id = positions.id
     LEFT JOIN units ON positions.unit_id = units.id
     ${whereClause}
     ORDER BY audit_logs.created_at DESC, audit_logs.id DESC
     LIMIT ?`,
    [...params, input.limit]
  );

  ok(response, rows);
}));

const createPersonSchema = z.object({
  employee_code: optionalNullableString,
  first_name: z.string().trim().min(1),
  last_name: optionalNullableString,
  display_name: optionalNullableString,
  father_name: optionalNullableString,
  email: z.string().trim().email().nullable().optional(),
  phone: optionalNullableString,
  status: statusSchema
});

const updatePersonSchema = z.object({
  employee_code: optionalNullableString,
  first_name: z.string().trim().min(1).optional(),
  last_name: optionalNullableString,
  display_name: optionalNullableString,
  father_name: optionalNullableString,
  email: z.string().trim().email().nullable().optional(),
  phone: optionalNullableString,
  status: z.string().trim().min(1).optional()
});

adminRouter.get("/persons", listRoute("persons"));
adminRouter.post("/persons", asyncHandler(async (request, response) => {
  const input = createPersonSchema.parse(request.body);
  const displayName = input.display_name || [input.first_name, input.last_name].filter(Boolean).join(" ");

  const [result] = await pool.execute<ResultSetHeader>(
    `INSERT INTO persons (
      uuid, employee_code, first_name, last_name, display_name,
      father_name, email, phone, status
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      uuid(),
      input.employee_code || null,
      input.first_name,
      input.last_name || null,
      displayName,
      input.father_name || null,
      input.email || null,
      input.phone || null,
      input.status
    ]
  );
  const id = result.insertId;

  await writeAuditLog(request, { action: "admin.person.create", entityType: "person", entityId: id });
  created(response, await fetchById("persons", Number(id)));
}));

adminRouter.patch("/persons/:personId", asyncHandler(async (request, response) => {
  const { personId } = z.object({ personId: z.coerce.number().int().positive() }).parse(request.params);
  const input = updatePersonSchema.parse(request.body);
  requirePatch(input);

  const [currentRows] = await pool.execute<RowDataPacket[]>(
    "SELECT * FROM persons WHERE id = ? AND deleted_at IS NULL LIMIT 1",
    [personId]
  );
  const current = currentRows[0];
  if (!current) {
    throw new AppError(404, "not_found", "Person was not found.");
  }

  const firstName = input.first_name ?? current.first_name;
  const lastName = input.last_name !== undefined ? input.last_name : current.last_name;
  const displayName = input.display_name || [firstName, lastName].filter(Boolean).join(" ");
  const patch = clean({
    employee_code: input.employee_code,
    first_name: input.first_name,
    last_name: input.last_name,
    display_name: input.display_name !== undefined || input.first_name !== undefined || input.last_name !== undefined ? displayName : undefined,
    father_name: input.father_name,
    email: input.email,
    phone: input.phone,
    status: input.status
  });
  const { set, values } = updateParts(patch, ["employee_code", "first_name", "last_name", "display_name", "father_name", "email", "phone", "status"]);
  const [result] = await pool.execute<ResultSetHeader>(
    `UPDATE persons
     SET ${set.join(", ")}, updated_at = CURRENT_TIMESTAMP
     WHERE id = ? AND deleted_at IS NULL`,
    [...values, personId]
  );

  if (!result.affectedRows) {
    throw new AppError(404, "not_found", "Person was not found.");
  }

  await writeAuditLog(request, { action: "admin.person.update", entityType: "person", entityId: personId });
  ok(response, await fetchById("persons", personId));
}));

const createUserSchema = z.object({
  person_id: z.coerce.number().int().positive(),
  email: z.string().trim().email(),
  username: z.string().trim().min(3).max(80),
  password: z.string().min(8),
  status: z.string().trim().min(1).default("pending_activation"),
  must_change_password: z.boolean().default(true),
  role_names: z.array(z.string().trim().min(1)).default([])
});

const updateUserSchema = z.object({
  email: z.string().trim().email().optional(),
  username: z.string().trim().min(3).max(80).optional(),
  password: z.string().min(8).optional(),
  status: z.string().trim().min(1).optional(),
  must_change_password: z.boolean().optional(),
  role_names: z.array(z.string().trim().min(1)).optional()
});

const resetUserPasswordSchema = z.object({
  password: z.string().min(8)
});

adminRouter.get("/users", asyncHandler(async (_request, response) => {
  const [users] = await pool.execute<RowDataPacket[]>(
    `SELECT
      users.id,
      users.uuid,
      users.person_id AS personId,
      persons.display_name AS personDisplayName,
      users.email,
      users.username,
      users.status,
      users.must_change_password AS mustChangePassword,
      users.last_login_at AS lastLoginAt,
      users.created_at AS createdAt,
      GROUP_CONCAT(roles.name ORDER BY roles.name SEPARATOR '|||') AS roleNames,
      GROUP_CONCAT(roles.display_name ORDER BY roles.name SEPARATOR '|||') AS roleDisplayNames
    FROM users
    INNER JOIN persons ON users.person_id = persons.id
    LEFT JOIN user_roles ON users.id = user_roles.user_id
    LEFT JOIN roles ON user_roles.role_id = roles.id
    WHERE users.deleted_at IS NULL
    GROUP BY users.id, users.uuid, users.person_id, persons.display_name, users.email,
      users.username, users.status, users.must_change_password, users.last_login_at, users.created_at
    ORDER BY users.id DESC
    LIMIT 250`
  );

  ok(response, users.map((user) => ({
    ...user,
    mustChangePassword: Boolean(user.mustChangePassword),
    roleDisplayNames: user.roleDisplayNames ? String(user.roleDisplayNames).split(roleSeparator) : [],
    roleNames: user.roleNames ? String(user.roleNames).split(roleSeparator) : []
  })));
}));

adminRouter.post("/users", asyncHandler(async (request, response) => {
  const input = createUserSchema.parse(request.body);

  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const [personRows] = await connection.execute<RowDataPacket[]>(
      "SELECT id FROM persons WHERE id = ? AND deleted_at IS NULL LIMIT 1",
      [input.person_id]
    );
    const person = personRows[0];
    if (!person) {
      throw new AppError(422, "invalid_person", "Selected person does not exist.");
    }

    const roles = await resolveRoles(connection, input.role_names);
    const passwordHash = await argon2.hash(input.password, { type: argon2.argon2id });
    const [userResult] = await connection.execute<ResultSetHeader>(
      `INSERT INTO users (
        uuid, person_id, email, username, password_hash, status, must_change_password
      ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [uuid(), input.person_id, input.email, input.username, passwordHash, input.status, input.must_change_password]
    );
    const id = userResult.insertId;

    for (const role of roles) {
      await connection.execute<ResultSetHeader>(
        "INSERT INTO user_roles (user_id, role_id, assigned_by_user_id) VALUES (?, ?, ?)",
        [id, role.id, request.session.userId || null]
      );
    }

    await writeAuditLog(request, { action: "admin.user.create", entityType: "user", entityId: id }, connection);
    await connection.commit();
    await refreshSearchIndexForEntitySafe("user", id);
    created(response, await fetchUserAdminRow(pool, id));
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}));

adminRouter.patch("/users/:userId", asyncHandler(async (request, response) => {
  const { userId } = z.object({ userId: z.coerce.number().int().positive() }).parse(request.params);
  const input = updateUserSchema.parse(request.body);
  requirePatch(input);

  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const [currentRows] = await connection.execute<RowDataPacket[]>(
      "SELECT * FROM users WHERE id = ? AND deleted_at IS NULL LIMIT 1",
      [userId]
    );
    const current = currentRows[0];
    if (!current) {
      throw new AppError(404, "not_found", "User was not found.");
    }

    const patch = clean({
      email: input.email,
      username: input.username,
      status: input.status,
      must_change_password: input.must_change_password,
      password_hash: input.password ? await argon2.hash(input.password, { type: argon2.argon2id }) : undefined
    });
    const { set, values } = updateParts(patch, ["email", "username", "status", "must_change_password", "password_hash"]);
    if (set.length) {
      await connection.execute<ResultSetHeader>(
        `UPDATE users
         SET ${set.join(", ")}, updated_at = CURRENT_TIMESTAMP
         WHERE id = ? AND deleted_at IS NULL`,
        [...values, userId]
      );
    }

    if (input.role_names !== undefined) {
      const roles = await resolveRoles(connection, input.role_names);
      await connection.execute<ResultSetHeader>("DELETE FROM user_roles WHERE user_id = ?", [userId]);
      for (const role of roles) {
        await connection.execute<ResultSetHeader>(
          "INSERT INTO user_roles (user_id, role_id, assigned_by_user_id) VALUES (?, ?, ?)",
          [userId, role.id, request.session.userId || null]
        );
      }
    }

    await writeAuditLog(request, {
      action: "admin.user.update",
      entityType: "user",
      entityId: userId,
      metadata: {
        changedFields: Object.keys(input).filter((key) => key !== "password"),
        passwordChanged: Boolean(input.password)
      }
    }, connection);
    await connection.commit();
    await refreshSearchIndexForEntitySafe("user", userId);
    ok(response, await fetchUserAdminRow(pool, userId));
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}));

adminRouter.post("/users/:userId/reset-password", asyncHandler(async (request, response) => {
  const { userId } = z.object({ userId: z.coerce.number().int().positive() }).parse(request.params);
  const input = resetUserPasswordSchema.parse(request.body);
  const passwordHash = await argon2.hash(input.password, { type: argon2.argon2id });
  const [result] = await pool.execute<ResultSetHeader>(
    `UPDATE users
     SET password_hash = ?,
         must_change_password = TRUE,
         failed_login_attempts = 0,
         locked_until = NULL,
         updated_at = CURRENT_TIMESTAMP
     WHERE id = ? AND deleted_at IS NULL`,
    [passwordHash, userId]
  );

  if (!result.affectedRows) {
    throw new AppError(404, "not_found", "User was not found.");
  }

  await writeAuditLog(request, { action: "admin.user.reset_password", entityType: "user", entityId: userId });
  ok(response, await fetchUserAdminRow(pool, userId));
}));

adminRouter.delete("/users/:userId", asyncHandler(async (request, response) => {
  const { userId } = z.object({ userId: z.coerce.number().int().positive() }).parse(request.params);
  const [result] = await pool.execute<ResultSetHeader>(
    `UPDATE users
     SET status = 'disabled',
         deleted_at = CURRENT_TIMESTAMP,
         updated_at = CURRENT_TIMESTAMP
     WHERE id = ? AND deleted_at IS NULL`,
    [userId]
  );

  if (!result.affectedRows) {
    throw new AppError(404, "not_found", "User was not found.");
  }

  await writeAuditLog(request, { action: "admin.user.delete", entityType: "user", entityId: userId });
  await refreshSearchIndexForEntitySafe("user", userId);
  ok(response, { id: userId, deleted: true });
}));

adminRouter.get("/roles", listRoute("roles", "name"));

const createOrganizationSchema = z.object({
  code: z.string().trim().min(1).max(64),
  name: z.string().trim().min(1).max(180),
  name_local: optionalNullableString,
  description: optionalNullableString,
  status: statusSchema
});

const updateOrganizationSchema = z.object({
  code: z.string().trim().min(1).max(64).optional(),
  name: z.string().trim().min(1).max(180).optional(),
  name_local: optionalNullableString,
  description: optionalNullableString,
  status: z.string().trim().min(1).optional()
});

adminRouter.get("/organizations", listRoute("organizations"));
adminRouter.post("/organizations", asyncHandler(async (request, response) => {
  const input = createOrganizationSchema.parse(request.body);
  const [result] = await pool.execute<ResultSetHeader>(
    `INSERT INTO organizations (uuid, code, name, name_local, description, status)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [uuid(), input.code, input.name, input.name_local || null, input.description || null, input.status]
  );
  const id = result.insertId;
  await writeAuditLog(request, { action: "admin.organization.create", entityType: "organization", entityId: id });
  await refreshSearchIndexForEntitySafe("organization", id);
  created(response, await fetchById("organizations", Number(id)));
}));

adminRouter.patch("/organizations/:organizationId", asyncHandler(async (request, response) => {
  const { organizationId } = z.object({ organizationId: z.coerce.number().int().positive() }).parse(request.params);
  const input = updateOrganizationSchema.parse(request.body);
  requirePatch(input);

  const { set, values } = updateParts(clean(input), ["code", "name", "name_local", "description", "status"]);
  const [result] = await pool.execute<ResultSetHeader>(
    `UPDATE organizations
     SET ${set.join(", ")}, updated_at = CURRENT_TIMESTAMP
     WHERE id = ? AND deleted_at IS NULL`,
    [...values, organizationId]
  );

  if (!result.affectedRows) {
    throw new AppError(404, "not_found", "Organization was not found.");
  }

  await writeAuditLog(request, { action: "admin.organization.update", entityType: "organization", entityId: organizationId });
  await refreshSearchIndexForEntitySafe("organization", organizationId);
  ok(response, await fetchById("organizations", organizationId));
}));

adminRouter.delete("/organizations/:organizationId", asyncHandler(async (request, response) => {
  const { organizationId } = z.object({ organizationId: z.coerce.number().int().positive() }).parse(request.params);
  const connection = await pool.getConnection();
  const changedUnitIds: number[] = [];
  const changedPositionIds: number[] = [];
  const changedAssignmentIds: number[] = [];

  try {
    await connection.beginTransaction();
    const [organizationRows] = await connection.execute<RowDataPacket[]>(
      "SELECT id FROM organizations WHERE id = ? AND deleted_at IS NULL LIMIT 1",
      [organizationId]
    );
    if (!organizationRows[0]) {
      throw new AppError(404, "not_found", "Organization was not found.");
    }

    const [unitRows] = await connection.execute<RowDataPacket[]>(
      "SELECT id FROM units WHERE organization_id = ? AND deleted_at IS NULL",
      [organizationId]
    );
    changedUnitIds.push(...unitRows.map((row) => Number(row.id)));

    if (changedUnitIds.length) {
      const unitPlaceholders = changedUnitIds.map(() => "?").join(", ");
      const [positionRows] = await connection.execute<RowDataPacket[]>(
        `SELECT id FROM positions WHERE unit_id IN (${unitPlaceholders}) AND deleted_at IS NULL`,
        changedUnitIds
      );
      changedPositionIds.push(...positionRows.map((row) => Number(row.id)));
    }

    if (changedPositionIds.length) {
      const positionPlaceholders = changedPositionIds.map(() => "?").join(", ");
      const [assignmentRows] = await connection.execute<RowDataPacket[]>(
        `SELECT id FROM assignments WHERE position_id IN (${positionPlaceholders}) AND deleted_at IS NULL`,
        changedPositionIds
      );
      changedAssignmentIds.push(...assignmentRows.map((row) => Number(row.id)));

      if (changedAssignmentIds.length) {
        const assignmentPlaceholders = changedAssignmentIds.map(() => "?").join(", ");
        await connection.execute<ResultSetHeader>(
          `UPDATE assignments
           SET status = 'disabled', deleted_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
           WHERE id IN (${assignmentPlaceholders})`,
          changedAssignmentIds
        );
      }

      await connection.execute<ResultSetHeader>(
        `UPDATE positions
         SET status = 'disabled', deleted_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
         WHERE id IN (${positionPlaceholders})`,
        changedPositionIds
      );
    }

    if (changedUnitIds.length) {
      const unitPlaceholders = changedUnitIds.map(() => "?").join(", ");
      await connection.execute<ResultSetHeader>(
        `UPDATE units
         SET status = 'disabled', deleted_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
         WHERE id IN (${unitPlaceholders})`,
        changedUnitIds
      );
    }

    await connection.execute<ResultSetHeader>(
      `UPDATE organizations
       SET status = 'disabled', deleted_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
       WHERE id = ? AND deleted_at IS NULL`,
      [organizationId]
    );

    await writeAuditLog(request, {
      action: "admin.organization.delete",
      entityType: "organization",
      entityId: organizationId,
      metadata: {
        assignmentIds: changedAssignmentIds,
        positionIds: changedPositionIds,
        unitIds: changedUnitIds
      }
    }, connection);
    await connection.commit();
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }

  await Promise.all([
    refreshSearchIndexForEntitySafe("organization", organizationId),
    ...changedUnitIds.map((id) => refreshSearchIndexForEntitySafe("unit", id)),
    ...changedPositionIds.map((id) => refreshSearchIndexForEntitySafe("position", id)),
    ...changedAssignmentIds.map((id) => refreshSearchIndexForEntitySafe("assignment", id))
  ]);
  ok(response, { id: organizationId, deleted: true });
}));

const createUnitTypeSchema = z.object({
  code: z.string().trim().min(1).max(80),
  name: z.string().trim().min(1).max(120),
  hierarchy_level: z.coerce.number().int().nonnegative().default(0),
  allows_children: z.boolean().default(true),
  status: statusSchema,
  description: optionalNullableString
});

const updateUnitTypeSchema = z.object({
  code: z.string().trim().min(1).max(80).optional(),
  name: z.string().trim().min(1).max(120).optional(),
  hierarchy_level: z.coerce.number().int().nonnegative().optional(),
  allows_children: z.boolean().optional(),
  status: z.string().trim().min(1).optional(),
  description: optionalNullableString
});

adminRouter.get("/unit-types", listRoute("unit_types", "hierarchy_level"));
adminRouter.post("/unit-types", asyncHandler(async (request, response) => {
  const input = createUnitTypeSchema.parse(request.body);
  const [result] = await pool.execute<ResultSetHeader>(
    `INSERT INTO unit_types (uuid, code, name, hierarchy_level, allows_children, status, description)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [uuid(), input.code, input.name, input.hierarchy_level, input.allows_children, input.status, input.description || null]
  );
  const id = result.insertId;
  await writeAuditLog(request, { action: "admin.unit_type.create", entityType: "unit_type", entityId: id });
  created(response, await fetchById("unit_types", Number(id)));
}));

adminRouter.patch("/unit-types/:unitTypeId", asyncHandler(async (request, response) => {
  const { unitTypeId } = z.object({ unitTypeId: z.coerce.number().int().positive() }).parse(request.params);
  const input = updateUnitTypeSchema.parse(request.body);
  requirePatch(input);

  const { set, values } = updateParts(clean(input), ["code", "name", "hierarchy_level", "allows_children", "status", "description"]);
  const [result] = await pool.execute<ResultSetHeader>(
    `UPDATE unit_types
     SET ${set.join(", ")}, updated_at = CURRENT_TIMESTAMP
     WHERE id = ?`,
    [...values, unitTypeId]
  );

  if (!result.affectedRows) {
    throw new AppError(404, "not_found", "Unit type was not found.");
  }

  await writeAuditLog(request, { action: "admin.unit_type.update", entityType: "unit_type", entityId: unitTypeId });
  ok(response, await fetchById("unit_types", unitTypeId));
}));

const createUnitSchema = z.object({
  organization_id: z.coerce.number().int().positive(),
  unit_type_id: z.coerce.number().int().positive(),
  parent_unit_id: z.coerce.number().int().positive().nullable().optional(),
  code: z.string().trim().min(1).max(80),
  name: z.string().trim().min(1).max(180),
  name_local: optionalNullableString,
  description: optionalNullableString,
  status: statusSchema
});

const updateUnitSchema = z.object({
  organization_id: z.coerce.number().int().positive().optional(),
  unit_type_id: z.coerce.number().int().positive().optional(),
  parent_unit_id: z.coerce.number().int().positive().nullable().optional(),
  code: z.string().trim().min(1).max(80).optional(),
  name: z.string().trim().min(1).max(180).optional(),
  name_local: optionalNullableString,
  description: optionalNullableString,
  status: z.string().trim().min(1).optional()
});

adminRouter.get("/units", asyncHandler(async (_request, response) => {
  const [rows] = await pool.execute<RowDataPacket[]>(
    `SELECT
      units.*,
      organizations.name AS organizationName,
      unit_types.code AS unitTypeCode,
      unit_types.name AS unitTypeName,
      parent_units.name AS parentUnitName
    FROM units
    INNER JOIN organizations ON units.organization_id = organizations.id
    INNER JOIN unit_types ON units.unit_type_id = unit_types.id
    LEFT JOIN units AS parent_units ON units.parent_unit_id = parent_units.id
    WHERE units.deleted_at IS NULL
    ORDER BY units.id DESC
    LIMIT 250`
  );

  ok(response, rows);
}));

adminRouter.post("/units", asyncHandler(async (request, response) => {
  const input = createUnitSchema.parse(request.body);
  await validateUnitHierarchy(input);
  const [result] = await pool.execute<ResultSetHeader>(
    `INSERT INTO units (
      uuid, organization_id, unit_type_id, parent_unit_id, code,
      name, name_local, description, status
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      uuid(),
      input.organization_id,
      input.unit_type_id,
      input.parent_unit_id || null,
      input.code,
      input.name,
      input.name_local || null,
      input.description || null,
      input.status
    ]
  );
  const id = result.insertId;
  await writeAuditLog(request, { action: "admin.unit.create", entityType: "unit", entityId: id });
  await refreshSearchIndexForEntitySafe("unit", id);
  created(response, await fetchById("units", Number(id)));
}));

adminRouter.patch("/units/:unitId", asyncHandler(async (request, response) => {
  const { unitId } = z.object({ unitId: z.coerce.number().int().positive() }).parse(request.params);
  const input = updateUnitSchema.parse(request.body);
  requirePatch(input);

  const [currentRows] = await pool.execute<RowDataPacket[]>(
    "SELECT * FROM units WHERE id = ? AND deleted_at IS NULL LIMIT 1",
    [unitId]
  );
  const current = currentRows[0];
  if (!current) {
    throw new AppError(404, "not_found", "Unit was not found.");
  }

  await validateUnitHierarchy({
    organization_id: input.organization_id || Number(current.organization_id),
    unit_type_id: input.unit_type_id || Number(current.unit_type_id),
    parent_unit_id: input.parent_unit_id === undefined ? current.parent_unit_id : input.parent_unit_id
  }, unitId);

  const { set, values } = updateParts(clean(input), [
    "organization_id",
    "unit_type_id",
    "parent_unit_id",
    "code",
    "name",
    "name_local",
    "description",
    "status"
  ]);
  await pool.execute<ResultSetHeader>(
    `UPDATE units
     SET ${set.join(", ")}, updated_at = CURRENT_TIMESTAMP
     WHERE id = ?`,
    [...values, unitId]
  );

  await writeAuditLog(request, { action: "admin.unit.update", entityType: "unit", entityId: unitId });
  await refreshSearchIndexForEntitySafe("unit", unitId);
  ok(response, await fetchById("units", unitId));
}));

adminRouter.delete("/units/:unitId", asyncHandler(async (request, response) => {
  const { unitId } = z.object({ unitId: z.coerce.number().int().positive() }).parse(request.params);
  const connection = await pool.getConnection();
  const changedUnitIds: number[] = [];
  const changedPositionIds: number[] = [];
  const changedAssignmentIds: number[] = [];

  try {
    await connection.beginTransaction();
    const [unitRows] = await connection.execute<RowDataPacket[]>(
      "SELECT id FROM units WHERE id = ? AND deleted_at IS NULL LIMIT 1",
      [unitId]
    );
    if (!unitRows[0]) {
      throw new AppError(404, "not_found", "Unit was not found.");
    }

    const [descendantRows] = await connection.query<RowDataPacket[]>(
      `WITH RECURSIVE unit_tree AS (
        SELECT id FROM units WHERE id = ? AND deleted_at IS NULL
        UNION ALL
        SELECT units.id
        FROM units
        INNER JOIN unit_tree ON units.parent_unit_id = unit_tree.id
        WHERE units.deleted_at IS NULL
      )
      SELECT id FROM unit_tree`,
      [unitId]
    );
    changedUnitIds.push(...descendantRows.map((row) => Number(row.id)));

    const unitPlaceholders = changedUnitIds.map(() => "?").join(", ");
    const [positionRows] = await connection.execute<RowDataPacket[]>(
      `SELECT id FROM positions WHERE unit_id IN (${unitPlaceholders}) AND deleted_at IS NULL`,
      changedUnitIds
    );
    changedPositionIds.push(...positionRows.map((row) => Number(row.id)));

    if (changedPositionIds.length) {
      const positionPlaceholders = changedPositionIds.map(() => "?").join(", ");
      const [assignmentRows] = await connection.execute<RowDataPacket[]>(
        `SELECT id FROM assignments WHERE position_id IN (${positionPlaceholders}) AND deleted_at IS NULL`,
        changedPositionIds
      );
      changedAssignmentIds.push(...assignmentRows.map((row) => Number(row.id)));

      if (changedAssignmentIds.length) {
        const assignmentPlaceholders = changedAssignmentIds.map(() => "?").join(", ");
        await connection.execute<ResultSetHeader>(
          `UPDATE assignments
           SET status = 'disabled', deleted_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
           WHERE id IN (${assignmentPlaceholders})`,
          changedAssignmentIds
        );
      }

      await connection.execute<ResultSetHeader>(
        `UPDATE positions
         SET status = 'disabled', deleted_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
         WHERE id IN (${positionPlaceholders})`,
        changedPositionIds
      );
    }

    await connection.execute<ResultSetHeader>(
      `UPDATE units
       SET status = 'disabled', deleted_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
       WHERE id IN (${unitPlaceholders})`,
      changedUnitIds
    );

    await writeAuditLog(request, {
      action: "admin.unit.delete",
      entityType: "unit",
      entityId: unitId,
      metadata: {
        assignmentIds: changedAssignmentIds,
        positionIds: changedPositionIds,
        unitIds: changedUnitIds
      }
    }, connection);
    await connection.commit();
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }

  await Promise.all([
    ...changedUnitIds.map((id) => refreshSearchIndexForEntitySafe("unit", id)),
    ...changedPositionIds.map((id) => refreshSearchIndexForEntitySafe("position", id)),
    ...changedAssignmentIds.map((id) => refreshSearchIndexForEntitySafe("assignment", id))
  ]);
  ok(response, { id: unitId, deleted: true });
}));

const createPositionSchema = z.object({
  unit_id: z.coerce.number().int().positive(),
  code: z.string().trim().min(1).max(80),
  title: z.string().trim().min(1).max(140),
  title_local: optionalNullableString,
  authority_level: z.coerce.number().int().nonnegative().default(0),
  is_signing_authority: z.boolean().default(false),
  allows_multiple_active_assignments: z.boolean().default(false),
  description: optionalNullableString,
  status: statusSchema
});

const updatePositionSchema = z.object({
  unit_id: z.coerce.number().int().positive().optional(),
  code: z.string().trim().min(1).max(80).optional(),
  title: z.string().trim().min(1).max(140).optional(),
  title_local: optionalNullableString,
  authority_level: z.coerce.number().int().nonnegative().optional(),
  is_signing_authority: z.boolean().optional(),
  allows_multiple_active_assignments: z.boolean().optional(),
  description: optionalNullableString,
  status: z.string().trim().min(1).optional()
});

adminRouter.get("/positions", asyncHandler(async (_request, response) => {
  const [positions] = await pool.execute<RowDataPacket[]>(
    `SELECT
      positions.*,
      units.code AS unitCode,
      units.name AS unitName,
      units.organization_id AS organizationId,
      organizations.name AS organizationName
     FROM positions
     INNER JOIN units ON positions.unit_id = units.id
     INNER JOIN organizations ON units.organization_id = organizations.id
     WHERE positions.deleted_at IS NULL
     ORDER BY positions.id DESC
     LIMIT 250`
  );

  ok(response, positions);
}));
adminRouter.post("/positions", asyncHandler(async (request, response) => {
  const input = createPositionSchema.parse(request.body);
  await validatePositionUnit(pool, input.unit_id);
  const [result] = await pool.execute<ResultSetHeader>(
    `INSERT INTO positions (
      uuid, unit_id, code, title, title_local, authority_level,
      is_signing_authority, allows_multiple_active_assignments, description, status
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      uuid(),
      input.unit_id,
      input.code,
      input.title,
      input.title_local || null,
      input.authority_level,
      input.is_signing_authority,
      input.allows_multiple_active_assignments,
      input.description || null,
      input.status
    ]
  );
  const id = result.insertId;
  await writeAuditLog(request, { action: "admin.position.create", entityType: "position", entityId: id });
  await refreshSearchIndexForEntitySafe("position", id);
  created(response, await fetchPositionAdminRow(pool, Number(id)));
}));

adminRouter.patch("/positions/:positionId", asyncHandler(async (request, response) => {
  const { positionId } = z.object({ positionId: z.coerce.number().int().positive() }).parse(request.params);
  const input = updatePositionSchema.parse(request.body);
  requirePatch(input);
  if (input.unit_id) {
    await validatePositionUnit(pool, input.unit_id);
  }

  const { set, values } = updateParts(clean(input), [
    "unit_id",
    "code",
    "title",
    "title_local",
    "authority_level",
    "is_signing_authority",
    "allows_multiple_active_assignments",
    "description",
    "status"
  ]);
  const [result] = await pool.execute<ResultSetHeader>(
    `UPDATE positions
     SET ${set.join(", ")}, updated_at = CURRENT_TIMESTAMP
     WHERE id = ? AND deleted_at IS NULL`,
    [...values, positionId]
  );

  if (!result.affectedRows) {
    throw new AppError(404, "not_found", "Position was not found.");
  }

  await writeAuditLog(request, { action: "admin.position.update", entityType: "position", entityId: positionId });
  await refreshSearchIndexForEntitySafe("position", positionId);
  ok(response, await fetchPositionAdminRow(pool, positionId));
}));

adminRouter.delete("/positions/:positionId", asyncHandler(async (request, response) => {
  const { positionId } = z.object({ positionId: z.coerce.number().int().positive() }).parse(request.params);
  const [result] = await pool.execute<ResultSetHeader>(
    `UPDATE positions
     SET status = 'disabled',
         deleted_at = CURRENT_TIMESTAMP,
         updated_at = CURRENT_TIMESTAMP
     WHERE id = ? AND deleted_at IS NULL`,
    [positionId]
  );

  if (!result.affectedRows) {
    throw new AppError(404, "not_found", "Position was not found.");
  }

  await writeAuditLog(request, { action: "admin.position.delete", entityType: "position", entityId: positionId });
  await refreshSearchIndexForEntitySafe("position", positionId);
  ok(response, { id: positionId, deleted: true });
}));

const createAssignmentSchema = z.object({
  person_id: z.coerce.number().int().positive(),
  position_id: z.coerce.number().int().positive(),
  status: statusSchema,
  is_primary: z.boolean().default(false),
  starts_at: z.coerce.date().nullable().optional(),
  ends_at: z.coerce.date().nullable().optional()
});

const updateAssignmentSchema = z.object({
  person_id: z.coerce.number().int().positive().optional(),
  position_id: z.coerce.number().int().positive().optional(),
  status: z.string().trim().min(1).optional(),
  is_primary: z.boolean().optional(),
  starts_at: z.coerce.date().nullable().optional(),
  ends_at: z.coerce.date().nullable().optional(),
  reason: optionalNullableString
});

adminRouter.get("/assignments", asyncHandler(async (_request, response) => {
  const [rows] = await pool.execute<RowDataPacket[]>(
    `SELECT
      assignments.*,
      positions.unit_id AS unit_id,
      positions.unit_id AS unitId,
      persons.display_name AS personDisplayName,
      units.name AS unitName,
      units.code AS unitCode,
      positions.code AS positionCode,
      positions.title AS positionTitle
    FROM assignments
    INNER JOIN persons ON assignments.person_id = persons.id
    INNER JOIN positions ON assignments.position_id = positions.id
    INNER JOIN units ON positions.unit_id = units.id
    WHERE assignments.deleted_at IS NULL
    ORDER BY assignments.id DESC
    LIMIT 250`
  );

  ok(response, rows);
}));

adminRouter.post("/assignments", asyncHandler(async (request, response) => {
  const input = createAssignmentSchema.parse(request.body);

  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    await validateAssignmentTarget(connection, {
      endsAt: input.ends_at || null,
      personId: input.person_id,
      positionId: input.position_id,
      status: input.status
    });

    if (input.is_primary) {
      await connection.execute<ResultSetHeader>(
        `UPDATE assignments
         SET is_primary = FALSE, updated_at = CURRENT_TIMESTAMP
         WHERE person_id = ? AND is_primary = TRUE`,
        [input.person_id]
      );
    }

    const [assignmentResult] = await connection.execute<ResultSetHeader>(
      `INSERT INTO assignments (
        uuid, person_id, position_id, status, is_primary,
        starts_at, ends_at, created_by_user_id
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        uuid(),
        input.person_id,
        input.position_id,
        input.status,
        input.is_primary,
        input.starts_at || null,
        input.ends_at || null,
        request.session.userId || null
      ]
    );
    const id = assignmentResult.insertId;

    await connection.execute<ResultSetHeader>(
      `INSERT INTO assignment_status_history (
        assignment_id, from_status, to_status, reason, changed_by_user_id
      ) VALUES (?, ?, ?, ?, ?)`,
      [id, null, input.status, "Assignment created.", request.session.userId || null]
    );

    await writeAuditLog(request, { action: "admin.assignment.create", entityType: "assignment", entityId: id }, connection);
    await connection.commit();
    await refreshSearchIndexForEntitySafe("assignment", id);
    created(response, await fetchAssignmentAdminRow(pool, id));
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}));

adminRouter.patch("/assignments/:assignmentId", asyncHandler(async (request, response) => {
  const { assignmentId } = z.object({ assignmentId: z.coerce.number().int().positive() }).parse(request.params);
  const input = updateAssignmentSchema.parse(request.body);
  requirePatch(input);

  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const [currentRows] = await connection.execute<RowDataPacket[]>(
      "SELECT * FROM assignments WHERE id = ? AND deleted_at IS NULL LIMIT 1",
      [assignmentId]
    );
    const current = currentRows[0];

    if (!current) {
      throw new AppError(404, "not_found", "Assignment was not found.");
    }

    const nextPersonId = input.person_id || Number(current.person_id);
    const nextPositionId = input.position_id || Number(current.position_id);
    const nextStatus = input.status || String(current.status);
    const nextEndsAt = input.ends_at === undefined ? current.ends_at : input.ends_at;

    if (input.person_id || input.position_id || nextStatus === "active") {
      await validateAssignmentTarget(connection, {
        assignmentId,
        endsAt: nextEndsAt || null,
        personId: nextPersonId,
        positionId: nextPositionId,
        status: nextStatus
      });
    }

    if (input.is_primary) {
      await connection.execute<ResultSetHeader>(
        `UPDATE assignments
         SET is_primary = FALSE, updated_at = CURRENT_TIMESTAMP
         WHERE person_id = ? AND is_primary = TRUE AND id <> ?`,
        [nextPersonId, assignmentId]
      );
    }

    const fromStatus = String(current.status);
    const patch = clean({
      person_id: input.person_id,
      position_id: input.position_id,
      status: input.status,
      is_primary: input.is_primary,
      starts_at: input.starts_at,
      ends_at: input.ends_at,
    });
    const { set, values } = updateParts(patch, [
      "person_id",
      "position_id",
      "status",
      "is_primary",
      "starts_at",
      "ends_at"
    ]);

    await connection.execute<ResultSetHeader>(
      `UPDATE assignments
       SET ${set.length ? `${set.join(", ")}, ` : ""}updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [...values, assignmentId]
    );

    if (input.status && input.status !== fromStatus) {
      await connection.execute<ResultSetHeader>(
        `INSERT INTO assignment_status_history (
          assignment_id, from_status, to_status, reason, changed_by_user_id
        ) VALUES (?, ?, ?, ?, ?)`,
        [assignmentId, fromStatus, input.status, input.reason || "Assignment status updated.", request.session.userId || null]
      );
    }

    await writeAuditLog(request, { action: "admin.assignment.update", entityType: "assignment", entityId: assignmentId }, connection);
    await connection.commit();
    await refreshSearchIndexForEntitySafe("assignment", assignmentId);
    ok(response, await fetchAssignmentAdminRow(pool, assignmentId));
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}));

adminRouter.delete("/assignments/:assignmentId", asyncHandler(async (request, response) => {
  const { assignmentId } = z.object({ assignmentId: z.coerce.number().int().positive() }).parse(request.params);

  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const [currentRows] = await connection.execute<RowDataPacket[]>(
      "SELECT status FROM assignments WHERE id = ? AND deleted_at IS NULL LIMIT 1",
      [assignmentId]
    );
    const current = currentRows[0];

    if (!current) {
      throw new AppError(404, "not_found", "Assignment was not found.");
    }

    await connection.execute<ResultSetHeader>(
      `UPDATE assignments
       SET status = 'disabled',
           deleted_at = CURRENT_TIMESTAMP,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = ? AND deleted_at IS NULL`,
      [assignmentId]
    );

    await connection.execute<ResultSetHeader>(
      `INSERT INTO assignment_status_history (
        assignment_id, from_status, to_status, reason, changed_by_user_id
      ) VALUES (?, ?, ?, ?, ?)`,
      [assignmentId, String(current.status), "disabled", "Assignment soft-deleted.", request.session.userId || null]
    );

    await writeAuditLog(request, { action: "admin.assignment.delete", entityType: "assignment", entityId: assignmentId }, connection);
    await connection.commit();
    await refreshSearchIndexForEntitySafe("assignment", assignmentId);
    ok(response, { id: assignmentId, deleted: true });
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}));

const createDocumentTypeSchema = z.object({
  code: z.string().trim().min(1).max(80),
  name: z.string().trim().min(1).max(140),
  description: optionalNullableString,
  requires_serial: z.boolean().default(true),
  status: statusSchema
});

const updateDocumentTypeSchema = z.object({
  code: z.string().trim().min(1).max(80).optional(),
  name: z.string().trim().min(1).max(140).optional(),
  description: optionalNullableString,
  requires_serial: z.boolean().optional(),
  status: z.string().trim().min(1).optional()
});

const optionalRuleForeignKey = z.coerce.number().int().positive().nullable().optional();
const documentWriteModeSchema = z.enum(["locked", "free"]);

const createDocumentWriteRuleSchema = z.object({
  document_type_id: z.coerce.number().int().positive(),
  unit_type_id: optionalRuleForeignKey,
  position_id: optionalRuleForeignKey,
  role_id: optionalRuleForeignKey,
  mode: documentWriteModeSchema.default("locked"),
  status: statusSchema,
  notes: optionalNullableString
});

const updateDocumentWriteRuleSchema = z.object({
  document_type_id: z.coerce.number().int().positive().optional(),
  unit_type_id: optionalRuleForeignKey,
  position_id: optionalRuleForeignKey,
  role_id: optionalRuleForeignKey,
  mode: documentWriteModeSchema.optional(),
  status: z.string().trim().min(1).optional(),
  notes: optionalNullableString
});

async function listDocumentWriteRules() {
  const [rows] = await pool.execute<RowDataPacket[]>(
    `SELECT
      document_write_rules.id,
      document_write_rules.uuid,
      document_write_rules.document_type_id,
      document_types.code AS documentTypeCode,
      document_types.name AS documentTypeName,
      document_write_rules.unit_type_id,
      unit_types.code AS unitTypeCode,
      unit_types.name AS unitTypeName,
      document_write_rules.position_id,
      positions.code AS positionCode,
      positions.title AS positionTitle,
      document_write_rules.role_id,
      roles.name AS roleName,
      roles.display_name AS roleDisplayName,
      document_write_rules.mode,
      document_write_rules.status,
      document_write_rules.notes,
      document_write_rules.created_at,
      document_write_rules.updated_at
     FROM document_write_rules
     INNER JOIN document_types ON document_write_rules.document_type_id = document_types.id
     LEFT JOIN unit_types ON document_write_rules.unit_type_id = unit_types.id
     LEFT JOIN positions ON document_write_rules.position_id = positions.id
     LEFT JOIN roles ON document_write_rules.role_id = roles.id
     ORDER BY document_write_rules.status ASC, document_types.name ASC, document_write_rules.id DESC
     LIMIT 500`
  );
  return rows;
}

async function fetchDocumentWriteRuleById(id: number) {
  const rows = await listDocumentWriteRules();
  return rows.find((row) => Number(row.id) === id) || null;
}

adminRouter.get("/document-types", listRoute("document_types"));
adminRouter.post("/document-types", requireAnyRole(["system_admin"]), asyncHandler(async (request, response) => {
  const input = createDocumentTypeSchema.parse(request.body);
  const [result] = await pool.execute<ResultSetHeader>(
    `INSERT INTO document_types (uuid, code, name, description, requires_serial, status)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [uuid(), input.code, input.name, input.description || null, input.requires_serial, input.status]
  );
  const id = result.insertId;
  await writeAuditLog(request, { action: "admin.document_type.create", entityType: "document_type", entityId: id });
  await refreshSearchIndexForEntitySafe("document_type", id);
  created(response, await fetchById("document_types", Number(id)));
}));

adminRouter.patch("/document-types/:documentTypeId", requireAnyRole(["system_admin"]), asyncHandler(async (request, response) => {
  const { documentTypeId } = z.object({ documentTypeId: z.coerce.number().int().positive() }).parse(request.params);
  const input = updateDocumentTypeSchema.parse(request.body);
  requirePatch(input);

  const { set, values } = updateParts(clean(input), ["code", "name", "description", "requires_serial", "status"]);
  const [result] = await pool.execute<ResultSetHeader>(
    `UPDATE document_types
     SET ${set.join(", ")}, updated_at = CURRENT_TIMESTAMP
     WHERE id = ?`,
    [...values, documentTypeId]
  );

  if (!result.affectedRows) {
    throw new AppError(404, "not_found", "Document type was not found.");
  }

  await writeAuditLog(request, { action: "admin.document_type.update", entityType: "document_type", entityId: documentTypeId });
  await refreshSearchIndexForEntitySafe("document_type", documentTypeId);
  ok(response, await fetchById("document_types", documentTypeId));
}));

adminRouter.delete("/document-types/:documentTypeId", requireAnyRole(["system_admin"]), asyncHandler(async (request, response) => {
  const { documentTypeId } = z.object({ documentTypeId: z.coerce.number().int().positive() }).parse(request.params);

  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const [currentRows] = await connection.execute<RowDataPacket[]>(
      "SELECT id, status FROM document_types WHERE id = ? LIMIT 1",
      [documentTypeId]
    );
    const current = currentRows[0];
    if (!current) {
      throw new AppError(404, "not_found", "Document type was not found.");
    }

    await connection.execute<ResultSetHeader>(
      `UPDATE document_types
       SET status = 'archived',
           updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [documentTypeId]
    );
    await connection.execute<ResultSetHeader>(
      `UPDATE document_write_rules
       SET status = 'archived',
           updated_at = CURRENT_TIMESTAMP
       WHERE document_type_id = ? AND status <> 'archived'`,
      [documentTypeId]
    );
    await connection.execute<ResultSetHeader>(
      `UPDATE document_template_bindings
       SET status = 'inactive',
           updated_at = CURRENT_TIMESTAMP
       WHERE document_type_id = ? AND status = 'active'`,
      [documentTypeId]
    );

    await writeAuditLog(request, {
      action: "admin.document_type.archive",
      entityType: "document_type",
      entityId: documentTypeId,
      metadata: { fromStatus: String(current.status) }
    }, connection);
    await connection.commit();
    await refreshSearchIndexForEntitySafe("document_type", documentTypeId);
    ok(response, { id: documentTypeId, deleted: true, status: "archived" });
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}));

adminRouter.get("/document-write-rules", asyncHandler(async (_request, response) => {
  ok(response, await listDocumentWriteRules());
}));

adminRouter.post("/document-write-rules", asyncHandler(async (request, response) => {
  const input = createDocumentWriteRuleSchema.parse(request.body);
  const [result] = await pool.execute<ResultSetHeader>(
    `INSERT INTO document_write_rules (
      uuid, document_type_id, unit_type_id, position_id, role_id, mode, status, notes, created_by_user_id
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      uuid(),
      input.document_type_id,
      input.unit_type_id ?? null,
      input.position_id ?? null,
      input.role_id ?? null,
      input.mode,
      input.status,
      input.notes || null,
      request.session.userId || null
    ]
  );
  const id = Number(result.insertId);
  await writeAuditLog(request, { action: "admin.document_write_rule.create", entityType: "document_write_rule", entityId: id });
  created(response, await fetchDocumentWriteRuleById(id));
}));

adminRouter.patch("/document-write-rules/:ruleId", asyncHandler(async (request, response) => {
  const { ruleId } = z.object({ ruleId: z.coerce.number().int().positive() }).parse(request.params);
  const input = updateDocumentWriteRuleSchema.parse(request.body);
  requirePatch(input);

  const { set, values } = updateParts(clean(input), [
    "document_type_id",
    "unit_type_id",
    "position_id",
    "role_id",
    "mode",
    "status",
    "notes"
  ]);
  const [result] = await pool.execute<ResultSetHeader>(
    `UPDATE document_write_rules
     SET ${set.join(", ")}, updated_at = CURRENT_TIMESTAMP
     WHERE id = ?`,
    [...values, ruleId]
  );

  if (!result.affectedRows) {
    throw new AppError(404, "not_found", "Document write rule was not found.");
  }

  await writeAuditLog(request, { action: "admin.document_write_rule.update", entityType: "document_write_rule", entityId: ruleId });
  ok(response, await fetchDocumentWriteRuleById(ruleId));
}));

const createConfidentialityLevelSchema = z.object({
  code: z.string().trim().min(1).max(80),
  name: z.string().trim().min(1).max(140),
  rank: z.coerce.number().int().nonnegative().default(0),
  is_default: z.boolean().default(false),
  requires_access_log: z.boolean().default(false),
  description: optionalNullableString,
  status: statusSchema
});

const updateConfidentialityLevelSchema = z.object({
  code: z.string().trim().min(1).max(80).optional(),
  name: z.string().trim().min(1).max(140).optional(),
  rank: z.coerce.number().int().nonnegative().optional(),
  is_default: z.boolean().optional(),
  requires_access_log: z.boolean().optional(),
  description: optionalNullableString,
  status: z.string().trim().min(1).optional()
});

adminRouter.get("/confidentiality-levels", listRoute("confidentiality_levels", "rank"));
adminRouter.post("/confidentiality-levels", asyncHandler(async (request, response) => {
  const input = createConfidentialityLevelSchema.parse(request.body);
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    if (input.is_default) {
      await connection.execute<ResultSetHeader>(
        "UPDATE confidentiality_levels SET is_default = FALSE, updated_at = CURRENT_TIMESTAMP WHERE is_default = TRUE"
      );
    }

    const [result] = await connection.execute<ResultSetHeader>(
      `INSERT INTO confidentiality_levels (
        uuid, code, name, \`rank\`, is_default, requires_access_log,
        description, status
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        uuid(),
        input.code,
        input.name,
        input.rank,
        input.is_default,
        input.requires_access_log,
        input.description || null,
        input.status
      ]
    );
    const id = result.insertId;
    await writeAuditLog(request, {
      action: "admin.confidentiality_level.create",
      entityType: "confidentiality_level",
      entityId: id
    }, connection);
    await connection.commit();
    created(response, await fetchById("confidentiality_levels", id));
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}));

adminRouter.patch("/confidentiality-levels/:confidentialityLevelId", asyncHandler(async (request, response) => {
  const { confidentialityLevelId } = z.object({ confidentialityLevelId: z.coerce.number().int().positive() }).parse(request.params);
  const input = updateConfidentialityLevelSchema.parse(request.body);
  requirePatch(input);

  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    if (input.is_default) {
      await connection.execute<ResultSetHeader>(
        `UPDATE confidentiality_levels
         SET is_default = FALSE, updated_at = CURRENT_TIMESTAMP
         WHERE is_default = TRUE AND id <> ?`,
        [confidentialityLevelId]
      );
    }

    const { set, values } = updateParts(clean(input), [
      "code",
      "name",
      "rank",
      "is_default",
      "requires_access_log",
      "description",
      "status"
    ]);
    const [result] = await connection.execute<ResultSetHeader>(
      `UPDATE confidentiality_levels
       SET ${set.join(", ")}, updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [...values, confidentialityLevelId]
    );

    if (!result.affectedRows) {
      throw new AppError(404, "not_found", "Confidentiality level was not found.");
    }

    await writeAuditLog(request, {
      action: "admin.confidentiality_level.update",
      entityType: "confidentiality_level",
      entityId: confidentialityLevelId
    }, connection);
    await connection.commit();
    ok(response, await fetchById("confidentiality_levels", confidentialityLevelId));
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}));

const createPriorityLevelSchema = z.object({
  code: z.string().trim().min(1).max(80),
  name: z.string().trim().min(1).max(140),
  rank: z.coerce.number().int().nonnegative().default(0),
  is_default: z.boolean().default(false),
  default_due_days: z.coerce.number().int().positive().nullable().optional(),
  color: optionalNullableString,
  description: optionalNullableString,
  status: statusSchema
});

const updatePriorityLevelSchema = z.object({
  code: z.string().trim().min(1).max(80).optional(),
  name: z.string().trim().min(1).max(140).optional(),
  rank: z.coerce.number().int().nonnegative().optional(),
  is_default: z.boolean().optional(),
  default_due_days: z.coerce.number().int().positive().nullable().optional(),
  color: optionalNullableString,
  description: optionalNullableString,
  status: z.string().trim().min(1).optional()
});

adminRouter.get("/priority-levels", listRoute("priority_levels", "rank"));
adminRouter.post("/priority-levels", asyncHandler(async (request, response) => {
  const input = createPriorityLevelSchema.parse(request.body);
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    if (input.is_default) {
      await connection.execute<ResultSetHeader>(
        "UPDATE priority_levels SET is_default = FALSE, updated_at = CURRENT_TIMESTAMP WHERE is_default = TRUE"
      );
    }

    const [result] = await connection.execute<ResultSetHeader>(
      `INSERT INTO priority_levels (
        uuid, code, name, \`rank\`, is_default, default_due_days, color, description, status
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        uuid(),
        input.code,
        input.name,
        input.rank,
        input.is_default,
        input.default_due_days ?? null,
        input.color || null,
        input.description || null,
        input.status
      ]
    );
    const id = result.insertId;
    await writeAuditLog(request, { action: "admin.priority_level.create", entityType: "priority_level", entityId: id }, connection);
    await connection.commit();
    created(response, await fetchById("priority_levels", Number(id)));
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}));

adminRouter.patch("/priority-levels/:priorityLevelId", asyncHandler(async (request, response) => {
  const { priorityLevelId } = z.object({ priorityLevelId: z.coerce.number().int().positive() }).parse(request.params);
  const input = updatePriorityLevelSchema.parse(request.body);
  requirePatch(input);

  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    if (input.is_default) {
      await connection.execute<ResultSetHeader>(
        `UPDATE priority_levels
         SET is_default = FALSE, updated_at = CURRENT_TIMESTAMP
         WHERE is_default = TRUE AND id <> ?`,
        [priorityLevelId]
      );
    }

    const { set, values } = updateParts(clean(input), [
      "code",
      "name",
      "rank",
      "is_default",
      "default_due_days",
      "color",
      "description",
      "status"
    ]);
    const [result] = await connection.execute<ResultSetHeader>(
      `UPDATE priority_levels
       SET ${set.join(", ")}, updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [...values, priorityLevelId]
    );

    if (!result.affectedRows) {
      throw new AppError(404, "not_found", "Priority level was not found.");
    }

    await writeAuditLog(request, { action: "admin.priority_level.update", entityType: "priority_level", entityId: priorityLevelId }, connection);
    await connection.commit();
    ok(response, await fetchById("priority_levels", priorityLevelId));
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}));
