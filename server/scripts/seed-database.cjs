const argon2 = require("argon2");
const mysql = require("mysql2/promise");
const { randomUUID } = require("node:crypto");
const path = require("node:path");
require("dotenv").config({ path: path.resolve(process.cwd(), ".env") });

function connectionConfig() {
  return {
    host: process.env.DB_HOST || "127.0.0.1",
    port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER || "root",
    password: process.env.DB_PASSWORD || "",
    database: process.env.DB_NAME || "docchain_express",
    charset: "utf8mb4",
    timezone: "Z"
  };
}

async function one(connection, sql, params = []) {
  const [rows] = await connection.execute(sql, params);
  return rows[0] || null;
}

async function insert(connection, sql, params = []) {
  const [result] = await connection.execute(sql, params);
  return Number(result.insertId);
}

async function findOrCreate(connection, selectSql, selectParams, insertSql, insertParams) {
  const existing = await one(connection, selectSql, selectParams);
  if (existing) {
    return Number(existing.id);
  }

  return insert(connection, insertSql, insertParams);
}

async function seedAdminFoundation(connection) {
  const adminEmail = process.env.SEED_ADMIN_EMAIL || "admin@docchain.local";
  const adminUsername = process.env.SEED_ADMIN_USERNAME || "admin";
  const adminPassword = process.env.SEED_ADMIN_PASSWORD || "Admin@12345";

  const systemAdminRoleId = await findOrCreate(
    connection,
    "SELECT id FROM roles WHERE name = ? LIMIT 1",
    ["system_admin"],
    "INSERT INTO roles (uuid, name, display_name, description, is_system) VALUES (?, ?, ?, ?, ?)",
    [randomUUID(), "system_admin", "System Administrator", "Unrestricted platform administrator.", true]
  );

  const organizationId = await findOrCreate(
    connection,
    "SELECT id FROM organizations WHERE code = ? LIMIT 1",
    ["DOCCHAIN_UNIVERSITY"],
    "INSERT INTO organizations (uuid, code, name, name_local, description, status) VALUES (?, ?, ?, ?, ?, ?)",
    [randomUUID(), "DOCCHAIN_UNIVERSITY", "Balkh University", "پوهنتون بلخ", "Default organization for Balkh University.", "active"]
  );
  await connection.execute(
    `UPDATE organizations
     SET name = ?,
         name_local = ?,
         description = ?,
         status = 'active',
         deleted_at = NULL,
         updated_at = CURRENT_TIMESTAMP
     WHERE id = ?`,
    ["Balkh University", "پوهنتون بلخ", "Default organization for Balkh University.", organizationId]
  );

  const unitTypeId = await findOrCreate(
    connection,
    "SELECT id FROM unit_types WHERE code = ? LIMIT 1",
    ["university"],
    "INSERT INTO unit_types (uuid, code, name, hierarchy_level, allows_children, status) VALUES (?, ?, ?, ?, ?, ?)",
    [randomUUID(), "university", "University", 1, true, "active"]
  );

  const rootUnitId = await findOrCreate(
    connection,
    "SELECT id FROM units WHERE organization_id = ? AND code = ? LIMIT 1",
    [organizationId, "UNIVERSITY"],
    "INSERT INTO units (uuid, organization_id, unit_type_id, parent_unit_id, code, name, name_local, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
    [randomUUID(), organizationId, unitTypeId, null, "UNIVERSITY", "Balkh University", "پوهنتون بلخ", "active"]
  );
  await connection.execute(
    `UPDATE units
     SET name = ?,
         name_local = ?,
         status = 'active',
         deleted_at = NULL,
         updated_at = CURRENT_TIMESTAMP
     WHERE id = ?`,
    ["Balkh University", "پوهنتون بلخ", rootUnitId]
  );

  const systemAdminPositionId = await findOrCreate(
    connection,
    "SELECT id FROM positions WHERE unit_id = ? AND code = ? LIMIT 1",
    [rootUnitId, "system_admin"],
    "INSERT INTO positions (uuid, unit_id, code, title, authority_level, is_signing_authority, allows_multiple_active_assignments, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
    [randomUUID(), rootUnitId, "system_admin", "System Administrator", 100, false, false, "active"]
  );

  const adminPersonId = await findOrCreate(
    connection,
    "SELECT id FROM persons WHERE email = ? LIMIT 1",
    [adminEmail],
    "INSERT INTO persons (uuid, employee_code, first_name, last_name, display_name, email, status) VALUES (?, ?, ?, ?, ?, ?, ?)",
    [randomUUID(), "ADMIN-001", "System", "Administrator", "System Administrator", adminEmail, "active"]
  );

  await connection.execute(
    `UPDATE persons
     SET employee_code = ?,
         first_name = ?,
         last_name = ?,
         display_name = ?,
         email = ?,
         status = ?,
         updated_at = CURRENT_TIMESTAMP
     WHERE id = ?`,
    ["ADMIN-001", "System", "Administrator", "System Administrator", adminEmail, "active", adminPersonId]
  );

  const passwordHash = await argon2.hash(adminPassword, { type: argon2.argon2id });
  const existingAdmin = await one(
    connection,
    "SELECT id FROM users WHERE email = ? OR username = ? LIMIT 1",
    [adminEmail, adminUsername]
  );
  const adminUserId = existingAdmin
    ? Number(existingAdmin.id)
    : await insert(
      connection,
      "INSERT INTO users (uuid, person_id, email, username, password_hash, status, must_change_password) VALUES (?, ?, ?, ?, ?, ?, ?)",
      [randomUUID(), adminPersonId, adminEmail, adminUsername, passwordHash, "active", false]
    );

  await connection.execute(
    `UPDATE users
     SET person_id = ?,
         email = ?,
         username = ?,
         password_hash = ?,
         status = 'active',
         must_change_password = FALSE,
         failed_login_attempts = 0,
         locked_until = NULL,
         updated_at = CURRENT_TIMESTAMP
     WHERE id = ?`,
    [adminPersonId, adminEmail, adminUsername, passwordHash, adminUserId]
  );

  await connection.execute(
    "INSERT IGNORE INTO user_roles (user_id, role_id, assigned_by_user_id) VALUES (?, ?, ?)",
    [adminUserId, systemAdminRoleId, adminUserId]
  );

  const adminAssignmentId = await findOrCreate(
    connection,
    "SELECT id FROM assignments WHERE person_id = ? AND position_id = ? LIMIT 1",
    [adminPersonId, systemAdminPositionId],
    "INSERT INTO assignments (uuid, person_id, position_id, status, is_primary, starts_at, created_by_user_id) VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP, ?)",
    [randomUUID(), adminPersonId, systemAdminPositionId, "active", true, adminUserId]
  );

  await connection.execute(
    `UPDATE assignments
     SET status = 'active',
         is_primary = TRUE,
         starts_at = COALESCE(starts_at, CURRENT_TIMESTAMP),
         created_by_user_id = ?,
         updated_at = CURRENT_TIMESTAMP
     WHERE id = ?`,
    [adminUserId, adminAssignmentId]
  );

  await findOrCreate(
    connection,
    "SELECT id FROM assignment_status_history WHERE assignment_id = ? AND to_status = ? LIMIT 1",
    [adminAssignmentId, "active"],
    "INSERT INTO assignment_status_history (assignment_id, from_status, to_status, reason, changed_by_user_id) VALUES (?, ?, ?, ?, ?)",
    [adminAssignmentId, null, "active", "Initial system administrator seed.", adminUserId]
  );
}

async function seedDocumentReferenceData(connection) {
  await connection.execute(
    `UPDATE confidentiality_levels
     SET code = 'secret',
         name = 'Secret',
         \`rank\` = 20,
         requires_access_log = TRUE,
         description = 'Restricted correspondence that should be access logged.',
         status = 'active',
         updated_at = CURRENT_TIMESTAMP
     WHERE code = 'confidential'
       AND NOT EXISTS (
         SELECT 1 FROM (SELECT id FROM confidentiality_levels WHERE code = 'secret' LIMIT 1) AS existing_secret
       )`
  );

  await connection.execute(
    "UPDATE confidentiality_levels SET is_default = FALSE, updated_at = CURRENT_TIMESTAMP WHERE code <> ?",
    ["normal"]
  );

  const confidentialityLevels = [
    ["normal", "Normal", 10, true, false, "Default internal correspondence level."],
    ["secret", "Secret", 20, false, true, "Restricted correspondence that should be access logged."],
    ["highly_secret", "Highly Secret", 30, false, true, "Highly restricted correspondence for sensitive university matters."]
  ];

  for (const [code, name, rank, isDefault, requiresAccessLog, description] of confidentialityLevels) {
    const id = await findOrCreate(
      connection,
      "SELECT id FROM confidentiality_levels WHERE code = ? LIMIT 1",
      [code],
      "INSERT INTO confidentiality_levels (uuid, code, name, `rank`, is_default, requires_access_log, description, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
      [randomUUID(), code, name, rank, isDefault, requiresAccessLog, description, "active"]
    );

    await connection.execute(
      `UPDATE confidentiality_levels
       SET name = ?,
           \`rank\` = ?,
           is_default = ?,
           requires_access_log = ?,
           description = ?,
           status = 'active',
           updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [name, rank, isDefault, requiresAccessLog, description, id]
    );
  }

  await connection.execute(
    "UPDATE confidentiality_levels SET status = 'inactive', updated_at = CURRENT_TIMESTAMP WHERE code IN (?, ?)",
    ["public", "confidential"]
  );

  await connection.execute(
    `UPDATE priority_levels
     SET code = 'medium',
         name = 'Medium',
         \`rank\` = 20,
         description = 'Default priority for routine correspondence.',
         status = 'active',
         updated_at = CURRENT_TIMESTAMP
     WHERE code = 'normal'
       AND NOT EXISTS (
         SELECT 1 FROM (SELECT id FROM priority_levels WHERE code = 'medium' LIMIT 1) AS existing_medium
       )`
  );

  await connection.execute(
    `UPDATE priority_levels
     SET code = 'high',
         name = 'High',
         \`rank\` = 30,
         description = 'Needs quick action.',
         status = 'active',
         updated_at = CURRENT_TIMESTAMP
     WHERE code = 'urgent'
       AND NOT EXISTS (
         SELECT 1 FROM (SELECT id FROM priority_levels WHERE code = 'high' LIMIT 1) AS existing_high
       )`
  );

  await connection.execute(
    "UPDATE priority_levels SET is_default = FALSE, updated_at = CURRENT_TIMESTAMP WHERE code <> ?",
    ["medium"]
  );

  const priorityLevels = [
    ["low", "Low", 10, false, 14, "#64748b", "Can be handled after medium priority work."],
    ["medium", "Medium", 20, true, 7, "#2563eb", "Default priority for routine correspondence."],
    ["high", "High", 30, false, 2, "#dc2626", "Needs quick action."]
  ];

  for (const [code, name, rank, isDefault, defaultDueDays, color, description] of priorityLevels) {
    const id = await findOrCreate(
      connection,
      "SELECT id FROM priority_levels WHERE code = ? LIMIT 1",
      [code],
      "INSERT INTO priority_levels (uuid, code, name, `rank`, is_default, default_due_days, color, description, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
      [randomUUID(), code, name, rank, isDefault, defaultDueDays, color, description, "active"]
    );

    await connection.execute(
      `UPDATE priority_levels
       SET name = ?,
           \`rank\` = ?,
           is_default = ?,
           default_due_days = ?,
           color = ?,
           description = ?,
           status = 'active',
           updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [name, rank, isDefault, defaultDueDays, color, description, id]
    );
  }

  await connection.execute(
    "UPDATE priority_levels SET status = 'inactive', is_default = FALSE, updated_at = CURRENT_TIMESTAMP WHERE code IN (?, ?)",
    ["normal", "urgent"]
  );
}

async function main() {
  const connection = await mysql.createConnection(connectionConfig());
  try {
    await connection.beginTransaction();
    await seedAdminFoundation(connection);
    await seedDocumentReferenceData(connection);
    await connection.commit();
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    await connection.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
