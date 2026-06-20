const argon2 = require("argon2");
const mysql = require("mysql2/promise");
const { randomUUID } = require("node:crypto");
const path = require("node:path");
require("dotenv").config({ path: path.resolve(process.cwd(), ".env") });

const universityName = process.env.SEED_UNIVERSITY_NAME || "پوهنتون بلخ";

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

async function ensureRole(connection, role) {
  const roleId = await findOrCreate(
    connection,
    "SELECT id FROM roles WHERE name = ? LIMIT 1",
    [role.name],
    "INSERT INTO roles (uuid, name, display_name, description, is_system) VALUES (?, ?, ?, ?, ?)",
    [randomUUID(), role.name, role.displayName, role.description, true]
  );

  await connection.execute(
    `UPDATE roles
     SET display_name = ?,
         description = ?,
         is_system = TRUE,
         updated_at = CURRENT_TIMESTAMP
     WHERE id = ?`,
    [role.displayName, role.description, roleId]
  );

  return roleId;
}

async function ensureAdminFoundation(connection) {
  const adminEmail = process.env.SEED_ADMIN_EMAIL || "admin@docchain.local";
  const adminUsername = process.env.SEED_ADMIN_USERNAME || "admin";
  const adminPassword = process.env.SEED_ADMIN_PASSWORD || "Admin@12345";

  const systemAdminRoleId = await ensureRole(connection, {
    name: "system_admin",
    displayName: "System Administrator",
    description: "Full access to configure and operate DocChain."
  });

  await ensureRole(connection, {
    name: "admin_staff",
    displayName: "Admin Staff",
    description: "Administrative access for day-to-day configuration."
  });

  const organizationId = await findOrCreate(
    connection,
    "SELECT id FROM organizations WHERE code = ? LIMIT 1",
    ["DOCCHAIN_UNIVERSITY"],
    "INSERT INTO organizations (uuid, code, name, name_local, description, status) VALUES (?, ?, ?, ?, ?, ?)",
    [randomUUID(), "DOCCHAIN_UNIVERSITY", universityName, universityName, null, "active"]
  );
  await connection.execute(
    `UPDATE organizations
     SET name = ?,
         name_local = ?,
         description = NULL,
         status = 'active',
         deleted_at = NULL,
         updated_at = CURRENT_TIMESTAMP
     WHERE id = ?`,
    [universityName, universityName, organizationId]
  );

  const unitTypeId = await findOrCreate(
    connection,
    "SELECT id FROM unit_types WHERE code = ? LIMIT 1",
    ["university"],
    "INSERT INTO unit_types (uuid, code, name, hierarchy_level, allows_children, status, description) VALUES (?, ?, ?, ?, ?, ?, ?)",
    [randomUUID(), "university", "University", 1, true, "active", "Root university unit."]
  );
  await connection.execute(
    `UPDATE unit_types
     SET name = ?,
         hierarchy_level = ?,
         allows_children = TRUE,
         status = 'active',
         description = ?,
         updated_at = CURRENT_TIMESTAMP
     WHERE id = ?`,
    ["University", 1, "Root university unit.", unitTypeId]
  );

  const rootUnitId = await findOrCreate(
    connection,
    "SELECT id FROM units WHERE organization_id = ? AND code = ? LIMIT 1",
    [organizationId, "UNIVERSITY"],
    "INSERT INTO units (uuid, organization_id, unit_type_id, parent_unit_id, code, name, name_local, description, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
    [randomUUID(), organizationId, unitTypeId, null, "UNIVERSITY", universityName, universityName, null, "active"]
  );
  await connection.execute(
    `UPDATE units
     SET unit_type_id = ?,
         parent_unit_id = NULL,
         name = ?,
         name_local = ?,
         description = NULL,
         status = 'active',
         deleted_at = NULL,
         updated_at = CURRENT_TIMESTAMP
     WHERE id = ?`,
    [unitTypeId, universityName, universityName, rootUnitId]
  );

  const systemAdminPositionId = await findOrCreate(
    connection,
    "SELECT id FROM positions WHERE unit_id = ? AND code = ? LIMIT 1",
    [rootUnitId, "system_admin"],
    "INSERT INTO positions (uuid, unit_id, code, title, title_local, authority_level, is_signing_authority, allows_multiple_active_assignments, description, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
    [randomUUID(), rootUnitId, "system_admin", "System Administrator", null, 100, false, false, "Initial administrator position.", "active"]
  );
  await connection.execute(
    `UPDATE positions
     SET title = ?,
         title_local = NULL,
         authority_level = ?,
         is_signing_authority = FALSE,
         allows_multiple_active_assignments = FALSE,
         description = ?,
         status = 'active',
         deleted_at = NULL,
         updated_at = CURRENT_TIMESTAMP
     WHERE id = ?`,
    ["System Administrator", 100, "Initial administrator position.", systemAdminPositionId]
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
         status = 'active',
         deleted_at = NULL,
         updated_at = CURRENT_TIMESTAMP
     WHERE id = ?`,
    ["ADMIN-001", "System", "Administrator", "System Administrator", adminEmail, adminPersonId]
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
         ends_at = NULL,
         created_by_user_id = ?,
         deleted_at = NULL,
         updated_at = CURRENT_TIMESTAMP
     WHERE id = ?`,
    [adminUserId, adminAssignmentId]
  );

  await findOrCreate(
    connection,
    "SELECT id FROM assignment_status_history WHERE assignment_id = ? AND to_status = ? LIMIT 1",
    [adminAssignmentId, "active"],
    "INSERT INTO assignment_status_history (assignment_id, from_status, to_status, reason, changed_by_user_id) VALUES (?, ?, ?, ?, ?)",
    [adminAssignmentId, null, "active", "Initial administrator assignment.", adminUserId]
  );

  return { adminEmail, adminUsername, adminUserId, rootUnitId };
}

async function ensureDefaultReferenceData(connection, adminUserId) {
  await findOrCreate(
    connection,
    "SELECT id FROM document_types WHERE code = ? LIMIT 1",
    ["official_letter"],
    "INSERT INTO document_types (uuid, code, name, description, requires_serial, status) VALUES (?, ?, ?, ?, ?, ?)",
    [randomUUID(), "official_letter", "Official Letter", "Default document type for university correspondence.", true, "active"]
  );
  await connection.execute(
    `UPDATE document_types
     SET name = ?,
         description = ?,
         requires_serial = TRUE,
         status = 'active',
         updated_at = CURRENT_TIMESTAMP
     WHERE code = ?`,
    ["Official Letter", "Default document type for university correspondence.", "official_letter"]
  );

  await connection.execute(
    "UPDATE confidentiality_levels SET is_default = FALSE, updated_at = CURRENT_TIMESTAMP WHERE code <> ? AND is_default = TRUE",
    ["normal"]
  );
  await findOrCreate(
    connection,
    "SELECT id FROM confidentiality_levels WHERE code = ? LIMIT 1",
    ["normal"],
    "INSERT INTO confidentiality_levels (uuid, code, name, `rank`, is_default, requires_access_log, description, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
    [randomUUID(), "normal", "Normal", 10, true, false, "Default correspondence visibility.", "active"]
  );
  await connection.execute(
    `UPDATE confidentiality_levels
     SET name = ?,
         \`rank\` = ?,
         is_default = TRUE,
         requires_access_log = FALSE,
         description = ?,
         status = 'active',
         updated_at = CURRENT_TIMESTAMP
     WHERE code = ?`,
    ["Normal", 10, "Default correspondence visibility.", "normal"]
  );

  await connection.execute(
    "UPDATE priority_levels SET is_default = FALSE, updated_at = CURRENT_TIMESTAMP WHERE code <> ? AND is_default = TRUE",
    ["medium"]
  );
  await findOrCreate(
    connection,
    "SELECT id FROM priority_levels WHERE code = ? LIMIT 1",
    ["medium"],
    "INSERT INTO priority_levels (uuid, code, name, `rank`, is_default, default_due_days, color, description, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
    [randomUUID(), "medium", "Medium", 20, true, 7, "#2563eb", "Default priority for routine correspondence.", "active"]
  );
  await connection.execute(
    `UPDATE priority_levels
     SET name = ?,
         \`rank\` = ?,
         is_default = TRUE,
         default_due_days = ?,
         color = ?,
         description = ?,
         status = 'active',
         updated_at = CURRENT_TIMESTAMP
     WHERE code = ?`,
    ["Medium", 20, 7, "#2563eb", "Default priority for routine correspondence.", "medium"]
  );

  await connection.execute(
    "UPDATE serial_rules SET is_default = FALSE, updated_at = CURRENT_TIMESTAMP WHERE code <> ? AND is_default = TRUE",
    ["default_yearly"]
  );
  await findOrCreate(
    connection,
    "SELECT id FROM serial_rules WHERE code = ? LIMIT 1",
    ["default_yearly"],
    `INSERT INTO serial_rules (
      uuid, code, name, format, scope, reset_policy, sequence_padding,
      is_default, status, activated_by_user_id, activated_at, notes
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, ?)`,
    [
      randomUUID(),
      "default_yearly",
      "Default yearly serial",
      "DOC-{YEAR}-{SEQUENCE}",
      "global",
      "yearly",
      6,
      true,
      "active",
      adminUserId,
      "Minimal seed default serial rule."
    ]
  );
  await connection.execute(
    `UPDATE serial_rules
     SET name = ?,
         format = ?,
         scope = ?,
         reset_policy = ?,
         sequence_padding = ?,
         is_default = TRUE,
         status = 'active',
         activated_by_user_id = COALESCE(activated_by_user_id, ?),
         activated_at = COALESCE(activated_at, CURRENT_TIMESTAMP),
         notes = ?,
         updated_at = CURRENT_TIMESTAMP
     WHERE code = ?`,
    [
      "Default yearly serial",
      "DOC-{YEAR}-{SEQUENCE}",
      "global",
      "yearly",
      6,
      adminUserId,
      "Minimal seed default serial rule.",
      "default_yearly"
    ]
  );
}

async function main() {
  const connection = await mysql.createConnection(connectionConfig());
  try {
    await connection.beginTransaction();
    const admin = await ensureAdminFoundation(connection);
    await ensureDefaultReferenceData(connection, admin.adminUserId);
    await connection.commit();

    console.log("Minimal DocChain seed complete.");
    console.log(`University: ${universityName}`);
    console.log(`Admin username: ${admin.adminUsername}`);
    console.log(`Admin email: ${admin.adminEmail}`);
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
