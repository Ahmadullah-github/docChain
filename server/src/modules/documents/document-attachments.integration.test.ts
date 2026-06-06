import { createHash, randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import { spawnSync } from "node:child_process";
import path from "node:path";
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

  postError(path: string, body?: unknown, includeCsrf = true) {
    return this.requestError("POST", path, body, includeCsrf);
  }

  async getRaw(path: string) {
    const headers = new Headers();
    headers.set("accept-language", "en");
    if (this.cookie) {
      headers.set("cookie", this.cookie);
    }

    const response = await fetch(`${this.baseUrl}${path}`, {
      headers,
      method: "GET"
    });
    const setCookie = response.headers.get("set-cookie");
    if (setCookie) {
      this.cookie = setCookie.split(";")[0] || this.cookie;
    }
    return response;
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

const writtenFiles: string[] = [];

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

async function createUnit(code: string, name: string) {
  const organization = await one("SELECT id FROM organizations ORDER BY id ASC LIMIT 1");
  const unitType = await one("SELECT id FROM unit_types ORDER BY hierarchy_level DESC, id ASC LIMIT 1");
  expect(organization).toBeTruthy();
  expect(unitType).toBeTruthy();
  return insert(
    "INSERT INTO units (uuid, organization_id, unit_type_id, code, name, status) VALUES (?, ?, ?, ?, ?, ?)",
    [randomUUID(), organization.id, unitType.id, code, name, "active"]
  );
}

async function createPositionUser(input: {
  employeeCode: string;
  positionCode: string;
  positionTitle: string;
  unitId: number;
  username: string;
}) {
  const password = `${input.username}@12345`;
  const passwordHash = await argon2.hash(password, { type: argon2.argon2id });
  const personId = await insert(
    "INSERT INTO persons (uuid, employee_code, first_name, last_name, display_name, email, status) VALUES (?, ?, ?, ?, ?, ?, ?)",
    [randomUUID(), input.employeeCode, input.positionTitle, "User", input.positionTitle, `${input.username}@docchain.local`, "active"]
  );
  const userId = await insert(
    "INSERT INTO users (uuid, person_id, email, username, password_hash, status, must_change_password) VALUES (?, ?, ?, ?, ?, ?, ?)",
    [randomUUID(), personId, `${input.username}@docchain.local`, input.username, passwordHash, "active", false]
  );
  const positionId = await insert(
    "INSERT INTO positions (uuid, unit_id, code, title, authority_level, is_signing_authority, allows_multiple_active_assignments, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
    [randomUUID(), input.unitId, input.positionCode, input.positionTitle, 50, true, false, "active"]
  );
  const assignmentId = await insert(
    "INSERT INTO assignments (uuid, person_id, position_id, status, is_primary, starts_at, created_by_user_id) VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP, ?)",
    [randomUUID(), personId, positionId, "active", true, userId]
  );

  return {
    assignmentId,
    password,
    positionId,
    unitId: input.unitId,
    username: input.username
  };
}

async function createDocumentType() {
  const suffix = randomUUID().slice(0, 8);
  return insert(
    "INSERT INTO document_types (uuid, code, name, description, requires_serial, status) VALUES (?, ?, ?, ?, ?, ?)",
    [randomUUID(), `attachment_test_${suffix}`, "Attachment Test Document", "Document type for attachment tests.", false, "active"]
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

async function attachStoredFile(input: {
  documentId: number;
  filename: string;
  mimeType: string;
  uploadedByAssignmentId: number;
  content: Buffer;
}) {
  const storedFilename = `${randomUUID()}${path.extname(input.filename) || ".bin"}`;
  const storagePath = `storage/document-attachments/${storedFilename}`;
  const absolutePath = path.resolve(process.cwd(), storagePath);
  await fs.mkdir(path.dirname(absolutePath), { recursive: true });
  await fs.writeFile(absolutePath, input.content);
  writtenFiles.push(absolutePath);

  const checksum = createHash("sha256").update(input.content).digest("hex");
  const fileAssetId = await insert(
    `INSERT INTO file_assets (
      uuid, uploaded_by_user_id, uploaded_by_assignment_id, purpose,
      storage_disk, storage_path, original_filename, stored_filename,
      mime_type, byte_size, checksum_sha256, encryption_status, status, metadata
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      randomUUID(),
      null,
      input.uploadedByAssignmentId,
      "document_attachment",
      "local",
      storagePath,
      input.filename,
      storedFilename,
      input.mimeType,
      input.content.length,
      checksum,
      "not_encrypted",
      "active",
      JSON.stringify({ testFixture: true })
    ]
  );
  const attachmentId = await insert(
    `INSERT INTO document_attachments (
      uuid, document_id, file_asset_id, uploaded_by_assignment_id,
      attachment_type, title, status
    ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [randomUUID(), input.documentId, fileAssetId, input.uploadedByAssignmentId, "supporting_file", input.filename, "active"]
  );
  return { attachmentId, fileAssetId };
}

function attachmentInput(filename: string, mimeType: string) {
  return {
    byte_size: 12,
    original_filename: filename,
    mime_type: mimeType,
    storage_path: `storage/document-attachments/${randomUUID()}-${filename}`,
    title: filename
  };
}

describe("document attachments", () => {
  let testServer: TestServer | null = null;
  let admin: TestClient;
  let adminAssignmentId = 0;

  beforeAll(async () => {
    runDatabaseReset();
    testServer = await startTestServer();
    admin = new TestClient(testServer.baseUrl);
    const session = await admin.login("admin", "Admin@12345");
    adminAssignmentId = Number(session.activeAssignmentId);
  });

  afterAll(async () => {
    await Promise.all(writtenFiles.map((file) => fs.rm(file, { force: true })));
    if (testServer) {
      await closeServer(testServer.server);
      await testServer.closePool();
    }
  });

  it("serves attachments to authorized receivers, forces unsafe previews to download, and records receipts", async () => {
    const receiverUnitId = await createUnit("ATTACH_REVIEW_UNIT", "Attachment Review Unit");
    const outsiderUnitId = await createUnit("ATTACH_OUTSIDER_UNIT", "Attachment Outsider Unit");
    const receiver = await createPositionUser({
      employeeCode: "ATTACH-REVIEWER",
      positionCode: "attach_reviewer",
      positionTitle: "Attachment Reviewer",
      unitId: receiverUnitId,
      username: "attach-reviewer"
    });
    const outsider = await createPositionUser({
      employeeCode: "ATTACH-OUTSIDER",
      positionCode: "attach_outsider",
      positionTitle: "Attachment Outsider",
      unitId: outsiderUnitId,
      username: "attach-outsider"
    });
    const documentTypeId = await createDocumentType();
    const documentId = await createDocument(admin, documentTypeId, "Attachment Receipt Flow");
    const pdf = await attachStoredFile({
      content: Buffer.from("%PDF-1.4\nattachment test\n"),
      documentId,
      filename: "support.pdf",
      mimeType: "application/pdf",
      uploadedByAssignmentId: adminAssignmentId
    });
    const docx = await attachStoredFile({
      content: Buffer.from("office file"),
      documentId,
      filename: "support.docx",
      mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      uploadedByAssignmentId: adminAssignmentId
    });

    await admin.post<JsonRecord>(`/api/documents/${documentId}/send`, {
      recipients: [{
        required_action: "review",
        to_position_id: receiver.positionId,
        to_unit_id: receiver.unitId
      }]
    });

    const receiverClient = new TestClient(testServer!.baseUrl);
    await receiverClient.login(receiver.username, receiver.password);
    const receiverDetailBefore = await receiverClient.get<JsonRecord>(`/api/documents/${documentId}`);
    expect(receiverDetailBefore.canUploadAttachments).toBe(true);
    expect(receiverDetailBefore.attachments.find((item: JsonRecord) => Number(item.id) === pdf.attachmentId)).toMatchObject({
      isPreviewable: true,
      receiptSummary: null
    });

    const inlineResponse = await receiverClient.getRaw(`/api/documents/${documentId}/attachments/${pdf.attachmentId}/file`);
    expect(inlineResponse.status).toBe(200);
    expect(inlineResponse.headers.get("content-type")).toContain("application/pdf");
    expect(inlineResponse.headers.get("content-disposition")).toContain("inline");
    expect(await inlineResponse.text()).toContain("attachment test");

    const downloadResponse = await receiverClient.getRaw(`/api/documents/${documentId}/attachments/${pdf.attachmentId}/file?download=1`);
    expect(downloadResponse.status).toBe(200);
    expect(downloadResponse.headers.get("content-disposition")).toContain("attachment");

    const forcedDownloadResponse = await receiverClient.getRaw(`/api/documents/${documentId}/attachments/${docx.attachmentId}/file`);
    expect(forcedDownloadResponse.status).toBe(200);
    expect(forcedDownloadResponse.headers.get("content-disposition")).toContain("attachment");

    const receiverDetailAfter = await receiverClient.get<JsonRecord>(`/api/documents/${documentId}`);
    const receiverPdf = receiverDetailAfter.attachments.find((item: JsonRecord) => Number(item.id) === pdf.attachmentId);
    expect(receiverPdf.myAccess.viewedAt).toBeTruthy();
    expect(receiverPdf.myAccess.downloadedAt).toBeTruthy();
    expect(receiverPdf.receiptSummary).toBeNull();

    const adminDetail = await admin.get<JsonRecord>(`/api/documents/${documentId}`);
    const adminPdf = adminDetail.attachments.find((item: JsonRecord) => Number(item.id) === pdf.attachmentId);
    expect(adminPdf.receiptSummary).toMatchObject({
      downloadCount: 1,
      viewCount: 1
    });
    expect(adminPdf.receiptSummary.recent[0].actorName).toBe("Attachment Reviewer");

    const logs = await all(
      "SELECT action, resource_id FROM access_logs WHERE resource_type = ? AND resource_id IN (?, ?) ORDER BY id ASC",
      ["document_attachment", String(pdf.attachmentId), String(docx.attachmentId)]
    );
    expect(logs.map((row) => row.action)).toEqual(["view", "download", "download"]);

    const outsiderClient = new TestClient(testServer!.baseUrl);
    await outsiderClient.login(outsider.username, outsider.password);
    const denied = await outsiderClient.getRaw(`/api/documents/${documentId}/attachments/${pdf.attachmentId}/file`);
    expect(denied.status).toBe(403);
  });

  it("allows uploads only for creator, admin, and active edit/review/forward task holders", async () => {
    const documentTypeId = await createDocumentType();
    const signUnitId = await createUnit("ATTACH_SIGN_UNIT", "Attachment Sign Unit");
    const infoUnitId = await createUnit("ATTACH_INFO_UNIT", "Attachment Info Unit");
    const editUnitId = await createUnit("ATTACH_EDIT_UNIT", "Attachment Edit Unit");
    const signer = await createPositionUser({
      employeeCode: "ATTACH-SIGNER",
      positionCode: "attach_signer",
      positionTitle: "Attachment Signer",
      unitId: signUnitId,
      username: "attach-signer"
    });
    const infoReceiver = await createPositionUser({
      employeeCode: "ATTACH-INFO",
      positionCode: "attach_info",
      positionTitle: "Attachment Info Receiver",
      unitId: infoUnitId,
      username: "attach-info"
    });
    const editor = await createPositionUser({
      employeeCode: "ATTACH-EDITOR",
      positionCode: "attach_editor",
      positionTitle: "Attachment Editor",
      unitId: editUnitId,
      username: "attach-editor"
    });

    const signDocumentId = await createDocument(admin, documentTypeId, "Sign Only Upload Denied");
    await admin.post<JsonRecord>(`/api/documents/${signDocumentId}/send`, {
      recipients: [{
        required_action: "sign",
        to_position_id: signer.positionId,
        to_unit_id: signer.unitId
      }]
    });
    const signerClient = new TestClient(testServer!.baseUrl);
    await signerClient.login(signer.username, signer.password);
    const signDetail = await signerClient.get<JsonRecord>(`/api/documents/${signDocumentId}`);
    expect(signDetail.canUploadAttachments).toBe(false);
    const signDenied = await signerClient.postError(
      `/api/documents/${signDocumentId}/attachments`,
      attachmentInput("sign-denied.txt", "text/plain")
    );
    expect(signDenied.status).toBe(403);

    const informationDocumentId = await createDocument(admin, documentTypeId, "Information Upload Denied");
    await admin.post<JsonRecord>(`/api/documents/${informationDocumentId}/send`, {
      recipients: [{
        required_action: "information",
        to_position_id: infoReceiver.positionId,
        to_unit_id: infoReceiver.unitId
      }]
    });
    const infoClient = new TestClient(testServer!.baseUrl);
    await infoClient.login(infoReceiver.username, infoReceiver.password);
    const infoDenied = await infoClient.postError(
      `/api/documents/${informationDocumentId}/attachments`,
      attachmentInput("info-denied.txt", "text/plain")
    );
    expect(infoDenied.status).toBe(403);

    const editDocumentId = await createDocument(admin, documentTypeId, "Edit Upload Allowed");
    await admin.post<JsonRecord>(`/api/documents/${editDocumentId}/send`, {
      recipients: [{
        required_action: "edit",
        to_position_id: editor.positionId,
        to_unit_id: editor.unitId
      }]
    });
    const editorClient = new TestClient(testServer!.baseUrl);
    await editorClient.login(editor.username, editor.password);
    const editDetail = await editorClient.get<JsonRecord>(`/api/documents/${editDocumentId}`);
    expect(editDetail.canUploadAttachments).toBe(true);
    const created = await editorClient.post<JsonRecord>(
      `/api/documents/${editDocumentId}/attachments`,
      attachmentInput("edit-allowed.txt", "text/plain")
    );
    expect(Number(created.id)).toBeGreaterThan(0);
  });
});
