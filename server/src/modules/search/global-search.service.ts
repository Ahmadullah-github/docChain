import type { ResultSetHeader, RowDataPacket } from "mysql2/promise";
import { pool } from "../../db/mysql";

export type SearchEntityType =
  | "admin_page"
  | "assignment"
  | "document"
  | "document_type"
  | "organization"
  | "position"
  | "unit"
  | "user";

export type GlobalSearchRecord = {
  entityType: SearchEntityType;
  entityId: string | number;
  title: string;
  subtitle?: string | null;
  body?: string | null;
  keywords?: string | null;
  routePath: string;
  status?: string | null;
  metadata?: Record<string, unknown> | null;
  sourceCreatedAt?: string | Date | null;
  sourceUpdatedAt?: string | Date | null;
};

export type GlobalSearchResult = {
  id: number;
  entityType: SearchEntityType;
  entityId: string;
  title: string;
  subtitle?: string | null;
  snippet?: string | null;
  status?: string | null;
  routePath: string;
  score: number;
  metadata: Record<string, unknown>;
};

const adminPages: GlobalSearchRecord[] = [
  page("dashboard", "Dashboard", "Administrative overview", "/admin/dashboard", "overview structure users workflow signatures reports"),
  page("organizations", "Organizations", "Organizations and structural metadata", "/admin/organizations", "organization university unit hierarchy structure"),
  page("units", "Units & Hierarchy", "University hierarchy map", "/admin/units", "unit hierarchy department faculty office committee"),
  page("users", "Users", "User accounts and access", "/admin/users", "user account person role login access"),
  page("positions", "Positions", "Positions and authority", "/admin/positions", "position authority signing role title"),
  page("assignments", "Assignments", "Position holders and delegations", "/admin/assignments", "assignment holder delegation active position person"),
  page("serial-settings", "Serial Settings", "Official number rules", "/admin/serial-settings", "serial official number registry"),
  page("document-types", "Document Types", "Document type governance", "/admin/document-types", "document type template serial workflow"),
  page("templates", "Templates", "Document templates and bindings", "/admin/templates", "template layout render document"),
  page("audit-logs", "Audit Logs", "Administrative audit events", "/admin/audit-logs", "audit log history activity"),
  page("reports", "Reports", "Administrative reporting", "/admin/reports", "report analytics export"),
  page("settings", "Settings", "Administrative settings", "/admin/settings", "settings preferences configuration")
];

function page(id: string, title: string, subtitle: string, routePath: string, keywords: string): GlobalSearchRecord {
  return {
    body: subtitle,
    entityId: id,
    entityType: "admin_page",
    keywords,
    routePath,
    status: "active",
    subtitle,
    title
  };
}

function text(value: unknown) {
  return value === undefined || value === null ? "" : String(value);
}

function routeFor(record: Pick<GlobalSearchRecord, "entityType" | "entityId" | "routePath">) {
  if (record.routePath) {
    return record.routePath;
  }

  switch (record.entityType) {
    case "admin_page":
      return `/admin/${record.entityId}`;
    case "assignment":
      return "/admin/assignments";
    case "document":
      return `/admin/search?type=document&id=${encodeURIComponent(String(record.entityId))}`;
    case "document_type":
      return "/admin/document-types";
    case "organization":
      return "/admin/organizations";
    case "position":
      return "/admin/positions";
    case "unit":
      return "/admin/units";
    case "user":
      return "/admin/users";
    default:
      return "/admin/search";
  }
}

export async function upsertSearchRecord(record: GlobalSearchRecord) {
  const metadata = JSON.stringify(record.metadata || {});
  await pool.execute<ResultSetHeader>(
    `INSERT INTO global_search_index (
      entity_type, entity_id, title, subtitle, body, keywords, route_path,
      status, metadata, source_created_at, source_updated_at, indexed_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    ON DUPLICATE KEY UPDATE
      title = VALUES(title),
      subtitle = VALUES(subtitle),
      body = VALUES(body),
      keywords = VALUES(keywords),
      route_path = VALUES(route_path),
      status = VALUES(status),
      metadata = VALUES(metadata),
      source_created_at = VALUES(source_created_at),
      source_updated_at = VALUES(source_updated_at),
      indexed_at = CURRENT_TIMESTAMP,
      updated_at = CURRENT_TIMESTAMP`,
    [
      record.entityType,
      String(record.entityId),
      record.title,
      record.subtitle || null,
      record.body || null,
      record.keywords || null,
      routeFor(record),
      record.status || null,
      metadata,
      record.sourceCreatedAt || null,
      record.sourceUpdatedAt || null
    ]
  );
}

async function removeSearchRecord(entityType: SearchEntityType, entityId: string | number) {
  await pool.execute<ResultSetHeader>(
    "DELETE FROM global_search_index WHERE entity_type = ? AND entity_id = ?",
    [entityType, String(entityId)]
  );
}

async function fetchRows(sql: string, params: any[] = []) {
  const [rows] = await pool.execute<RowDataPacket[]>(sql, params);
  return rows;
}

async function recordForEntity(entityType: SearchEntityType, entityId: string | number): Promise<GlobalSearchRecord | null> {
  switch (entityType) {
    case "document": {
      const row = (await fetchRows(
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
        WHERE documents.id = ? AND documents.deleted_at IS NULL
        LIMIT 1`,
        [entityId]
      ))[0];
      if (!row) return null;
      const walkInIdentityText = [
        row.requesterFirstName, row.requesterLastName, row.requesterFatherName, row.requesterPhoneNumber, row.requesterTazkiraNumber,
        row.subjectFirstName, row.subjectLastName, row.subjectFatherName, row.subjectPhoneNumber, row.subjectTazkiraNumber,
        row.takerFirstName, row.takerLastName, row.takerFatherName, row.takerPhoneNumber, row.takerTazkiraNumber
      ].map(text).join(" ");
      return {
        body: [row.summary, row.body, row.originUnitName, row.ownerUnitName, row.currentHolderUnitName, walkInIdentityText].map(text).join(" "),
        entityId,
        entityType,
        keywords: [row.internal_reference, row.official_serial, row.documentTypeName, row.status, walkInIdentityText].map(text).join(" "),
        metadata: {
          documentTypeName: row.documentTypeName,
          internalReference: row.internal_reference,
          officialSerial: row.official_serial || null,
          walkInRequestId: row.walkInRequestId || null
        },
        routePath: `/admin/search?type=document&id=${entityId}`,
        sourceCreatedAt: row.created_at,
        sourceUpdatedAt: row.updated_at,
        status: row.status,
        subtitle: row.internal_reference,
        title: row.subject
      };
    }

    case "user": {
      const row = (await fetchRows(
        `SELECT
          users.*,
          persons.display_name AS personDisplayName,
          persons.employee_code AS employeeCode,
          persons.phone AS phone
        FROM users
        INNER JOIN persons ON users.person_id = persons.id
        WHERE users.id = ? AND users.deleted_at IS NULL
        LIMIT 1`,
        [entityId]
      ))[0];
      if (!row) return null;
      return {
        body: [row.email, row.username, row.employeeCode, row.phone].map(text).join(" "),
        entityId,
        entityType,
        keywords: "user person account access login",
        metadata: { email: row.email, username: row.username },
        routePath: "/admin/users",
        sourceCreatedAt: row.created_at,
        sourceUpdatedAt: row.updated_at,
        status: row.status,
        subtitle: row.email,
        title: row.personDisplayName
      };
    }

    case "organization": {
      const row = (await fetchRows("SELECT * FROM organizations WHERE id = ? AND deleted_at IS NULL LIMIT 1", [entityId]))[0];
      if (!row) return null;
      return {
        body: [row.name_local, row.description].map(text).join(" "),
        entityId,
        entityType,
        keywords: [row.code, "organization university"].map(text).join(" "),
        routePath: "/admin/organizations",
        sourceCreatedAt: row.created_at,
        sourceUpdatedAt: row.updated_at,
        status: row.status,
        subtitle: row.code,
        title: row.name
      };
    }

    case "unit": {
      const row = (await fetchRows(
        `SELECT units.*, unit_types.name AS unitTypeName, parent_units.name AS parentUnitName, organizations.name AS organizationName
         FROM units
         INNER JOIN unit_types ON units.unit_type_id = unit_types.id
         INNER JOIN organizations ON units.organization_id = organizations.id
         LEFT JOIN units AS parent_units ON units.parent_unit_id = parent_units.id
         WHERE units.id = ? AND units.deleted_at IS NULL
         LIMIT 1`,
        [entityId]
      ))[0];
      if (!row) return null;
      return {
        body: [row.name_local, row.description, row.parentUnitName, row.organizationName].map(text).join(" "),
        entityId,
        entityType,
        keywords: [row.code, row.unitTypeName, "unit hierarchy"].map(text).join(" "),
        metadata: { unitTypeName: row.unitTypeName },
        routePath: "/admin/units",
        sourceCreatedAt: row.created_at,
        sourceUpdatedAt: row.updated_at,
        status: row.status,
        subtitle: `${row.unitTypeName || "Unit"} - ${row.code}`,
        title: row.name
      };
    }

    case "position": {
      const row = (await fetchRows("SELECT * FROM positions WHERE id = ? AND deleted_at IS NULL LIMIT 1", [entityId]))[0];
      if (!row) return null;
      return {
        body: [row.title_local, row.description].map(text).join(" "),
        entityId,
        entityType,
        keywords: [row.code, row.authority_level, row.is_signing_authority ? "signing authority" : ""].map(text).join(" "),
        metadata: { authorityLevel: row.authority_level, canSign: Boolean(row.is_signing_authority) },
        routePath: "/admin/positions",
        sourceCreatedAt: row.created_at,
        sourceUpdatedAt: row.updated_at,
        status: row.status,
        subtitle: row.code,
        title: row.title
      };
    }

    case "assignment": {
      const row = (await fetchRows(
        `SELECT assignments.*, persons.display_name AS personDisplayName, units.name AS unitName, positions.title AS positionTitle
         FROM assignments
         INNER JOIN persons ON assignments.person_id = persons.id
         INNER JOIN positions ON assignments.position_id = positions.id
         INNER JOIN units ON positions.unit_id = units.id
         WHERE assignments.id = ? AND assignments.deleted_at IS NULL
         LIMIT 1`,
        [entityId]
      ))[0];
      if (!row) return null;
      return {
        body: [row.unitName, row.positionTitle, row.uuid].map(text).join(" "),
        entityId,
        entityType,
        keywords: [row.is_primary ? "primary assignment" : "assignment", row.starts_at, row.ends_at].map(text).join(" "),
        metadata: { unitName: row.unitName, positionTitle: row.positionTitle },
        routePath: "/admin/assignments",
        sourceCreatedAt: row.created_at,
        sourceUpdatedAt: row.updated_at,
        status: row.status,
        subtitle: `${row.positionTitle} - ${row.unitName}`,
        title: row.personDisplayName
      };
    }

    case "document_type": {
      const row = (await fetchRows("SELECT * FROM document_types WHERE id = ? LIMIT 1", [entityId]))[0];
      if (!row) return null;
      return {
        body: row.description,
        entityId,
        entityType,
        keywords: [row.code, row.requires_serial ? "requires serial" : "", "document type"].map(text).join(" "),
        routePath: "/admin/document-types",
        status: row.status,
        subtitle: row.code,
        title: row.name
      };
    }

    case "admin_page":
      return adminPages.find((item) => String(item.entityId) === String(entityId)) || null;

    default:
      return null;
  }
}

export async function refreshSearchIndexForEntity(entityType: SearchEntityType, entityId: string | number) {
  const record = await recordForEntity(entityType, entityId);
  if (!record) {
    await removeSearchRecord(entityType, entityId);
    return;
  }

  await upsertSearchRecord(record);
}

export async function refreshSearchIndexForEntitySafe(entityType: SearchEntityType, entityId: string | number) {
  try {
    await refreshSearchIndexForEntity(entityType, entityId);
  } catch {
    // Search indexing is best-effort; source writes must not fail because of index drift.
  }
}

export async function rebuildGlobalSearchIndex() {
  await pool.execute("TRUNCATE TABLE global_search_index");

  for (const record of adminPages) {
    await upsertSearchRecord(record);
  }

  const entityQueries: Array<{ type: SearchEntityType; sql: string }> = [
    { type: "document", sql: "SELECT id FROM documents WHERE deleted_at IS NULL" },
    { type: "user", sql: "SELECT id FROM users WHERE deleted_at IS NULL" },
    { type: "organization", sql: "SELECT id FROM organizations WHERE deleted_at IS NULL" },
    { type: "unit", sql: "SELECT id FROM units WHERE deleted_at IS NULL" },
    { type: "position", sql: "SELECT id FROM positions WHERE deleted_at IS NULL" },
    { type: "assignment", sql: "SELECT id FROM assignments WHERE deleted_at IS NULL" },
    { type: "document_type", sql: "SELECT id FROM document_types" }
  ];

  for (const item of entityQueries) {
    const rows = await fetchRows(item.sql);
    for (const row of rows) {
      await refreshSearchIndexForEntity(item.type, row.id);
    }
  }
}

function parseMetadata(value: unknown): Record<string, unknown> {
  if (!value) {
    return {};
  }

  if (typeof value === "object") {
    return value as Record<string, unknown>;
  }

  try {
    return JSON.parse(String(value)) as Record<string, unknown>;
  } catch {
    return {};
  }
}

function snippetFor(row: RowDataPacket, query: string) {
  const source = [row.subtitle, row.body, row.keywords].map(text).join(" ").replace(/\s+/g, " ").trim();
  if (!source) {
    return null;
  }

  const index = source.toLowerCase().indexOf(query.toLowerCase());
  if (index < 0) {
    return source.slice(0, 180);
  }

  return source.slice(Math.max(0, index - 55), index + query.length + 125);
}

export async function searchGlobalIndex(input: { q: string; types?: SearchEntityType[]; limit?: number }) {
  const query = input.q.trim();
  if (query.length < 2) {
    return [] as GlobalSearchResult[];
  }

  const limit = Math.min(Math.max(input.limit || 20, 1), 50);
  const types = input.types?.filter(Boolean) || [];
  const whereParams: any[] = [];
  const where = ["(MATCH(title, subtitle, body, keywords) AGAINST (? IN BOOLEAN MODE) OR title LIKE ? OR subtitle LIKE ? OR keywords LIKE ?)"];
  const booleanQuery = query
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => {
      const cleaned = part.replace(/[+-><()~*\"@]/g, "");
      if (!cleaned) {
        return "";
      }
      return /^[0-9]+$/.test(cleaned) ? cleaned : `${cleaned}*`;
    })
    .filter(Boolean)
    .join(" ");
  const like = `%${query}%`;
  whereParams.push(booleanQuery || query, like, like, like);

  if (types.length) {
    where.push(`entity_type IN (${types.map(() => "?").join(", ")})`);
    whereParams.push(...types);
  }

  const limitSql = String(limit);
  const [rows] = await pool.execute<RowDataPacket[]>(
    `SELECT
      id,
      entity_type AS entityType,
      entity_id AS entityId,
      title,
      subtitle,
      body,
      keywords,
      route_path AS routePath,
      status,
      metadata,
      MATCH(title, subtitle, body, keywords) AGAINST (? IN BOOLEAN MODE) AS score
     FROM global_search_index
     WHERE ${where.join(" AND ")}
     ORDER BY score DESC, updated_at DESC, id DESC
     LIMIT ${limitSql}`,
    [booleanQuery || query, ...whereParams]
  );

  return rows.map((row) => ({
    entityId: String(row.entityId),
    entityType: row.entityType,
    id: Number(row.id),
    metadata: parseMetadata(row.metadata),
    routePath: row.routePath,
    score: Number(row.score || 0),
    snippet: snippetFor(row, query),
    status: row.status || null,
    subtitle: row.subtitle || null,
    title: row.title
  }));
}
