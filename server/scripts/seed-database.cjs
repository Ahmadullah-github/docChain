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

async function idByCode(connection, table, code) {
  if (!code) {
    return null;
  }

  const row = await one(connection, `SELECT id FROM ${table} WHERE code = ? LIMIT 1`, [code]);
  return row ? Number(row.id) : null;
}

async function idByName(connection, table, name) {
  if (!name) {
    return null;
  }

  const row = await one(connection, `SELECT id FROM ${table} WHERE name = ? LIMIT 1`, [name]);
  return row ? Number(row.id) : null;
}

async function seedFoundation(connection) {
  const systemAdminRoleId = await findOrCreate(
    connection,
    "SELECT id FROM roles WHERE name = ? LIMIT 1",
    ["system_admin"],
    "INSERT INTO roles (uuid, name, display_name, description, is_system) VALUES (?, ?, ?, ?, ?)",
    [randomUUID(), "system_admin", "System Administrator", "Unrestricted platform administrator except unreadable user PINs.", true]
  );

  await findOrCreate(
    connection,
    "SELECT id FROM roles WHERE name = ? LIMIT 1",
    ["admin_staff"],
    "INSERT INTO roles (uuid, name, display_name, description, is_system) VALUES (?, ?, ?, ?, ?)",
    [randomUUID(), "admin_staff", "Administrative Staff", "Can manage configured administrative master data.", true]
  );

  await findOrCreate(
    connection,
    "SELECT id FROM roles WHERE name = ? LIMIT 1",
    ["user"],
    "INSERT INTO roles (uuid, name, display_name, description, is_system) VALUES (?, ?, ?, ?, ?)",
    [randomUUID(), "user", "User", "Authenticated platform user.", true]
  );

  const organizationId = await findOrCreate(
    connection,
    "SELECT id FROM organizations WHERE code = ? LIMIT 1",
    ["DOCCHAIN_UNIVERSITY"],
    "INSERT INTO organizations (uuid, code, name, description, status) VALUES (?, ?, ?, ?, ?)",
    [randomUUID(), "DOCCHAIN_UNIVERSITY", "DocChain University", "Default organization seeded for local development.", "active"]
  );

  const unitTypeIds = {};
  const unitTypes = [
    ["university", "University", 1],
    ["vice_chancellery", "Vice Chancellery", 2],
    ["faculty", "Faculty", 3],
    ["department", "Department", 4],
    ["office", "Office", 4],
    ["committee", "Committee", 4]
  ];

  for (const [code, name, level] of unitTypes) {
    unitTypeIds[code] = await findOrCreate(
      connection,
      "SELECT id FROM unit_types WHERE code = ? LIMIT 1",
      [code],
      "INSERT INTO unit_types (uuid, code, name, hierarchy_level, allows_children) VALUES (?, ?, ?, ?, ?)",
      [randomUUID(), code, name, level, true]
    );
  }

  const rootUnitId = await findOrCreate(
    connection,
    "SELECT id FROM units WHERE organization_id = ? AND code = ? LIMIT 1",
    [organizationId, "UNIVERSITY"],
    "INSERT INTO units (uuid, organization_id, unit_type_id, parent_unit_id, code, name, status) VALUES (?, ?, ?, ?, ?, ?, ?)",
    [randomUUID(), organizationId, unitTypeIds.university, null, "UNIVERSITY", "University", "active"]
  );

  const positionIds = {};
  const positions = [
    ["system_admin", "System Administrator", 100, false],
    ["president", "President", 90, true],
    ["vice_chancellor", "Vice Chancellor", 80, true],
    ["dean", "Dean", 70, true],
    ["department_head", "Department Head", 60, true],
    ["committee_chair", "Committee Chair", 60, true],
    ["executive_staff", "Executive Staff", 20, false],
    ["committee_staff", "Committee Staff", 20, false],
    ["authorized_recipient", "Authorized Recipient", 10, false]
  ];

  for (const [code, title, authorityLevel, isSigningAuthority] of positions) {
    positionIds[code] = await findOrCreate(
      connection,
      "SELECT id FROM positions WHERE code = ? LIMIT 1",
      [code],
      "INSERT INTO positions (uuid, organization_id, code, title, authority_level, is_signing_authority, status) VALUES (?, ?, ?, ?, ?, ?, ?)",
      [randomUUID(), organizationId, code, title, authorityLevel, isSigningAuthority, "active"]
    );
  }

  const documentTypes = [
    ["official_letter", "Official Letter", true],
    ["memo", "Memo", true],
    ["internal_memo", "Internal Memo", true],
    ["confidential_memo", "Confidential Memo", true],
    ["directive", "Directive", true],
    ["inquiry", "Inquiry", true],
    ["proposal", "Proposal", true],
    ["report", "Report", true],
    ["committee_report", "Committee Report", true],
    ["meeting_resolution", "Meeting Resolution", true],
    ["reply", "Reply", true],
    ["reply_letter", "Reply Letter", true],
    ["announcement", "Announcement", true],
    ["internal_note", "Internal Note", false],
    ["review_form", "Review Form", true],
    ["acknowledgement_sheet", "Acknowledgement Sheet", true],
    ["policy_approval_document", "Policy Approval Document", true]
  ];

  for (const [code, name, requiresSerial] of documentTypes) {
    await findOrCreate(
      connection,
      "SELECT id FROM document_types WHERE code = ? LIMIT 1",
      [code],
      "INSERT INTO document_types (uuid, code, name, requires_serial, status) VALUES (?, ?, ?, ?, ?)",
      [randomUUID(), code, name, requiresSerial, "active"]
    );
  }

  const confidentialityLevels = [
    ["normal", "Normal", 10, true, false],
    ["internal", "Internal", 20, false, false],
    ["confidential", "Confidential", 50, false, true],
    ["restricted", "Restricted", 80, false, true]
  ];

  for (const [code, name, rank, isDefault, requiresAccessLog] of confidentialityLevels) {
    await findOrCreate(
      connection,
      "SELECT id FROM confidentiality_levels WHERE code = ? LIMIT 1",
      [code],
      "INSERT INTO confidentiality_levels (uuid, code, name, `rank`, is_default, requires_access_log, status) VALUES (?, ?, ?, ?, ?, ?, ?)",
      [randomUUID(), code, name, rank, isDefault, requiresAccessLog, "active"]
    );
  }

  const priorityLevels = [
    ["low", "Low", 10, 14, "#64748b"],
    ["normal", "Normal", 20, 7, "#2563eb"],
    ["high", "High", 40, 3, "#f97316"],
    ["urgent", "Urgent", 80, 1, "#dc2626"]
  ];

  for (const [code, name, rank, defaultDueDays, color] of priorityLevels) {
    await findOrCreate(
      connection,
      "SELECT id FROM priority_levels WHERE code = ? LIMIT 1",
      [code],
      "INSERT INTO priority_levels (uuid, code, name, `rank`, default_due_days, color, status) VALUES (?, ?, ?, ?, ?, ?, ?)",
      [randomUUID(), code, name, rank, defaultDueDays, color, "active"]
    );
  }

  const adminEmail = process.env.SEED_ADMIN_EMAIL || "admin@docchain.local";
  const adminUsername = process.env.SEED_ADMIN_USERNAME || "admin";
  const adminPassword = process.env.SEED_ADMIN_PASSWORD || "Admin@12345";

  const adminPersonId = await findOrCreate(
    connection,
    "SELECT id FROM persons WHERE email = ? LIMIT 1",
    [adminEmail],
    "INSERT INTO persons (uuid, employee_code, first_name, last_name, display_name, email, status) VALUES (?, ?, ?, ?, ?, ?, ?)",
    [randomUUID(), "ADMIN-001", "System", "Administrator", "System Administrator", adminEmail, "active"]
  );

  const existingAdmin = await one(connection, "SELECT id FROM users WHERE email = ? LIMIT 1", [adminEmail]);
  let adminUserId = existingAdmin ? Number(existingAdmin.id) : 0;
  if (!adminUserId) {
    adminUserId = await insert(
      connection,
      "INSERT INTO users (uuid, person_id, email, username, password_hash, status, must_change_password) VALUES (?, ?, ?, ?, ?, ?, ?)",
      [randomUUID(), adminPersonId, adminEmail, adminUsername, await argon2.hash(adminPassword, { type: argon2.argon2id }), "active", false]
    );
  }

  await connection.execute(
    "INSERT IGNORE INTO user_roles (user_id, role_id, assigned_by_user_id) VALUES (?, ?, ?)",
    [adminUserId, systemAdminRoleId, adminUserId]
  );

  const adminAssignmentId = await findOrCreate(
    connection,
    "SELECT id FROM assignments WHERE person_id = ? AND unit_id = ? AND position_id = ? LIMIT 1",
    [adminPersonId, rootUnitId, positionIds.system_admin],
    "INSERT INTO assignments (uuid, person_id, unit_id, position_id, status, is_primary, starts_at, created_by_user_id) VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, ?)",
    [randomUUID(), adminPersonId, rootUnitId, positionIds.system_admin, "active", true, adminUserId]
  );

  await findOrCreate(
    connection,
    "SELECT id FROM assignment_status_history WHERE assignment_id = ? AND to_status = ? LIMIT 1",
    [adminAssignmentId, "active"],
    "INSERT INTO assignment_status_history (assignment_id, from_status, to_status, reason, changed_by_user_id) VALUES (?, ?, ?, ?, ?)",
    [adminAssignmentId, null, "active", "Initial system administrator seed.", adminUserId]
  );

  await connection.execute(
    "INSERT INTO audit_logs (actor_user_id, actor_assignment_id, action, entity_type, entity_id, metadata) VALUES (?, ?, ?, ?, ?, ?)",
    [adminUserId, adminAssignmentId, "seed.foundation", "system", "foundation", JSON.stringify({ message: "Foundation seed completed." })]
  );
}

// async function upsertRoutingRule(connection, input) {
//   const existing = await one(
//     connection,
//     `SELECT id FROM routing_rules
//      WHERE document_type_id <=> ?
//        AND from_unit_type_id <=> ?
//        AND from_position_id <=> ?
//        AND to_unit_type_id <=> ?
//        AND to_position_id <=> ?
//        AND action = ?
//      LIMIT 1`,
//     [
//       input.document_type_id,
//       input.from_unit_type_id,
//       input.from_position_id,
//       input.to_unit_type_id,
//       input.to_position_id,
//       input.action
//     ]
//   );

//   if (existing) {
//     return Number(existing.id);
//   }

//   const id = await insert(
//     connection,
//     `INSERT INTO routing_rules (
//       uuid, document_type_id, from_unit_type_id, from_position_id, to_unit_type_id, to_position_id,
//       action, allowed, prior_review_required, prior_signature_required, is_external_target,
//       is_multi_recipient, priority, status, activated_at, notes
//     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, ?)`,
//     [
//       randomUUID(),
//       input.document_type_id,
//       input.from_unit_type_id,
//       input.from_position_id,
//       input.to_unit_type_id,
//       input.to_position_id,
//       input.action,
//       input.allowed,
//       input.prior_review_required,
//       input.prior_signature_required,
//       input.is_external_target || false,
//       input.is_multi_recipient || false,
//       input.priority || 100,
//       "active",
//       input.notes || null
//     ]
//   );

//   for (const condition of input.conditions || []) {
//     await connection.execute(
//       "INSERT INTO workflow_rule_conditions (routing_rule_id, condition_key, operator, condition_value, is_required) VALUES (?, ?, ?, ?, ?)",
//       [id, condition.key, condition.operator || "equals", condition.value, true]
//     );
//   }

//   return id;
// }

// async function seedRoutingRules(connection) {
//   const documentType = {
//     officialLetter: await idByCode(connection, "document_types", "official_letter"),
//     internalMemo: await idByCode(connection, "document_types", "internal_memo"),
//     committeeReport: await idByCode(connection, "document_types", "committee_report"),
//     replyLetter: await idByCode(connection, "document_types", "reply_letter"),
//     confidentialMemo: await idByCode(connection, "document_types", "confidential_memo")
//   };

//   const unitType = {
//     department: await idByCode(connection, "unit_types", "department"),
//     faculty: await idByCode(connection, "unit_types", "faculty"),
//     viceChancellery: await idByCode(connection, "unit_types", "vice_chancellery"),
//     university: await idByCode(connection, "unit_types", "university"),
//     committee: await idByCode(connection, "unit_types", "committee")
//   };

//   const position = {
//     executiveStaff: await idByCode(connection, "positions", "executive_staff"),
//     departmentHead: await idByCode(connection, "positions", "department_head"),
//     dean: await idByCode(connection, "positions", "dean"),
//     viceChancellor: await idByCode(connection, "positions", "vice_chancellor"),
//     president: await idByCode(connection, "positions", "president"),
//     committeeStaff: await idByCode(connection, "positions", "committee_staff"),
//     committeeChair: await idByCode(connection, "positions", "committee_chair"),
//     authorizedRecipient: await idByCode(connection, "positions", "authorized_recipient")
//   };

//   const rules = [
//     [documentType.officialLetter, unitType.department, position.executiveStaff, unitType.department, position.departmentHead, "submit_for_review", "allowed", false, false, false, false, "first drafting step"],
//     [documentType.officialLetter, unitType.department, position.departmentHead, unitType.faculty, position.dean, "forward_for_signature", "allowed", true, true, false, false, "upward departmental letter"],
//     [documentType.officialLetter, unitType.faculty, position.dean, unitType.viceChancellery, position.viceChancellor, "forward_for_signature", "allowed", true, true, false, false, "faculty to vice level"],
//     [documentType.officialLetter, unitType.viceChancellery, position.viceChancellor, unitType.university, position.president, "forward_for_final_signature", "optional", true, true, false, false, "only if president is final authority"],
//     [documentType.officialLetter, unitType.faculty, position.dean, null, position.authorizedRecipient, "dispatch", "allowed", true, true, true, false, "dean may dispatch externally if final signatory by rule"],
//     [documentType.officialLetter, unitType.university, position.president, null, position.authorizedRecipient, "dispatch", "allowed", true, true, true, false, "highest-level formal dispatch"],
//     [documentType.internalMemo, unitType.department, position.executiveStaff, unitType.department, position.departmentHead, "submit_for_review", "allowed", false, false, false, false, "internal memo draft"],
//     [documentType.internalMemo, unitType.department, position.departmentHead, unitType.faculty, position.dean, "refer", "allowed", false, false, false, false, "internal communication"],
//     [documentType.internalMemo, unitType.faculty, position.dean, unitType.department, position.departmentHead, "refer", "allowed", false, false, false, false, "downward instruction"],
//     [documentType.committeeReport, unitType.committee, position.committeeStaff, unitType.committee, position.committeeChair, "submit_for_review", "allowed", false, false, false, false, "committee-origin draft"],
//     [documentType.committeeReport, unitType.committee, position.committeeChair, unitType.faculty, position.dean, "submit", "allowed", false, true, false, false, "faculty receives signed committee report"],
//     [documentType.replyLetter, null, null, null, null, "dispatch_reply", "allowed", true, true, false, false, "new document with new serial"],
//     [documentType.confidentialMemo, unitType.department, position.executiveStaff, null, null, "dispatch", "denied", false, false, true, false, "confidential memo cannot be externally dispatched directly"],
//     [null, null, null, null, null, "dispatch", "denied", false, false, true, false, "drafts are never official", [{ key: "document_status", value: "draft" }]],
//     [null, null, null, null, position.authorizedRecipient, "dispatch_multi", "allowed", true, true, false, true, "one transmission per recipient recommended", [{ key: "document_status", value: "finalized" }]]
//   ];

//   for (const [documentTypeId, fromUnitTypeId, fromPositionId, toUnitTypeId, toPositionId, action, allowed, priorReview, priorSignature, externalTarget, multiRecipient, notes, conditions] of rules) {
//     await upsertRoutingRule(connection, {
//       document_type_id: documentTypeId,
//       from_unit_type_id: fromUnitTypeId,
//       from_position_id: fromPositionId,
//       to_unit_type_id: toUnitTypeId,
//       to_position_id: toPositionId,
//       action,
//       allowed,
//       prior_review_required: priorReview,
//       prior_signature_required: priorSignature,
//       is_external_target: externalTarget,
//       is_multi_recipient: multiRecipient,
//       notes,
//       conditions
//     });
//   }
// }

// async function upsertSignatureRule(connection, input) {
//   const existing = await one(
//     connection,
//     `SELECT id FROM signature_rules
//      WHERE document_type_id = ?
//        AND origin_unit_type_id <=> ?
//        AND step_number = ?
//        AND required_position_id = ?
//        AND required_unit_scope = ?
//      LIMIT 1`,
//     [
//       input.document_type_id,
//       input.origin_unit_type_id,
//       input.step_number,
//       input.required_position_id,
//       input.required_unit_scope
//     ]
//   );

//   const params = [
//     "pin_signature_image",
//     input.is_required,
//     input.is_parallel,
//     input.can_finalize_document,
//     input.can_be_hidden_later,
//     "active",
//     input.notes || null
//   ];

//   if (existing) {
//     await connection.execute(
//       `UPDATE signature_rules
//        SET signature_mode = ?, is_required = ?, is_parallel = ?, can_finalize_document = ?,
//            can_be_hidden_later = ?, status = ?, activated_at = CURRENT_TIMESTAMP,
//            notes = ?, updated_at = CURRENT_TIMESTAMP
//        WHERE id = ?`,
//       [...params, existing.id]
//     );
//     return Number(existing.id);
//   }

//   return insert(
//     connection,
//     `INSERT INTO signature_rules (
//       uuid, document_type_id, origin_unit_type_id, step_number, required_position_id,
//       required_unit_scope, signature_mode, is_required, is_parallel, can_finalize_document,
//       can_be_hidden_later, status, activated_at, notes
//     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, ?)`,
//     [
//       randomUUID(),
//       input.document_type_id,
//       input.origin_unit_type_id,
//       input.step_number,
//       input.required_position_id,
//       input.required_unit_scope,
//       ...params
//     ]
//   );
// }

// async function seedSignatureAndSerialRules(connection) {
//   const documentType = {
//     officialLetter: await idByCode(connection, "document_types", "official_letter"),
//     committeeReport: await idByCode(connection, "document_types", "committee_report"),
//     internalMemo: await idByCode(connection, "document_types", "internal_memo"),
//     reviewForm: await idByCode(connection, "document_types", "review_form"),
//     acknowledgementSheet: await idByCode(connection, "document_types", "acknowledgement_sheet"),
//     policyApproval: await idByCode(connection, "document_types", "policy_approval_document")
//   };

//   const unitType = {
//     department: await idByCode(connection, "unit_types", "department"),
//     faculty: await idByCode(connection, "unit_types", "faculty"),
//     committee: await idByCode(connection, "unit_types", "committee"),
//     university: await idByCode(connection, "unit_types", "university")
//   };

//   const position = {
//     departmentHead: await idByCode(connection, "positions", "department_head"),
//     dean: await idByCode(connection, "positions", "dean"),
//     viceChancellor: await idByCode(connection, "positions", "vice_chancellor"),
//     president: await idByCode(connection, "positions", "president"),
//     committeeChair: await idByCode(connection, "positions", "committee_chair")
//   };

//   const rules = [
//     [documentType.officialLetter, unitType.department, 1, position.departmentHead, "same_unit", true, false, false, true, "first formal sign"],
//     [documentType.officialLetter, unitType.department, 2, position.dean, "parent_faculty", true, false, false, true, "faculty approval step"],
//     [documentType.officialLetter, unitType.department, 3, position.viceChancellor, "parent_vice_chancellery", false, false, false, false, "optional vice-chancellor step"],
//     [documentType.officialLetter, unitType.department, 4, position.president, "university", false, false, true, false, "highest-level finalization"],
//     [documentType.officialLetter, unitType.faculty, 1, position.dean, "same_unit", true, false, true, false, "dean may finalize faculty letter"],
//     [documentType.officialLetter, unitType.faculty, 2, position.viceChancellor, "parent_vice_chancellery", false, false, true, false, "optional escalation"],
//     [documentType.committeeReport, unitType.committee, 1, position.committeeChair, "same_unit", true, false, false, true, "committee sign"],
//     [documentType.committeeReport, unitType.committee, 2, position.dean, "parent_faculty", true, false, true, false, "faculty final approval"],
//     [documentType.internalMemo, unitType.department, 1, position.departmentHead, "same_unit", true, false, true, true, "department memo final sign"],
//     [documentType.internalMemo, unitType.faculty, 1, position.dean, "same_unit", true, false, true, false, "faculty memo final sign"],
//     [documentType.reviewForm, unitType.department, 1, position.departmentHead, "same_unit", true, false, false, true, "first review sign"],
//     [documentType.reviewForm, unitType.department, 2, position.committeeChair, "configured_committee", true, true, false, true, "parallel committee endorsement"],
//     [documentType.reviewForm, unitType.department, 3, position.dean, "parent_faculty", true, false, true, false, "dean final approval"],
//     [documentType.acknowledgementSheet, unitType.faculty, 1, position.dean, "same_unit", true, true, false, true, "parallel acknowledgement"],
//     [documentType.policyApproval, unitType.university, 1, position.viceChancellor, "same_university", true, false, false, false, "university policy first sign"],
//     [documentType.policyApproval, unitType.university, 2, position.president, "same_university", true, false, true, false, "president final approval"]
//   ];

//   for (const [documentTypeId, originUnitTypeId, stepNumber, requiredPositionId, requiredUnitScope, required, parallel, finalizes, hiddenLater, notes] of rules) {
//     if (!documentTypeId || !requiredPositionId) {
//       continue;
//     }

//     await upsertSignatureRule(connection, {
//       document_type_id: documentTypeId,
//       origin_unit_type_id: originUnitTypeId,
//       step_number: stepNumber,
//       required_position_id: requiredPositionId,
//       required_unit_scope: requiredUnitScope,
//       is_required: required,
//       is_parallel: parallel,
//       can_finalize_document: finalizes,
//       can_be_hidden_later: hiddenLater,
//       notes
//     });
//   }

//   const existingSerialRule = await one(connection, "SELECT id FROM serial_rules WHERE code = ? LIMIT 1", ["default_yearly"]);
//   const serialParams = [
//     "Default Yearly Serial",
//     "DOC-{YEAR}-{SEQUENCE}",
//     "global",
//     "yearly",
//     6,
//     true,
//     "active",
//     "Default Phase 3 serial rule: global yearly sequence."
//   ];

//   if (existingSerialRule) {
//     await connection.execute(
//       `UPDATE serial_rules
//        SET name = ?, format = ?, scope = ?, reset_policy = ?, sequence_padding = ?,
//            is_default = ?, status = ?, activated_at = CURRENT_TIMESTAMP,
//            notes = ?, updated_at = CURRENT_TIMESTAMP
//        WHERE id = ?`,
//       [...serialParams, existingSerialRule.id]
//     );
//   } else {
//     await connection.execute(
//       `INSERT INTO serial_rules (
//         uuid, code, name, format, scope, reset_policy, sequence_padding,
//         is_default, status, activated_at, notes
//       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, ?)`,
//       [randomUUID(), "default_yearly", ...serialParams]
//     );
//   }
// }

// async function upsertVisibilityRule(connection, input) {
//   const existing = await one(
//     connection,
//     `SELECT id FROM visibility_rules
//      WHERE forwarding_unit_type_id <=> ?
//        AND document_type_id <=> ?
//        AND visibility_policy = ?
//      LIMIT 1`,
//     [input.forwarding_unit_type_id, input.document_type_id, input.visibility_policy]
//   );

//   const params = [
//     input.show_child_signatures,
//     input.show_parent_signatures,
//     input.allowed,
//     "active",
//     input.priority || 100,
//     input.notes || null,
//     JSON.stringify(input.conditions || {})
//   ];

//   if (existing) {
//     await connection.execute(
//       `UPDATE visibility_rules
//        SET show_child_signatures = ?, show_parent_signatures = ?, allowed = ?,
//            status = ?, priority = ?, activated_at = CURRENT_TIMESTAMP,
//            notes = ?, conditions = ?, updated_at = CURRENT_TIMESTAMP
//        WHERE id = ?`,
//       [...params, existing.id]
//     );
//     return Number(existing.id);
//   }

//   return insert(
//     connection,
//     `INSERT INTO visibility_rules (
//       uuid, forwarding_unit_type_id, document_type_id, visibility_policy,
//       show_child_signatures, show_parent_signatures, allowed, status, priority,
//       activated_at, notes, conditions
//     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, ?, ?)`,
//     [
//       randomUUID(),
//       input.forwarding_unit_type_id,
//       input.document_type_id,
//       input.visibility_policy,
//       ...params
//     ]
//   );
// }

// async function seedVisibilityArchiveAndAccess(connection) {
//   const unitType = {
//     department: await idByCode(connection, "unit_types", "department"),
//     faculty: await idByCode(connection, "unit_types", "faculty"),
//     viceChancellery: await idByCode(connection, "unit_types", "vice_chancellery"),
//     university: await idByCode(connection, "unit_types", "university"),
//     committee: await idByCode(connection, "unit_types", "committee")
//   };

//   const documentType = {
//     officialLetter: await idByCode(connection, "document_types", "official_letter"),
//     internalMemo: await idByCode(connection, "document_types", "internal_memo"),
//     committeeReport: await idByCode(connection, "document_types", "committee_report"),
//     confidentialMemo: await idByCode(connection, "document_types", "confidential_memo"),
//     policyApproval: await idByCode(connection, "document_types", "policy_approval_document")
//   };

//   const rules = [
//     [unitType.department, documentType.internalMemo, "show_all", true, false, "allowed", "internal origin copy"],
//     [unitType.faculty, documentType.officialLetter, "show_all", true, true, "allowed", "internal full view"],
//     [unitType.faculty, documentType.officialLetter, "hide_child_signatures", false, true, "allowed", "common upward or outward forwarding"],
//     [unitType.faculty, documentType.officialLetter, "show_parent_only", false, true, "allowed", "dean-only visible copy"],
//     [unitType.viceChancellery, documentType.officialLetter, "show_parent_only", false, true, "allowed", "VC-centered forwarded view"],
//     [unitType.university, documentType.officialLetter, "show_final_only", false, true, "allowed", "president-only formal outward render"],
//     [unitType.committee, documentType.committeeReport, "custom", true, true, "allowed", "committee/faculty policy"],
//     [unitType.faculty, documentType.committeeReport, "hide_child_signatures", false, true, "allowed", "child committee sign hidden at faculty level"],
//     [null, documentType.confidentialMemo, "custom_restricted", false, true, "conditional", "confidential documents require restricted rendering"],
//     [null, documentType.policyApproval, "show_final_only", false, true, "allowed", "final policy issuer visible only"]
//   ];

//   for (const [forwardingUnitTypeId, docTypeId, policy, showChild, showParent, allowed, notes] of rules) {
//     if (!docTypeId) {
//       continue;
//     }

//     await upsertVisibilityRule(connection, {
//       forwarding_unit_type_id: forwardingUnitTypeId,
//       document_type_id: docTypeId,
//       visibility_policy: policy,
//       show_child_signatures: showChild,
//       show_parent_signatures: showParent,
//       allowed,
//       notes
//     });
//   }

//   const existingRetention = await one(connection, "SELECT id FROM retention_policies WHERE code = ? LIMIT 1", ["default_archive_review"]);
//   const retentionParams = [
//     "Default Archive Review",
//     120,
//     "review",
//     true,
//     "active",
//     "Default archive retention policy: review after 10 years."
//   ];

//   if (existingRetention) {
//     await connection.execute(
//       `UPDATE retention_policies
//        SET name = ?, retention_months = ?, disposition_action = ?, is_default = ?,
//            status = ?, description = ?, updated_at = CURRENT_TIMESTAMP
//        WHERE id = ?`,
//       [...retentionParams, existingRetention.id]
//     );
//   } else {
//     await connection.execute(
//       `INSERT INTO retention_policies (
//         uuid, code, name, retention_months, disposition_action, is_default, status, description
//       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
//       [randomUUID(), "default_archive_review", ...retentionParams]
//     );
//   }

//   const systemAdminRoleId = await idByName(connection, "roles", "system_admin");
//   const adminStaffRoleId = await idByName(connection, "roles", "admin_staff");
//   const normalLevelId = await idByCode(connection, "confidentiality_levels", "normal");
//   const internalLevelId = await idByCode(connection, "confidentiality_levels", "internal");
//   const confidentialLevelId = await idByCode(connection, "confidentiality_levels", "confidential");
//   const restrictedLevelId = await idByCode(connection, "confidentiality_levels", "restricted");

//   const accessRules = [
//     [normalLevelId, "role", systemAdminRoleId, "full", true, true, true, false],
//     [normalLevelId, "role", adminStaffRoleId, "full", true, true, true, false],
//     [internalLevelId, "role", systemAdminRoleId, "full", true, true, true, true],
//     [internalLevelId, "role", adminStaffRoleId, "full", true, true, false, true],
//     [confidentialLevelId, "role", systemAdminRoleId, "full", true, true, true, true],
//     [confidentialLevelId, "role", adminStaffRoleId, "metadata", false, false, false, true],
//     [restrictedLevelId, "role", systemAdminRoleId, "full", true, true, true, true]
//   ];

//   for (const [levelId, subjectType, roleId, accessLevel, canView, canDownload, canPrint, requiresLog] of accessRules) {
//     if (!levelId || !roleId) {
//       continue;
//     }

//     const existing = await one(
//       connection,
//       `SELECT id FROM confidentiality_access_rules
//        WHERE confidentiality_level_id = ? AND subject_type = ? AND role_id = ?
//        LIMIT 1`,
//       [levelId, subjectType, roleId]
//     );

//     const params = [
//       accessLevel,
//       canView,
//       canDownload,
//       canPrint,
//       requiresLog,
//       "active"
//     ];

//     if (existing) {
//       await connection.execute(
//         `UPDATE confidentiality_access_rules
//          SET access_level = ?, can_view_content = ?, can_download = ?,
//              can_print = ?, requires_access_log = ?, status = ?,
//              updated_at = CURRENT_TIMESTAMP
//          WHERE id = ?`,
//         [...params, existing.id]
//       );
//     } else {
//       await connection.execute(
//         `INSERT INTO confidentiality_access_rules (
//           uuid, confidentiality_level_id, subject_type, role_id, access_level,
//           can_view_content, can_download, can_print, requires_access_log, status
//         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
//         [randomUUID(), levelId, subjectType, roleId, ...params]
//       );
//     }
//   }
// }

// function defaultTemplateLayout() {
//   return {
//     page: {
//       widthMm: 210,
//       heightMm: 297,
//       direction: "rtl",
//       backgroundColor: "#ffffff",
//       marginTopMm: 14,
//       marginRightMm: 16,
//       marginBottomMm: 14,
//       marginLeftMm: 16
//     },
//     blocks: [
//       { id: "seed-logo-left", type: "logo", x: 16, y: 12, width: 24, height: 24, src: "", style: { borderWidth: 0 } },
//       { id: "seed-title", type: "text", x: 52, y: 13, width: 106, height: 18, content: "DocChain University\nOfficial Correspondence", style: { fontSize: 13, fontWeight: "700", textAlign: "center" } },
//       { id: "seed-logo-right", type: "logo", x: 170, y: 12, width: 24, height: 24, src: "", style: { borderWidth: 0 } },
//       { id: "seed-ref", type: "dynamic_field", x: 22, y: 38, width: 72, height: 8, field: "document.internal_reference", style: { fontSize: 9, textAlign: "start" } },
//       { id: "seed-serial", type: "dynamic_field", x: 116, y: 38, width: 72, height: 8, field: "document.official_serial", style: { fontSize: 9, textAlign: "end" } },
//       { id: "seed-subject", type: "dynamic_field", x: 24, y: 52, width: 162, height: 12, field: "document.subject", style: { fontSize: 12, fontWeight: "700", textAlign: "center" } },
//       { id: "seed-body", type: "dynamic_field", x: 26, y: 74, width: 158, height: 104, field: "document.body", style: { fontSize: 11, textAlign: "start" } },
//       { id: "seed-signature", type: "signature_zone", x: 72, y: 202, width: 72, height: 34, mode: "completed", limit: 4, style: { fontSize: 10, textAlign: "center" } },
//       { id: "seed-copy", type: "cc_list", x: 24, y: 242, width: 72, height: 18, content: "Copies / CC", style: { fontSize: 9, textAlign: "start" } },
//       { id: "seed-footer-line", type: "line", x: 16, y: 268, width: 178, height: 1, style: { borderWidth: 1, borderColor: "#0f172a" } },
//       { id: "seed-footer", type: "text", x: 20, y: 272, width: 170, height: 8, content: "Address | Phone | Email | Website", style: { fontSize: 8, textAlign: "center" } }
//     ]
//   };
// }

// async function seedDocumentTemplates(connection) {
//   const adminUser = await one(connection, "SELECT id FROM users WHERE username = ? LIMIT 1", [process.env.SEED_ADMIN_USERNAME || "admin"]);
//   if (!adminUser) {
//     return;
//   }

//   const adminAssignment = await one(
//     connection,
//     "SELECT id FROM assignments WHERE created_by_user_id = ? ORDER BY is_primary DESC, id ASC LIMIT 1",
//     [adminUser.id]
//   );

//   const existingTemplate = await one(connection, "SELECT id, current_version_id FROM document_templates WHERE name = ? LIMIT 1", ["Default Official A4 Letter"]);
//   let templateId = existingTemplate ? Number(existingTemplate.id) : 0;
//   let versionId = existingTemplate?.current_version_id ? Number(existingTemplate.current_version_id) : 0;

//   if (!templateId) {
//     templateId = await insert(
//       connection,
//       `INSERT INTO document_templates (
//         uuid, owner_user_id, owner_assignment_id, name, description, status, visibility
//       ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
//       [
//         randomUUID(),
//         adminUser.id,
//         adminAssignment?.id || null,
//         "Default Official A4 Letter",
//         "Seeded A4 official letter template for local development.",
//         "published",
//         "public"
//       ]
//     );
//   }

//   if (!versionId) {
//     versionId = await insert(
//       connection,
//       `INSERT INTO document_template_versions (
//         uuid, template_id, version_number, status, layout_definition, created_by_user_id,
//         submitted_at, submitted_by_user_id, reviewed_at, reviewed_by_user_id
//       ) VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, ?, CURRENT_TIMESTAMP, ?)`,
//       [
//         randomUUID(),
//         templateId,
//         1,
//         "active",
//         JSON.stringify(defaultTemplateLayout()),
//         adminUser.id,
//         adminUser.id,
//         adminUser.id
//       ]
//     );

//     await connection.execute(
//       "UPDATE document_templates SET current_version_id = ?, status = 'published', visibility = 'public', updated_at = CURRENT_TIMESTAMP WHERE id = ?",
//       [versionId, templateId]
//     );
//   }

//   const existingBinding = await one(
//     connection,
//     `SELECT id FROM document_template_bindings
//      WHERE document_type_id IS NULL AND locale = 'all' AND variant = 'official' AND status = 'active'
//      LIMIT 1`
//   );

//   if (!existingBinding) {
//     await connection.execute(
//       `INSERT INTO document_template_bindings (
//         uuid, document_type_id, locale, variant, template_id, template_version_id, status, created_by_user_id
//       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
//       [randomUUID(), null, "all", "official", templateId, versionId, "active", adminUser.id]
//     );
//   }
// }

async function main() {
  const connection = await mysql.createConnection(connectionConfig());
  try {
    await connection.beginTransaction();
    await seedFoundation(connection);
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
