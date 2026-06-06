import { randomUUID } from "node:crypto";
import { spawnSync } from "node:child_process";
import type { Server } from "node:http";
import type { RowDataPacket } from "mysql2/promise";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const integrationEnv = {
  NODE_ENV: "test",
  DB_NAME: "docchain_test",
  LOG_LEVEL: "silent",
  SESSION_SECRET: "docchain-integration-session-secret",
  SIGNATURE_ENCRYPTION_KEY: "docchain-integration-signature-encryption-key",
  SEED_ADMIN_EMAIL: "admin@docchain.local",
  SEED_ADMIN_USERNAME: "admin",
  SEED_ADMIN_PASSWORD: "Admin@12345"
} as const;

for (const [key, value] of Object.entries(integrationEnv)) {
  process.env[key] = value;
}

type JsonRecord = Record<string, any>;

type TestServer = {
  baseUrl: string;
  closePool: () => Promise<void>;
  server: Server;
};

class TestClient {
  private cookie = "";
  private csrfToken = "";

  constructor(private readonly baseUrl: string) {}

  async login(identifier: string, password: string) {
    const session = await this.post<JsonRecord>("/api/auth/login", { identifier, password }, false);
    this.csrfToken = String(session.csrfToken || "");
    return session;
  }

  get<T>(path: string) {
    return this.request<T>("GET", path);
  }

  post<T>(path: string, body?: unknown, includeCsrf = true) {
    return this.request<T>("POST", path, body, includeCsrf);
  }

  postError(path: string, body?: unknown, includeCsrf = true) {
    return this.requestError("POST", path, body, includeCsrf);
  }

  private async request<T>(method: string, path: string, body?: unknown, includeCsrf = true): Promise<T> {
    const { payload, response } = await this.fetchJson<T>(method, path, body, includeCsrf);
    if (!response.ok) {
      const code = payload?.error?.code || "request_failed";
      const message = payload?.error?.message || `Request failed with status ${response.status}`;
      throw new Error(`${method} ${path} failed: ${code} - ${message}`);
    }

    return payload?.data as T;
  }

  private async requestError(method: string, path: string, body?: unknown, includeCsrf = true) {
    const { payload, response } = await this.fetchJson<JsonRecord>(method, path, body, includeCsrf);
    if (response.ok) {
      throw new Error(`${method} ${path} unexpectedly succeeded.`);
    }

    return {
      code: payload?.error?.code || "request_failed",
      message: payload?.error?.message || `Request failed with status ${response.status}`,
      status: response.status
    };
  }

  private async fetchJson<T>(method: string, path: string, body?: unknown, includeCsrf = true) {
    const headers = new Headers();
    headers.set("accept", "application/json");
    headers.set("accept-language", "en");

    if (this.cookie) {
      headers.set("cookie", this.cookie);
    }
    if (body !== undefined) {
      headers.set("content-type", "application/json");
    }
    if (includeCsrf && !["GET", "HEAD", "OPTIONS"].includes(method) && this.csrfToken) {
      headers.set("x-csrf-token", this.csrfToken);
    }

    const response = await fetch(`${this.baseUrl}${path}`, {
      body: body === undefined ? undefined : JSON.stringify(body),
      headers,
      method
    });
    const setCookie = response.headers.get("set-cookie");
    if (setCookie) {
      this.cookie = setCookie.split(";")[0] || this.cookie;
    }

    const payload = await response.json().catch(() => null) as { data?: T; error?: { code?: string; message?: string } } | null;
    return { payload, response };
  }
}

function runDatabaseReset() {
  const result = spawnSync("node", ["server/scripts/reset-database.cjs"], {
    cwd: process.cwd(),
    env: { ...process.env, ...integrationEnv },
    stdio: "inherit"
  });

  if (result.status !== 0) {
    throw new Error(`Integration database reset failed with status ${result.status || 1}.`);
  }
}

async function startTestServer(): Promise<TestServer> {
  const [{ createApp }, { closePool }] = await Promise.all([
    import("../../app"),
    import("../../db/mysql")
  ]);
  const app = createApp();
  const server = app.listen(0);
  await new Promise<void>((resolve) => server.once("listening", resolve));
  const address = server.address();
  if (!address || typeof address === "string") {
    throw new Error("Could not determine integration server port.");
  }

  return {
    baseUrl: `http://127.0.0.1:${address.port}`,
    closePool,
    server
  };
}

function closeServer(server: Server) {
  return new Promise<void>((resolve, reject) => {
    server.close((error) => {
      if (error) {
        reject(error);
        return;
      }
      resolve();
    });
  });
}

async function one(sql: string, params: any[] = []) {
  const { pool } = await import("../../db/mysql");
  const [rows] = await pool.execute<RowDataPacket[]>(sql, params);
  return rows[0] || null;
}

async function insert(sql: string, params: any[] = []) {
  const { pool } = await import("../../db/mysql");
  const [result] = await pool.execute<any>(sql, params);
  return Number(result.insertId);
}

async function findOrCreate(selectSql: string, selectParams: any[], insertSql: string, insertParams: any[]) {
  const existing = await one(selectSql, selectParams);
  if (existing) {
    return Number(existing.id);
  }
  return insert(insertSql, insertParams);
}

async function setupWalkInReference(adminSession: JsonRecord) {
  const adminUserId = Number(adminSession.user.id);
  const adminAssignmentId = Number(adminSession.activeAssignmentId);
  const rootUnit = await one("SELECT * FROM units WHERE code = ? LIMIT 1", ["UNIVERSITY"]);
  expect(rootUnit).toBeTruthy();

  const facultyTypeId = await findOrCreate(
    "SELECT id FROM unit_types WHERE code = ? LIMIT 1",
    ["faculty"],
    "INSERT INTO unit_types (uuid, code, name, hierarchy_level, allows_children, status) VALUES (?, ?, ?, ?, ?, ?)",
    [randomUUID(), "faculty", "Faculty", 2, true, "active"]
  );
  const departmentTypeId = await findOrCreate(
    "SELECT id FROM unit_types WHERE code = ? LIMIT 1",
    ["department"],
    "INSERT INTO unit_types (uuid, code, name, hierarchy_level, allows_children, status) VALUES (?, ?, ?, ?, ?, ?)",
    [randomUUID(), "department", "Department", 3, false, "active"]
  );
  const facultyId = await findOrCreate(
    "SELECT id FROM units WHERE organization_id = ? AND code = ? LIMIT 1",
    [rootUnit.organization_id, "FAC-CS"],
    "INSERT INTO units (uuid, organization_id, unit_type_id, parent_unit_id, code, name, status) VALUES (?, ?, ?, ?, ?, ?, ?)",
    [randomUUID(), rootUnit.organization_id, facultyTypeId, rootUnit.id, "FAC-CS", "Computer Science Faculty", "active"]
  );
  const departmentId = await findOrCreate(
    "SELECT id FROM units WHERE organization_id = ? AND code = ? LIMIT 1",
    [rootUnit.organization_id, "DEP-SE"],
    "INSERT INTO units (uuid, organization_id, unit_type_id, parent_unit_id, code, name, status) VALUES (?, ?, ?, ?, ?, ?, ?)",
    [randomUUID(), rootUnit.organization_id, departmentTypeId, facultyId, "DEP-SE", "Software Engineering Department", "active"]
  );
  const documentTypeId = await findOrCreate(
    "SELECT id FROM document_types WHERE code = ? LIMIT 1",
    ["student_approval_walk_in"],
    "INSERT INTO document_types (uuid, code, name, description, requires_serial, status) VALUES (?, ?, ?, ?, ?, ?)",
    [randomUUID(), "student_approval_walk_in", "Student Approval Document", "Walk-in student approval test type.", true, "active"]
  );

  await insert(
    `INSERT INTO serial_rules (
      uuid, code, name, format, scope, reset_policy, sequence_padding,
      is_default, status, activated_by_user_id, activated_at, notes
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, ?)`,
    [
      randomUUID(),
      "walk_in_test_serial",
      "Walk-in Test Serial",
      "WALK-{YEAR}-{SEQUENCE}",
      "global",
      "yearly",
      4,
      true,
      "active",
      adminUserId,
      "Integration test serial rule."
    ]
  );

  const templateId = await insert(
    "INSERT INTO document_templates (uuid, owner_user_id, owner_assignment_id, name, description, status, visibility) VALUES (?, ?, ?, ?, ?, ?, ?)",
    [randomUUID(), adminUserId, adminAssignmentId, "Walk-in Test Template", "Integration test template.", "published", "public"]
  );
  const layout = {
    blocks: [
      {
        field: "document.body",
        height: 120,
        id: "body",
        locked: true,
        style: { fontSize: 12, textAlign: "left" },
        type: "dynamic_field",
        width: 170,
        x: 20,
        y: 40
      }
    ],
    page: { height: 297, margin: { bottom: 20, left: 20, right: 20, top: 20 }, width: 210 }
  };
  const versionId = await insert(
    "INSERT INTO document_template_versions (uuid, template_id, version_number, status, layout_definition, created_by_user_id) VALUES (?, ?, ?, ?, ?, ?)",
    [randomUUID(), templateId, 1, "active", JSON.stringify(layout), adminUserId]
  );
  const { pool } = await import("../../db/mysql");
  await pool.execute(
    "UPDATE document_templates SET current_version_id = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
    [versionId, templateId]
  );
  await insert(
    "INSERT INTO document_template_bindings (uuid, document_type_id, locale, variant, template_id, template_version_id, status, created_by_user_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
    [randomUUID(), documentTypeId, "all", "official", templateId, versionId, "active", adminUserId]
  );

  return { departmentId, documentTypeId, facultyId };
}

function walkInPerson(suffix = "") {
  return {
    father_name: `Father${suffix}`,
    first_name: `Requester${suffix}`,
    last_name: "Student",
    phone_number: `07000011${suffix || "00"}`,
    relationship_to_subject: "self",
    tazkira_number: `TAZ-${suffix || "1000"}`
  };
}

describe("walk-in document issuance backend", () => {
  let testServer: TestServer | null = null;
  let admin: TestClient;
  let referenceIds: Awaited<ReturnType<typeof setupWalkInReference>>;

  beforeAll(async () => {
    runDatabaseReset();
    testServer = await startTestServer();
    admin = new TestClient(testServer.baseUrl);
    const session = await admin.login("admin", "Admin@12345");
    referenceIds = await setupWalkInReference(session);
  });

  afterAll(async () => {
    if (testServer) {
      await closeServer(testServer.server);
      await testServer.closePool();
    }
  });

  it("returns live document hashes and stores matching initial version hashes", async () => {
    const [documentType, confidentiality, priority] = await Promise.all([
      one("SELECT id FROM document_types WHERE status = 'active' ORDER BY id ASC LIMIT 1"),
      one("SELECT id FROM confidentiality_levels WHERE status = 'active' ORDER BY id ASC LIMIT 1"),
      one("SELECT id FROM priority_levels WHERE status = 'active' ORDER BY id ASC LIMIT 1")
    ]);
    expect(documentType).toBeTruthy();
    expect(confidentiality).toBeTruthy();
    expect(priority).toBeTruthy();

    const created = await admin.post<JsonRecord>("/api/documents", {
      body: "Hash consistency body.",
      confidentiality_level_id: Number(confidentiality.id),
      document_type_id: Number(documentType.id),
      priority_level_id: Number(priority.id),
      subject: "Hash Consistency Document"
    });
    const documentId = Number(created.document.id);
    const detail = await admin.get<JsonRecord>(`/api/documents/${documentId}`);
    const liveHash = String(detail.document.current_content_hash || "");
    const persistedDocument = await one("SELECT * FROM documents WHERE id = ? LIMIT 1", [documentId]);
    const latestVersion = await one(
      "SELECT * FROM document_versions WHERE document_id = ? ORDER BY version_number DESC LIMIT 1",
      [documentId]
    );
    const { calculateDocumentContentHash } = await import("../../shared/document-hash");

    expect(liveHash).toHaveLength(64);
    expect(calculateDocumentContentHash(persistedDocument)).toBe(liveHash);
    expect(latestVersion.content_hash).toBe(liveHash);
  });

  it("tracks intake, finalization, print, handover, archive, and search identity", async () => {
    const documentTypes = await admin.get<JsonRecord[]>("/api/walk-in-issuance/document-types");
    expect(documentTypes.some((type) => Number(type.id) === referenceIds.documentTypeId)).toBe(true);

    const createdRequest = await admin.post<JsonRecord>("/api/walk-in-issuance/requests", {
      department_id: referenceIds.departmentId,
      document_type_id: referenceIds.documentTypeId,
      faculty_id: referenceIds.facultyId,
      is_student: true,
      person: walkInPerson("01"),
      purpose: "Student approval for scholarship processing.",
      semester: "4",
      student_registration_number: "REG-2026-001"
    });
    const requestId = Number(createdRequest.request.id);
    expect(createdRequest.request.status).toBe("intake");
    expect(createdRequest.studentProfile).toBeTruthy();

    const withDocument = await admin.post<JsonRecord>(`/api/walk-in-issuance/requests/${requestId}/create-document`, {
      body: "This student approval document is issued for integration testing.",
      subject: "Student Approval Document"
    });
    const documentId = Number(withDocument.document.id);
    expect(withDocument.request.status).toBe("draft_created");
    expect(withDocument.document.official_serial).toBeFalsy();
    const walkInDetail = await admin.get<JsonRecord>(`/api/documents/${documentId}`);
    const walkInVersion = await one(
      "SELECT * FROM document_versions WHERE document_id = ? ORDER BY version_number DESC LIMIT 1",
      [documentId]
    );
    expect(walkInDetail.document.current_content_hash).toHaveLength(64);
    expect(walkInVersion.content_hash).toBe(walkInDetail.document.current_content_hash);

    const earlyHandover = await admin.postError(`/api/walk-in-issuance/requests/${requestId}/handover`, {
      handover_method: "physical_original"
    });
    expect(earlyHandover.status).toBe(409);
    expect(earlyHandover.code).toBe("walk_in_document_not_finalized");

    await admin.post<JsonRecord>(`/api/documents/${documentId}/finalize`, { note: "Finalized for walk-in issuance." });
    const finalizedRequest = await admin.get<JsonRecord>(`/api/walk-in-issuance/requests/${requestId}`);
    expect(finalizedRequest.request.status).toBe("finalized");
    expect(finalizedRequest.document.official_serial).toMatch(/^WALK-/);

    const handoverWithoutPrint = await admin.postError(`/api/walk-in-issuance/requests/${requestId}/handover`, {
      handover_method: "physical_original"
    });
    expect(handoverWithoutPrint.status).toBe(409);
    expect(handoverWithoutPrint.code).toBe("walk_in_print_required");

    const printed = await admin.post<JsonRecord>(`/api/walk-in-issuance/requests/${requestId}/print-events`, {
      print_type: "original"
    });
    expect(printed.request.status).toBe("printed");
    expect(printed.printEvents).toHaveLength(1);

    const archiveBeforeHandover = await admin.postError(`/api/walk-in-issuance/requests/${requestId}/archive`, {
      reason: "Trying too early."
    });
    expect(archiveBeforeHandover.status).toBe(409);
    expect(archiveBeforeHandover.code).toBe("walk_in_handover_required");

    const genericArchiveBeforeHandover = await admin.postError(`/api/documents/${documentId}/archive`, {
      reason: "Trying generic archive too early."
    });
    expect(genericArchiveBeforeHandover.status).toBe(409);
    expect(genericArchiveBeforeHandover.code).toBe("walk_in_handover_required");

    const handedOver = await admin.post<JsonRecord>(`/api/walk-in-issuance/requests/${requestId}/handover`, {
      copy_count: 1,
      handover_method: "physical_original",
      handover_note: "Received by the student."
    });
    expect(handedOver.request.status).toBe("handed_over");
    expect(handedOver.handoverRecords).toHaveLength(1);

    const archived = await admin.post<JsonRecord>(`/api/walk-in-issuance/requests/${requestId}/archive`, {
      reason: "Completed handover and archive."
    });
    expect(archived.request.status).toBe("archived");
    expect(archived.document.status).toBe("archived");

    const searchResults = await admin.get<JsonRecord[]>("/api/admin/search?q=0700001101&types=document");
    expect(searchResults.some((result) => Number(result.entityId) === documentId)).toBe(true);
  });

  it("allows cancel before finalization and blocks cancel after finalization", async () => {
    const cancelable = await admin.post<JsonRecord>("/api/walk-in-issuance/requests", {
      document_type_id: referenceIds.documentTypeId,
      is_student: false,
      person: walkInPerson("02"),
      purpose: "Cancelable walk-in request."
    });
    const cancelableId = Number(cancelable.request.id);
    const cancelableWithDocument = await admin.post<JsonRecord>(`/api/walk-in-issuance/requests/${cancelableId}/create-document`, {
      body: "This draft will be canceled.",
      subject: "Cancelable Walk-in Document"
    });
    expect(cancelableWithDocument.request.status).toBe("draft_created");

    const canceled = await admin.post<JsonRecord>(`/api/walk-in-issuance/requests/${cancelableId}/cancel`, {
      reason: "Requester withdrew."
    });
    expect(canceled.request.status).toBe("canceled");
    expect(canceled.document.status).toBe("closed");

    const finalized = await admin.post<JsonRecord>("/api/walk-in-issuance/requests", {
      document_type_id: referenceIds.documentTypeId,
      is_student: false,
      person: walkInPerson("03"),
      purpose: "Finalized request cannot be canceled."
    });
    const finalizedId = Number(finalized.request.id);
    const finalizedWithDocument = await admin.post<JsonRecord>(`/api/walk-in-issuance/requests/${finalizedId}/create-document`, {
      body: "This draft will be finalized.",
      subject: "Finalized Walk-in Document"
    });
    const finalizedDocumentId = Number(finalizedWithDocument.document.id);
    await admin.post<JsonRecord>(`/api/documents/${finalizedDocumentId}/finalize`, { note: "Finalized." });

    const cancelAfterFinalize = await admin.postError(`/api/walk-in-issuance/requests/${finalizedId}/cancel`, {
      reason: "Too late."
    });
    expect(cancelAfterFinalize.status).toBe(409);
    expect(cancelAfterFinalize.code).toBe("walk_in_cancel_not_allowed");
  });
});
