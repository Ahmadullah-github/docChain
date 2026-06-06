import { randomUUID } from "node:crypto";
import { spawnSync } from "node:child_process";
import type { Server } from "node:http";
import argon2 from "argon2";
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

  patch<T>(path: string, body?: unknown, includeCsrf = true) {
    return this.request<T>("PATCH", path, body, includeCsrf);
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

async function all(sql: string, params: any[] = []) {
  const { pool } = await import("../../db/mysql");
  const [rows] = await pool.execute<RowDataPacket[]>(sql, params);
  return rows;
}

async function one(sql: string, params: any[] = []) {
  const rows = await all(sql, params);
  return rows[0] || null;
}

async function insert(sql: string, params: any[] = []) {
  const { pool } = await import("../../db/mysql");
  const [result] = await pool.execute<any>(sql, params);
  return Number(result.insertId);
}

async function createPositionUser(input: {
  employeeCode: string;
  positionCode: string;
  positionTitle: string;
  username: string;
}) {
  const rootUnit = await one("SELECT * FROM units WHERE code = ? LIMIT 1", ["UNIVERSITY"]);
  expect(rootUnit).toBeTruthy();
  const password = `${input.username}@12345`;
  const passwordHash = await argon2.hash(password, { type: argon2.argon2id });
  const personId = await insert(
    "INSERT INTO persons (uuid, employee_code, first_name, last_name, display_name, email, status) VALUES (?, ?, ?, ?, ?, ?, ?)",
    [randomUUID(), input.employeeCode, input.positionTitle, "Receiver", input.positionTitle, `${input.username}@docchain.local`, "active"]
  );
  const userId = await insert(
    "INSERT INTO users (uuid, person_id, email, username, password_hash, status, must_change_password) VALUES (?, ?, ?, ?, ?, ?, ?)",
    [randomUUID(), personId, `${input.username}@docchain.local`, input.username, passwordHash, "active", false]
  );
  const positionId = await insert(
    "INSERT INTO positions (uuid, unit_id, code, title, authority_level, is_signing_authority, allows_multiple_active_assignments, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
    [randomUUID(), rootUnit.id, input.positionCode, input.positionTitle, 50, true, false, "active"]
  );
  const assignmentId = await insert(
    "INSERT INTO assignments (uuid, person_id, position_id, status, is_primary, starts_at, created_by_user_id) VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP, ?)",
    [randomUUID(), personId, positionId, "active", true, userId]
  );

  return {
    assignmentId,
    password,
    positionId,
    unitId: Number(rootUnit.id),
    username: input.username
  };
}

async function createDocumentType() {
  return insert(
    "INSERT INTO document_types (uuid, code, name, description, requires_serial, status) VALUES (?, ?, ?, ?, ?, ?)",
    [randomUUID(), "request_permissions_test_document", "Request Permissions Test Document", "Document type for request permission tests.", false, "active"]
  );
}

async function createDocument(client: TestClient, documentTypeId: number, subject: string) {
  const [confidentiality, priority] = await Promise.all([
    one("SELECT id FROM confidentiality_levels WHERE status = 'active' ORDER BY id ASC LIMIT 1"),
    one("SELECT id FROM priority_levels WHERE status = 'active' ORDER BY id ASC LIMIT 1")
  ]);
  expect(confidentiality).toBeTruthy();
  expect(priority).toBeTruthy();

  const created = await client.post<JsonRecord>("/api/documents", {
    body: `Body for ${subject}.`,
    confidentiality_level_id: Number(confidentiality.id),
    document_type_id: documentTypeId,
    priority_level_id: Number(priority.id),
    subject
  });
  return Number(created.document.id);
}

describe("document request permissions", () => {
  let testServer: TestServer | null = null;
  let admin: TestClient;

  beforeAll(async () => {
    runDatabaseReset();
    testServer = await startTestServer();
    admin = new TestClient(testServer.baseUrl);
    await admin.login("admin", "Admin@12345");
  });

  afterAll(async () => {
    if (testServer) {
      await closeServer(testServer.server);
      await testServer.closePool();
    }
  });

  it("keeps multiple permissions on one review request and tracks information seen once", async () => {
    const reviewer = await createPositionUser({
      employeeCode: "REQ-PERM-REVIEWER",
      positionCode: "req_perm_reviewer",
      positionTitle: "Request Permission Reviewer",
      username: "req-perm-reviewer"
    });
    const outsider = await createPositionUser({
      employeeCode: "REQ-PERM-OUTSIDER",
      positionCode: "req_perm_outsider",
      positionTitle: "Request Permission Outsider",
      username: "req-perm-outsider"
    });
    const documentTypeId = await createDocumentType();
    const reviewDocumentId = await createDocument(admin, documentTypeId, "Multi Permission Review");

    const sent = await admin.post<JsonRecord>(`/api/documents/${reviewDocumentId}/send`, {
      recipients: [{
        can_edit: true,
        can_forward: true,
        can_review: true,
        can_sign: true,
        required_action: "review",
        requires_comment: true,
        to_position_id: reviewer.positionId,
        to_unit_id: reviewer.unitId
      }]
    });
    expect(sent.tasks).toHaveLength(1);
    const reviewTask = sent.tasks[0];
    expect(reviewTask).toMatchObject({
      can_edit: 1,
      can_forward: 1,
      can_review: 1,
      can_sign: 1,
      required_action: "review"
    });

    const reviewerClient = new TestClient(testServer!.baseUrl);
    await reviewerClient.login(reviewer.username, reviewer.password);
    const allWork = await reviewerClient.get<JsonRecord[]>("/api/workspace/work-items?type=all&limit=40");
    expect(allWork).toContainEqual(expect.objectContaining({
      canEdit: 1,
      canForward: 1,
      canReview: 1,
      canSign: 1,
      documentId: reviewDocumentId,
      id: Number(reviewTask.id),
      requiredAction: "review"
    }));

    const completedReview = await reviewerClient.patch<JsonRecord>(
      `/api/documents/${reviewDocumentId}/tasks/${reviewTask.id}/complete`,
      { completion_note: "Reviewed and approved." }
    );
    expect(completedReview).toMatchObject({
      completed_by_assignment_id: reviewer.assignmentId,
      response_note: "Reviewed and approved.",
      status: "completed"
    });

    const informationDocumentId = await createDocument(admin, documentTypeId, "Information Seen Tracking");
    const informationSent = await admin.post<JsonRecord>(`/api/documents/${informationDocumentId}/send`, {
      recipients: [{
        required_action: "information",
        to_position_id: reviewer.positionId,
        to_unit_id: reviewer.unitId
      }]
    });
    const informationTask = informationSent.tasks[0];
    expect(informationTask).toMatchObject({
      can_edit: 0,
      can_forward: 0,
      can_review: 0,
      can_sign: 0,
      required_action: "information",
      status: "open"
    });

    const seen = await reviewerClient.post<JsonRecord>(`/api/documents/${informationDocumentId}/tasks/${informationTask.id}/seen`);
    expect(seen).toMatchObject({
      completed_by_assignment_id: reviewer.assignmentId,
      responded_by_assignment_id: reviewer.assignmentId,
      status: "completed"
    });
    const seenAgain = await reviewerClient.post<JsonRecord>(`/api/documents/${informationDocumentId}/tasks/${informationTask.id}/seen`);
    expect(seenAgain).toMatchObject({ status: "completed" });
    const seenEvents = await all(
      "SELECT * FROM document_workflow_events WHERE document_id = ? AND action = ?",
      [informationDocumentId, "information_seen"]
    );
    expect(seenEvents).toHaveLength(1);

    const outsiderClient = new TestClient(testServer!.baseUrl);
    await outsiderClient.login(outsider.username, outsider.password);
    const denied = await outsiderClient.postError(`/api/documents/${informationDocumentId}/tasks/${informationTask.id}/seen`);
    expect(denied.status).toBe(403);
  });
});
