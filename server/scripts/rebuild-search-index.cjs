const mysql = require("mysql2/promise");
const path = require("node:path");
require("dotenv").config({ path: path.resolve(process.cwd(), ".env") });

function sslConfig() {
  return process.env.DB_SSL === "true" ? { minVersion: "TLSv1.2" } : undefined;
}

function connectionConfig() {
  return {
    host: process.env.DB_HOST || "127.0.0.1",
    port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER || "root",
    password: process.env.DB_PASSWORD || "",
    database: process.env.DB_NAME || "docchain_express",
    ssl: sslConfig(),
    charset: "utf8mb4",
    timezone: "Z"
  };
}

function text(value) {
  return value === undefined || value === null ? "" : String(value);
}

function page(id, title, subtitle, routePath, keywords) {
  return { entityType: "admin_page", entityId: id, title, subtitle, body: subtitle, keywords, routePath, status: "active", metadata: {} };
}

const adminPages = [
  page("dashboard", "Dashboard", "Administrative overview", "/admin/dashboard", "overview structure users workflow signatures reports"),
  page("organizations", "Organizations", "Organizations and structural metadata", "/admin/organizations", "organization university unit hierarchy structure"),
  page("units", "Units & Hierarchy", "University hierarchy map", "/admin/units", "unit hierarchy department faculty office committee"),
  page("users", "Users", "User accounts and access", "/admin/users", "user account person role login access"),
  page("positions", "Positions", "Positions and authority", "/admin/positions", "position authority signing role title"),
  page("assignments", "Assignments", "Position holders and delegations", "/admin/assignments", "assignment holder delegation active position person"),
  page("serial-settings", "Serial Settings", "Official number rules", "/admin/serial-settings", "serial official number registry"),
  page("document-types", "Document Types", "Document type governance", "/admin/document-types", "document type template serial workflow"),
  page("document-settings", "Document Settings", "Priority and confidentiality levels", "/admin/document-settings", "priority confidentiality levels default document dropdown settings"),
  page("templates", "Templates", "Document templates and bindings", "/admin/templates", "template layout render document"),
  page("audit-logs", "Audit Logs", "Administrative audit events", "/admin/audit-logs", "audit log history activity"),
  page("reports", "Reports", "Administrative reporting", "/admin/reports", "report analytics export"),
  page("settings", "Settings", "Administrative settings", "/admin/settings", "settings preferences configuration")
];

async function upsert(connection, record) {
  await connection.execute(
    `INSERT INTO global_search_index (
      entity_type, entity_id, title, subtitle, body, keywords, route_path,
      status, metadata, source_created_at, source_updated_at, indexed_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    ON DUPLICATE KEY UPDATE
      title = VALUES(title), subtitle = VALUES(subtitle), body = VALUES(body),
      keywords = VALUES(keywords), route_path = VALUES(route_path), status = VALUES(status),
      metadata = VALUES(metadata), source_created_at = VALUES(source_created_at),
      source_updated_at = VALUES(source_updated_at), indexed_at = CURRENT_TIMESTAMP,
      updated_at = CURRENT_TIMESTAMP`,
    [
      record.entityType,
      String(record.entityId),
      record.title,
      record.subtitle || null,
      record.body || null,
      record.keywords || null,
      record.routePath,
      record.status || null,
      JSON.stringify(record.metadata || {}),
      record.sourceCreatedAt || null,
      record.sourceUpdatedAt || null
    ]
  );
}

async function main() {
  const connection = await mysql.createConnection(connectionConfig());
  try {
    await connection.execute("TRUNCATE TABLE global_search_index");
    for (const item of adminPages) {
      await upsert(connection, item);
    }

    const [documents] = await connection.execute(
      `SELECT
         documents.*,
         document_types.name AS documentTypeName,
         origin_units.name AS originUnitName,
         owner_units.name AS ownerUnitName,
         holder_units.name AS currentHolderUnitName,
         walk_in_requests.id AS walkInRequestId,
         requester_persons.first_name AS requesterFirstName,
         requester_persons.last_name AS requesterLastName,
         requester_persons.father_name AS requesterFatherName,
         requester_persons.phone_number AS requesterPhoneNumber,
         requester_persons.tazkira_number AS requesterTazkiraNumber,
         subject_persons.first_name AS subjectFirstName,
         subject_persons.last_name AS subjectLastName,
         subject_persons.father_name AS subjectFatherName,
         subject_persons.phone_number AS subjectPhoneNumber,
         subject_persons.tazkira_number AS subjectTazkiraNumber,
         taker_persons.first_name AS takerFirstName,
         taker_persons.last_name AS takerLastName,
         taker_persons.father_name AS takerFatherName,
         taker_persons.phone_number AS takerPhoneNumber,
         taker_persons.tazkira_number AS takerTazkiraNumber
       FROM documents
       INNER JOIN document_types ON documents.document_type_id = document_types.id
       INNER JOIN units AS origin_units ON documents.origin_unit_id = origin_units.id
       INNER JOIN units AS owner_units ON documents.owner_unit_id = owner_units.id
       INNER JOIN units AS holder_units ON documents.current_holder_unit_id = holder_units.id
       LEFT JOIN document_issuance_requests AS walk_in_requests ON walk_in_requests.document_id = documents.id
       LEFT JOIN external_persons AS requester_persons ON walk_in_requests.requester_person_id = requester_persons.id
       LEFT JOIN external_persons AS subject_persons ON walk_in_requests.subject_person_id = subject_persons.id
       LEFT JOIN external_persons AS taker_persons ON walk_in_requests.taker_person_id = taker_persons.id
       WHERE documents.deleted_at IS NULL`
    );
    for (const row of documents) {
      const walkInIdentityText = [
        row.requesterFirstName, row.requesterLastName, row.requesterFatherName, row.requesterPhoneNumber, row.requesterTazkiraNumber,
        row.subjectFirstName, row.subjectLastName, row.subjectFatherName, row.subjectPhoneNumber, row.subjectTazkiraNumber,
        row.takerFirstName, row.takerLastName, row.takerFatherName, row.takerPhoneNumber, row.takerTazkiraNumber
      ].map(text).join(" ");
      await upsert(connection, {
        body: [row.summary, row.body, row.originUnitName, row.ownerUnitName, row.currentHolderUnitName, walkInIdentityText].map(text).join(" "),
        entityId: row.id,
        entityType: "document",
        keywords: [row.internal_reference, row.official_serial, row.documentTypeName, row.status, walkInIdentityText].map(text).join(" "),
        metadata: { documentTypeName: row.documentTypeName, internalReference: row.internal_reference, officialSerial: row.official_serial || null, walkInRequestId: row.walkInRequestId || null },
        routePath: `/admin/search?type=document&id=${row.id}`,
        sourceCreatedAt: row.created_at,
        sourceUpdatedAt: row.updated_at,
        status: row.status,
        subtitle: row.internal_reference,
        title: row.subject
      });
    }

    const [users] = await connection.execute(
      `SELECT users.*, persons.display_name AS personDisplayName, persons.employee_code AS employeeCode, persons.phone AS phone
       FROM users INNER JOIN persons ON users.person_id = persons.id
       WHERE users.deleted_at IS NULL`
    );
    for (const row of users) {
      await upsert(connection, {
        body: [row.email, row.username, row.employeeCode, row.phone].map(text).join(" "),
        entityId: row.id,
        entityType: "user",
        keywords: "user person account access login",
        metadata: { email: row.email, username: row.username },
        routePath: "/admin/users",
        sourceCreatedAt: row.created_at,
        sourceUpdatedAt: row.updated_at,
        status: row.status,
        subtitle: row.email,
        title: row.personDisplayName
      });
    }

    const simpleSources = [
      { type: "organization", path: "/admin/organizations", sql: "SELECT id, code, name AS title, name_local AS subtitle, description AS body, status, created_at, updated_at FROM organizations WHERE deleted_at IS NULL", keywords: "organization university" },
      { type: "position", path: "/admin/positions", sql: "SELECT id, code, title, title_local AS subtitle, description AS body, status, created_at, updated_at FROM positions WHERE deleted_at IS NULL", keywords: "position authority signing" },
      { type: "document_type", path: "/admin/document-types", sql: "SELECT id, code, name AS title, description AS body, status, created_at, updated_at FROM document_types", keywords: "document type serial workflow" }
    ];
    for (const source of simpleSources) {
      const [rows] = await connection.execute(source.sql);
      for (const row of rows) {
        await upsert(connection, {
          body: row.body,
          entityId: row.id,
          entityType: source.type,
          keywords: [row.code, source.keywords].map(text).join(" "),
          routePath: source.path,
          sourceCreatedAt: row.created_at,
          sourceUpdatedAt: row.updated_at,
          status: row.status,
          subtitle: row.subtitle || row.code,
          title: row.title
        });
      }
    }

    const [units] = await connection.execute(
      `SELECT units.*, unit_types.name AS unitTypeName, parent_units.name AS parentUnitName, organizations.name AS organizationName
       FROM units
       INNER JOIN unit_types ON units.unit_type_id = unit_types.id
       INNER JOIN organizations ON units.organization_id = organizations.id
       LEFT JOIN units AS parent_units ON units.parent_unit_id = parent_units.id
       WHERE units.deleted_at IS NULL`
    );
    for (const row of units) {
      await upsert(connection, {
        body: [row.name_local, row.description, row.parentUnitName, row.organizationName].map(text).join(" "),
        entityId: row.id,
        entityType: "unit",
        keywords: [row.code, row.unitTypeName, "unit hierarchy"].map(text).join(" "),
        metadata: { unitTypeName: row.unitTypeName },
        routePath: "/admin/units",
        sourceCreatedAt: row.created_at,
        sourceUpdatedAt: row.updated_at,
        status: row.status,
        subtitle: `${row.unitTypeName || "Unit"} - ${row.code}`,
        title: row.name
      });
    }

    const [assignments] = await connection.execute(
      `SELECT assignments.*, persons.display_name AS personDisplayName, units.name AS unitName, positions.title AS positionTitle
       FROM assignments
       INNER JOIN persons ON assignments.person_id = persons.id
       INNER JOIN positions ON assignments.position_id = positions.id
       INNER JOIN units ON positions.unit_id = units.id
       WHERE assignments.deleted_at IS NULL`
    );
    for (const row of assignments) {
      await upsert(connection, {
        body: [row.unitName, row.positionTitle, row.uuid].map(text).join(" "),
        entityId: row.id,
        entityType: "assignment",
        keywords: [row.is_primary ? "primary assignment" : "assignment", row.starts_at, row.ends_at].map(text).join(" "),
        metadata: { unitName: row.unitName, positionTitle: row.positionTitle },
        routePath: "/admin/assignments",
        sourceCreatedAt: row.created_at,
        sourceUpdatedAt: row.updated_at,
        status: row.status,
        subtitle: `${row.positionTitle} - ${row.unitName}`,
        title: row.personDisplayName
      });
    }

    console.log(`Search index rebuilt with ${(await connection.execute("SELECT COUNT(*) AS count FROM global_search_index"))[0][0].count} records.`);
  } finally {
    await connection.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
