import { randomUUID } from "node:crypto";
import { spawnSync } from "node:child_process";
import fs from "node:fs/promises";
import type { Server } from "node:http";
import path from "node:path";
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

  getRaw(path: string) {
    return this.rawRequest("GET", path);
  }

  patch<T>(path: string, body?: unknown, includeCsrf = true) {
    return this.request<T>("PATCH", path, body, includeCsrf);
  }

  patchError(path: string, body?: unknown, includeCsrf = true) {
    return this.requestError("PATCH", path, body, includeCsrf);
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

  private async rawRequest(method: string, path: string) {
    const headers = new Headers();
    headers.set("accept-language", "en");
    if (this.cookie) {
      headers.set("cookie", this.cookie);
    }

    const response = await fetch(`${this.baseUrl}${path}`, { headers, method });
    const setCookie = response.headers.get("set-cookie");
    if (setCookie) {
      this.cookie = setCookie.split(";")[0] || this.cookie;
    }
    return response;
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

async function execute(sql: string, params: any[] = []) {
  const { pool } = await import("../../db/mysql");
  await pool.execute(sql, params);
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
  const code = `request_permissions_${randomUUID().slice(0, 8)}`;
  return insert(
    "INSERT INTO document_types (uuid, code, name, description, requires_serial, status) VALUES (?, ?, ?, ?, ?, ?)",
    [randomUUID(), code, "Request Permissions Test Document", "Document type for request permission tests.", false, "active"]
  );
}

async function bindOfficialTemplate(documentTypeId: number) {
  const adminAssignment = await one(
    `SELECT users.id AS userId, assignments.id AS assignmentId
     FROM users
     INNER JOIN persons ON users.person_id = persons.id
     INNER JOIN assignments ON assignments.person_id = persons.id
     WHERE users.username = ?
       AND assignments.status = 'active'
       AND assignments.deleted_at IS NULL
     LIMIT 1`,
    ["admin"]
  );
  expect(adminAssignment).toBeTruthy();
  const templateId = await insert(
    "INSERT INTO document_templates (uuid, owner_user_id, owner_assignment_id, name, description, status, visibility) VALUES (?, ?, ?, ?, ?, ?, ?)",
    [randomUUID(), Number(adminAssignment.userId), Number(adminAssignment.assignmentId), `Thumbnail Template ${randomUUID()}`, "Integration thumbnail template.", "published", "public"]
  );
  const layout = {
    blocks: [
      { field: "document.subject", height: 20, id: "subject", locked: true, style: { fontSize: 16, fontWeight: "700", textAlign: "left" }, type: "dynamic_field", width: 170, x: 20, y: 30 },
      { field: "document.body", height: 120, id: "body", locked: true, style: { fontSize: 12, textAlign: "left" }, type: "dynamic_field", width: 170, x: 20, y: 60 }
    ],
    page: { height: 297, margin: { bottom: 20, left: 20, right: 20, top: 20 }, width: 210 }
  };
  const versionId = await insert(
    "INSERT INTO document_template_versions (uuid, template_id, version_number, status, layout_definition, created_by_user_id) VALUES (?, ?, ?, ?, ?, ?)",
    [randomUUID(), templateId, 1, "active", JSON.stringify(layout), Number(adminAssignment.userId)]
  );
  await execute(
    "UPDATE document_templates SET current_version_id = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
    [versionId, templateId]
  );
  await insert(
    "INSERT INTO document_template_bindings (uuid, document_type_id, locale, variant, template_id, template_version_id, status, created_by_user_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
    [randomUUID(), documentTypeId, "all", "official", templateId, versionId, "active", Number(adminAssignment.userId)]
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
    const reviewerUnreadAfterSend = await reviewerClient.get<JsonRecord>("/api/notifications/unread-count");
    expect(Number(reviewerUnreadAfterSend.count)).toBeGreaterThanOrEqual(1);
    const assignedNotifications = await all(
      "SELECT * FROM notifications WHERE document_id = ? AND document_task_id = ? AND notification_type = ?",
      [reviewDocumentId, Number(reviewTask.id), "document_task_assigned"]
    );
    expect(assignedNotifications).toHaveLength(1);
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
      response_outcome: "approved",
      response_note: "Reviewed and approved.",
      status: "completed"
    });
    const reviewDetail = await admin.get<JsonRecord>(`/api/documents/${reviewDocumentId}`);
    expect(reviewDetail.document.status).toBe("review_approved");
    const reviewApprovedEvents = await all(
      "SELECT * FROM document_workflow_events WHERE document_id = ? AND action = ?",
      [reviewDocumentId, "review_approved"]
    );
    expect(reviewApprovedEvents).toHaveLength(1);
    const reviewApprovedNotifications = await all(
      "SELECT * FROM notifications WHERE document_id = ? AND document_task_id = ? AND notification_type = ?",
      [reviewDocumentId, Number(reviewTask.id), "document_review_approved"]
    );
    expect(reviewApprovedNotifications).toHaveLength(1);

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

  it("aggregates task outcomes without turning non-review work into approval", async () => {
    const firstReviewer = await createPositionUser({
      employeeCode: "REQ-PERM-FIRST-REVIEWER",
      positionCode: "req_perm_first_reviewer",
      positionTitle: "Request Permission First Reviewer",
      username: "req-perm-first-reviewer"
    });
    const secondReviewer = await createPositionUser({
      employeeCode: "REQ-PERM-SECOND-REVIEWER",
      positionCode: "req_perm_second_reviewer",
      positionTitle: "Request Permission Second Reviewer",
      username: "req-perm-second-reviewer"
    });
    const forwarder = await createPositionUser({
      employeeCode: "REQ-PERM-FORWARDER",
      positionCode: "req_perm_forwarder",
      positionTitle: "Request Permission Forwarder",
      username: "req-perm-forwarder"
    });
    const documentTypeId = await createDocumentType();
    const multiReviewDocumentId = await createDocument(admin, documentTypeId, "Multi Review Aggregate");

    const sent = await admin.post<JsonRecord>(`/api/documents/${multiReviewDocumentId}/send`, {
      recipients: [
        {
          required_action: "review",
          to_position_id: firstReviewer.positionId,
          to_unit_id: firstReviewer.unitId
        },
        {
          required_action: "review",
          to_position_id: secondReviewer.positionId,
          to_unit_id: secondReviewer.unitId
        }
      ]
    });
    expect(sent.tasks).toHaveLength(2);
    const firstTask = sent.tasks.find((task: JsonRecord) => Number(task.assigned_position_id) === firstReviewer.positionId);
    const secondTask = sent.tasks.find((task: JsonRecord) => Number(task.assigned_position_id) === secondReviewer.positionId);
    expect(firstTask).toBeTruthy();
    expect(secondTask).toBeTruthy();

    const firstClient = new TestClient(testServer!.baseUrl);
    await firstClient.login(firstReviewer.username, firstReviewer.password);
    await firstClient.patch<JsonRecord>(`/api/documents/${multiReviewDocumentId}/tasks/${firstTask.id}/complete`, {
      completion_note: "First approval."
    });
    const afterFirstApproval = await admin.get<JsonRecord>(`/api/documents/${multiReviewDocumentId}`);
    expect(afterFirstApproval.document.status).toBe("under_review");

    const secondClient = new TestClient(testServer!.baseUrl);
    await secondClient.login(secondReviewer.username, secondReviewer.password);
    await secondClient.patch<JsonRecord>(`/api/documents/${multiReviewDocumentId}/tasks/${secondTask.id}/complete`, {
      completion_note: "Second approval."
    });
    const afterSecondApproval = await admin.get<JsonRecord>(`/api/documents/${multiReviewDocumentId}`);
    expect(afterSecondApproval.document.status).toBe("review_approved");

    const forwardDocumentId = await createDocument(admin, documentTypeId, "Forward Completion Is Not Approval");
    const forwardSent = await admin.post<JsonRecord>(`/api/documents/${forwardDocumentId}/send`, {
      recipients: [{
        required_action: "forward",
        to_position_id: forwarder.positionId,
        to_unit_id: forwarder.unitId
      }]
    });
    const forwardTask = forwardSent.tasks[0];
    const forwarderClient = new TestClient(testServer!.baseUrl);
    await forwarderClient.login(forwarder.username, forwarder.password);
    const completedForward = await forwarderClient.patch<JsonRecord>(`/api/documents/${forwardDocumentId}/tasks/${forwardTask.id}/complete`, {
      completion_note: "Forward action completed."
    });
    expect(completedForward.response_outcome).toBe("completed");
    const forwardDetail = await admin.get<JsonRecord>(`/api/documents/${forwardDocumentId}`);
    expect(forwardDetail.document.status).not.toBe("review_approved");
    const taskCompletedEvents = await all(
      "SELECT * FROM document_workflow_events WHERE document_id = ? AND action = ?",
      [forwardDocumentId, "task_completed"]
    );
    expect(taskCompletedEvents).toHaveLength(1);

    const terminalDocumentId = await createDocument(admin, documentTypeId, "Closed Task Rejection");
    const terminalSent = await admin.post<JsonRecord>(`/api/documents/${terminalDocumentId}/send`, {
      recipients: [{
        required_action: "review",
        to_position_id: firstReviewer.positionId,
        to_unit_id: firstReviewer.unitId
      }]
    });
    await execute(
      "UPDATE documents SET status = 'closed', closed_at = CURRENT_TIMESTAMP WHERE id = ?",
      [terminalDocumentId]
    );
    const closedAttempt = await firstClient.patchError(
      `/api/documents/${terminalDocumentId}/tasks/${terminalSent.tasks[0].id}/complete`,
      { completion_note: "Should be rejected." }
    );
    expect(closedAttempt.status).toBe(409);
    expect(closedAttempt.code).toBe("document_terminal_status");
  });

  it("returns workflow summaries for UI cards and caches official thumbnails", async () => {
    const reviewer = await createPositionUser({
      employeeCode: "REQ-PERM-UI-REVIEWER",
      positionCode: "req_perm_ui_reviewer",
      positionTitle: "UI Workflow Reviewer",
      username: "req-perm-ui-reviewer"
    });
    const documentTypeId = await createDocumentType();
    await bindOfficialTemplate(documentTypeId);
    const documentId = await createDocument(admin, documentTypeId, "Workflow Summary Card");
    const sent = await admin.post<JsonRecord>(`/api/documents/${documentId}/send`, {
      recipients: [{
        required_action: "review",
        to_position_id: reviewer.positionId,
        to_unit_id: reviewer.unitId
      }]
    });
    expect(sent.tasks).toHaveLength(1);

    const list = await admin.get<JsonRecord[]>("/api/documents?status=under_review&limit=20");
    const listItem = list.find((item) => Number(item.id) === documentId);
    expect(listItem?.workflowSummary).toMatchObject({
      activeAction: "review",
      openTaskCount: 1
    });
    expect(String(listItem?.workflowSummary?.thumbnailUrl || "")).toMatch(new RegExp(`^/api/documents/${documentId}/thumbnail\\?v=`));
    expect(listItem?.workflowSummary?.routeSteps.some((step: JsonRecord) => (
      Number(step.positionId || 0) === reviewer.positionId || Number(step.unitId || 0) === reviewer.unitId
    ))).toBe(true);

    const detail = await admin.get<JsonRecord>(`/api/documents/${documentId}`);
    expect(detail.workflowSummary).toMatchObject({
      activeAction: "review",
      completedTaskCount: 0,
      openTaskCount: 1
    });

    const reviewerClient = new TestClient(testServer!.baseUrl);
    await reviewerClient.login(reviewer.username, reviewer.password);
    const workItems = await reviewerClient.get<JsonRecord[]>("/api/workspace/work-items?type=all&limit=20");
    const workItem = workItems.find((item) => Number(item.documentId) === documentId);
    expect(workItem?.workflowSummary).toMatchObject({
      activeAction: "review",
      openTaskCount: 1
    });

    const firstThumbnail = await admin.getRaw(`/api/documents/${documentId}/thumbnail`);
    expect(firstThumbnail.status).toBe(200);
    expect(firstThumbnail.headers.get("content-type")).toContain("image/png");
    const firstThumbnailBuffer = Buffer.from(await firstThumbnail.arrayBuffer());
    expect(firstThumbnailBuffer.byteLength).toBeGreaterThan(3000);
    expect(firstThumbnailBuffer.readUInt32BE(16)).toBeGreaterThan(700);
    expect(firstThumbnailBuffer.readUInt32BE(20)).toBeGreaterThan(1000);
    const thumbnailRows = await all(
      `SELECT file_assets.storage_path
       FROM document_renders
       INNER JOIN file_assets ON document_renders.file_asset_id = file_assets.id
       WHERE document_renders.document_id = ?
         AND document_renders.render_type = 'thumbnail_png'`,
      [documentId]
    );
    expect(thumbnailRows).toHaveLength(1);

    const secondThumbnail = await admin.getRaw(`/api/documents/${documentId}/thumbnail`);
    expect(secondThumbnail.status).toBe(200);
    expect((await secondThumbnail.arrayBuffer()).byteLength).toBe(firstThumbnailBuffer.byteLength);
    const thumbnailRowsAfterSecondRequest = await all(
      "SELECT id FROM document_renders WHERE document_id = ? AND render_type = 'thumbnail_png'",
      [documentId]
    );
    expect(thumbnailRowsAfterSecondRequest).toHaveLength(1);

    const anonymous = new TestClient(testServer!.baseUrl);
    const anonymousThumbnail = await anonymous.getRaw(`/api/documents/${documentId}/thumbnail`);
    expect(anonymousThumbnail.status).toBe(401);

    for (const row of thumbnailRows) {
      await fs.rm(path.resolve(process.cwd(), String(row.storage_path)), { force: true });
    }
  });
});
