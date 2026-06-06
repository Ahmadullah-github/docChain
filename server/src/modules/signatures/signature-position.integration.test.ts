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

const signatureImage = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+P+/HgAGgwJ/l4u1GQAAAABJRU5ErkJggg==";

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

async function all(sql: string, params: any[] = []) {
  const { pool } = await import("../../db/mysql");
  const [rows] = await pool.execute<RowDataPacket[]>(sql, params);
  return rows;
}

async function insert(sql: string, params: any[] = []) {
  const { pool } = await import("../../db/mysql");
  const [result] = await pool.execute<any>(sql, params);
  return Number(result.insertId);
}

async function createSigningPosition(code: string, title: string) {
  const rootUnit = await one("SELECT * FROM units WHERE code = ? LIMIT 1", ["UNIVERSITY"]);
  expect(rootUnit).toBeTruthy();
  const positionId = await insert(
    "INSERT INTO positions (uuid, unit_id, code, title, authority_level, is_signing_authority, allows_multiple_active_assignments, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
    [randomUUID(), rootUnit.id, code, title, 50, true, true, "active"]
  );
  return { positionId, unitId: Number(rootUnit.id) };
}

async function createUser(input: {
  assignmentPositionIds: number[];
  employeeCode: string;
  name: string;
  username: string;
}) {
  const password = `${input.username}@12345`;
  const passwordHash = await argon2.hash(password, { type: argon2.argon2id });
  const personId = await insert(
    "INSERT INTO persons (uuid, employee_code, first_name, last_name, display_name, email, status) VALUES (?, ?, ?, ?, ?, ?, ?)",
    [randomUUID(), input.employeeCode, input.name, "Signer", input.name, `${input.username}@docchain.local`, "active"]
  );
  const userId = await insert(
    "INSERT INTO users (uuid, person_id, email, username, password_hash, status, must_change_password) VALUES (?, ?, ?, ?, ?, ?, ?)",
    [randomUUID(), personId, `${input.username}@docchain.local`, input.username, passwordHash, "active", false]
  );
  const assignmentIds: number[] = [];
  for (const [index, positionId] of input.assignmentPositionIds.entries()) {
    assignmentIds.push(await insert(
      "INSERT INTO assignments (uuid, person_id, position_id, status, is_primary, starts_at, created_by_user_id) VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP, ?)",
      [randomUUID(), personId, positionId, "active", index === 0, userId]
    ));
  }

  return { assignmentIds, password, userId, username: input.username };
}

async function createDocumentType() {
  return insert(
    "INSERT INTO document_types (uuid, code, name, description, requires_serial, status) VALUES (?, ?, ?, ?, ?, ?)",
    [randomUUID(), "signature_position_test_document", "Signature Position Test Document", "Document type for signature position tests.", false, "active"]
  );
}

async function enrollProfile(client: TestClient, pin = "1234") {
  return client.post<JsonRecord>("/api/signatures/profile", {
    original_filename: "signature.png",
    pin,
    signature_image_base64: signatureImage
  });
}

async function signDocument(client: TestClient, documentId: number, pin = "1234") {
  const session = await client.post<JsonRecord>(`/api/signatures/documents/${documentId}/signing-session`, { pin });
  return client.post<JsonRecord>(`/api/signatures/documents/${documentId}/sign`, {
    ...session.placement,
    placement_token: session.placement_token,
    print_options: session.print_options
  });
}

describe("position-level document signing", () => {
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

  it("allows one signature per position while allowing other positions to sign", async () => {
    const positionA = await createSigningPosition("sig_position_a", "Signature Position A");
    const positionB = await createSigningPosition("sig_position_b", "Signature Position B");
    const positionC = await createSigningPosition("sig_position_c", "Signature Position C");
    const signer = await createUser({
      assignmentPositionIds: [positionA.positionId, positionB.positionId],
      employeeCode: "SIGNER-001",
      name: "Primary Position",
      username: "position-signer"
    });
    const samePositionSigner = await createUser({
      assignmentPositionIds: [positionA.positionId],
      employeeCode: "SIGNER-002",
      name: "Same Position",
      username: "same-position-signer"
    });
    const otherPositionSigner = await createUser({
      assignmentPositionIds: [positionC.positionId],
      employeeCode: "SIGNER-003",
      name: "Other Position",
      username: "other-position-signer"
    });
    const documentTypeId = await createDocumentType();
    const [confidentiality, priority] = await Promise.all([
      one("SELECT id FROM confidentiality_levels WHERE status = 'active' ORDER BY id ASC LIMIT 1"),
      one("SELECT id FROM priority_levels WHERE status = 'active' ORDER BY id ASC LIMIT 1")
    ]);
    expect(confidentiality).toBeTruthy();
    expect(priority).toBeTruthy();

    const created = await admin.post<JsonRecord>("/api/documents", {
      body: "This document is used to test position-level signing.",
      confidentiality_level_id: Number(confidentiality.id),
      document_type_id: documentTypeId,
      priority_level_id: Number(priority.id),
      subject: "Position Signature Test"
    });
    const documentId = Number(created.document.id);

    const signerClient = new TestClient(testServer!.baseUrl);
    await signerClient.login(signer.username, signer.password);
    await enrollProfile(signerClient);
    await signDocument(signerClient, documentId);

    const repeatAttempt = await signerClient.postError(`/api/signatures/documents/${documentId}/signing-session`, { pin: "1234" });
    expect(repeatAttempt.status).toBe(409);
    expect(repeatAttempt.code).toBe("document_already_signed_by_position");

    await signerClient.post<JsonRecord>("/api/assignments/select-active", { assignmentId: signer.assignmentIds[1] });
    await signDocument(signerClient, documentId);

    const samePositionClient = new TestClient(testServer!.baseUrl);
    await samePositionClient.login(samePositionSigner.username, samePositionSigner.password);
    await enrollProfile(samePositionClient);
    const samePositionAttempt = await samePositionClient.postError(`/api/signatures/documents/${documentId}/signing-session`, { pin: "1234" });
    expect(samePositionAttempt.status).toBe(409);
    expect(samePositionAttempt.code).toBe("document_already_signed_by_position");

    const otherPositionClient = new TestClient(testServer!.baseUrl);
    await otherPositionClient.login(otherPositionSigner.username, otherPositionSigner.password);
    await enrollProfile(otherPositionClient);
    await signDocument(otherPositionClient, documentId);

    const signatures = await all(
      `SELECT positions.id AS positionId
       FROM signature_events
       INNER JOIN assignments ON signature_events.assignment_id = assignments.id
       INNER JOIN positions ON assignments.position_id = positions.id
       WHERE signature_events.document_id = ?
       ORDER BY signature_events.id ASC`,
      [documentId]
    );
    expect(signatures.map((row) => Number(row.positionId))).toEqual([
      positionA.positionId,
      positionB.positionId,
      positionC.positionId
    ]);
  });
});
