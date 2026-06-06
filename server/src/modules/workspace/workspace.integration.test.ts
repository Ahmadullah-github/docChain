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

  post<T>(path: string, body?: unknown, includeCsrf = true) {
    return this.request<T>("POST", path, body, includeCsrf);
  }

  private async request<T>(method: string, path: string, body?: unknown, includeCsrf = true): Promise<T> {
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
    if (!response.ok) {
      const code = payload?.error?.code || "request_failed";
      const message = payload?.error?.message || `Request failed with status ${response.status}`;
      throw new Error(`${method} ${path} failed: ${code} - ${message}`);
    }

    return payload?.data as T;
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

async function createRecipientUser() {
  const rootUnit = await one("SELECT * FROM units WHERE code = ? LIMIT 1", ["UNIVERSITY"]);
  expect(rootUnit).toBeTruthy();
  const passwordHash = await argon2.hash("Recipient@12345", { type: argon2.argon2id });
  const personId = await insert(
    "INSERT INTO persons (uuid, employee_code, first_name, last_name, display_name, email, status) VALUES (?, ?, ?, ?, ?, ?, ?)",
    [randomUUID(), "WORK-RECIPIENT-001", "Work", "Recipient", "Work Recipient", "work-recipient@docchain.local", "active"]
  );
  const userId = await insert(
    "INSERT INTO users (uuid, person_id, email, username, password_hash, status, must_change_password) VALUES (?, ?, ?, ?, ?, ?, ?)",
    [randomUUID(), personId, "work-recipient@docchain.local", "work-recipient", passwordHash, "active", false]
  );
  const positionId = await insert(
    "INSERT INTO positions (uuid, unit_id, code, title, authority_level, is_signing_authority, allows_multiple_active_assignments, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
    [randomUUID(), rootUnit.id, "work_recipient_signer", "Work Recipient Signer", 50, true, false, "active"]
  );
  const assignmentId = await insert(
    "INSERT INTO assignments (uuid, person_id, position_id, status, is_primary, starts_at, created_by_user_id) VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP, ?)",
    [randomUUID(), personId, positionId, "active", true, userId]
  );

  return {
    assignmentId,
    password: "Recipient@12345",
    positionId,
    unitId: Number(rootUnit.id),
    username: "work-recipient"
  };
}

async function createDocumentType() {
  return insert(
    "INSERT INTO document_types (uuid, code, name, description, requires_serial, status) VALUES (?, ?, ?, ?, ?, ?)",
    [randomUUID(), "workspace_test_document", "Workspace Test Document", "Document type for workspace inbox tests.", false, "active"]
  );
}

describe("workspace work items", () => {
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

  it("shows one actionable all-work row for a unit-position signature request", async () => {
    const recipient = await createRecipientUser();
    const documentTypeId = await createDocumentType();
    const [confidentiality, priority] = await Promise.all([
      one("SELECT id FROM confidentiality_levels WHERE status = 'active' ORDER BY id ASC LIMIT 1"),
      one("SELECT id FROM priority_levels WHERE status = 'active' ORDER BY id ASC LIMIT 1")
    ]);
    expect(confidentiality).toBeTruthy();
    expect(priority).toBeTruthy();

    const created = await admin.post<JsonRecord>("/api/documents", {
      body: "Please sign this test document.",
      confidentiality_level_id: Number(confidentiality.id),
      document_type_id: documentTypeId,
      priority_level_id: Number(priority.id),
      subject: "Workspace Sign Request"
    });
    const documentId = Number(created.document.id);
    const sent = await admin.post<JsonRecord>(`/api/documents/${documentId}/send`, {
      recipients: [{
        required_action: "sign",
        to_position_id: recipient.positionId,
        to_unit_id: recipient.unitId
      }]
    });
    const taskId = Number(sent.tasks?.[0]?.id);
    expect(taskId).toBeGreaterThan(0);

    const recipientClient = new TestClient(testServer!.baseUrl);
    const session = await recipientClient.login(recipient.username, recipient.password);
    expect(Number(session.activeAssignmentId)).toBe(recipient.assignmentId);

    const allWork = await recipientClient.get<JsonRecord[]>("/api/workspace/work-items?type=all&limit=40");
    expect(allWork).toHaveLength(1);
    expect(allWork[0]).toMatchObject({
      documentId,
      id: taskId,
      itemType: "signature",
      requiredAction: "sign"
    });
    expect(allWork.some((item) => item.itemType === "activity")).toBe(false);

    const signatures = await recipientClient.get<JsonRecord[]>("/api/workspace/work-items?type=signatures&limit=40");
    expect(signatures.some((item) => Number(item.id) === taskId && item.itemType === "signature")).toBe(true);

    const activity = await recipientClient.get<JsonRecord[]>("/api/workspace/work-items?type=activity&limit=40");
    expect(activity.some((item) => item.itemType === "activity" && item.title === "send" && Number(item.documentId) === documentId)).toBe(true);
  });
});
