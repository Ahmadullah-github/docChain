import { spawnSync } from "node:child_process";
import type { Server } from "node:http";
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

  patch<T>(path: string, body?: unknown) {
    return this.request<T>("PATCH", path, body);
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

describe("unit-owned position administration", () => {
  let testServer: TestServer | null = null;

  beforeAll(async () => {
    runDatabaseReset();
    testServer = await startTestServer();
  });

  afterAll(async () => {
    if (testServer) {
      await closeServer(testServer.server);
      await testServer.closePool();
    }
  });

  it("derives assignment units from positions and enforces active holder policy", async () => {
    if (!testServer) {
      throw new Error("Integration server was not started.");
    }

    const admin = new TestClient(testServer.baseUrl);
    const session = await admin.login("admin", "Admin@12345");
    const adminPersonId = Number(session.user.personId);
    const units = await admin.get<JsonRecord[]>("/api/admin/units");
    const rootUnit = units.find((unit) => unit.code === "UNIVERSITY");
    expect(rootUnit).toBeTruthy();

    const floatingPosition = await admin.postError("/api/admin/positions", {
      code: "floating_position",
      title: "Floating Position",
      status: "active"
    });
    expect(floatingPosition.status).toBe(422);
    expect(floatingPosition.code).toBe("validation_failed");

    const clerkPosition = await admin.post<JsonRecord>("/api/admin/positions", {
      allows_multiple_active_assignments: false,
      authority_level: 10,
      code: "unit_owned_clerk",
      is_signing_authority: false,
      status: "active",
      title: "Unit Owned Clerk",
      unit_id: rootUnit.id
    });
    expect(Number(clerkPosition.unit_id)).toBe(Number(rootUnit.id));
    expect(clerkPosition.unitName).toBe(rootUnit.name);

    const firstAssignment = await admin.post<JsonRecord>("/api/admin/assignments", {
      is_primary: false,
      person_id: adminPersonId,
      position_id: clerkPosition.id,
      status: "active"
    });
    expect(Number(firstAssignment.unitId || firstAssignment.unit_id)).toBe(Number(rootUnit.id));
    expect(firstAssignment.unitName).toBe(rootUnit.name);

    const secondPerson = await admin.post<JsonRecord>("/api/admin/persons", {
      display_name: "Second Holder",
      email: "second.holder@docchain.local",
      first_name: "Second",
      last_name: "Holder",
      status: "active"
    });
    const rejectedDuplicate = await admin.postError("/api/admin/assignments", {
      is_primary: false,
      person_id: secondPerson.id,
      position_id: clerkPosition.id,
      status: "active"
    });
    expect(rejectedDuplicate.status).toBe(409);
    expect(rejectedDuplicate.code).toBe("position_active_holder_exists");

    await admin.patch<JsonRecord>(`/api/admin/positions/${clerkPosition.id}`, {
      allows_multiple_active_assignments: true
    });
    const secondAssignment = await admin.post<JsonRecord>("/api/admin/assignments", {
      is_primary: false,
      person_id: secondPerson.id,
      position_id: clerkPosition.id,
      status: "active"
    });
    expect(Number(secondAssignment.unitId || secondAssignment.unit_id)).toBe(Number(rootUnit.id));

    const temporaryPosition = await admin.post<JsonRecord>("/api/admin/positions", {
      allows_multiple_active_assignments: false,
      code: "temporary_unit_role",
      status: "active",
      title: "Temporary Unit Role",
      unit_id: rootUnit.id
    });
    await admin.post<JsonRecord>("/api/admin/assignments", {
      ends_at: "2020-01-01T00:00:00.000Z",
      is_primary: false,
      person_id: adminPersonId,
      position_id: temporaryPosition.id,
      status: "active"
    });
    const thirdPerson = await admin.post<JsonRecord>("/api/admin/persons", {
      display_name: "Third Holder",
      email: "third.holder@docchain.local",
      first_name: "Third",
      last_name: "Holder",
      status: "active"
    });
    const replacementAssignment = await admin.post<JsonRecord>("/api/admin/assignments", {
      is_primary: false,
      person_id: thirdPerson.id,
      position_id: temporaryPosition.id,
      status: "active"
    });
    expect(Number(replacementAssignment.position_id)).toBe(Number(temporaryPosition.id));

    await admin.post<JsonRecord>("/api/auth/active-assignment", {
      assignmentId: firstAssignment.id
    });
    const myAssignments = await admin.get<JsonRecord[]>("/api/assignments/my");
    const selected = myAssignments.find((assignment) => Number(assignment.id) === Number(firstAssignment.id));
    expect(selected).toBeTruthy();
    expect(Number(selected!.unitId)).toBe(Number(rootUnit.id));
    expect(selected!.unitName).toBe(rootUnit.name);
  });

  it("generates admin codes and returns code conflicts for duplicate manual codes", async () => {
    if (!testServer) {
      throw new Error("Integration server was not started.");
    }

    const admin = new TestClient(testServer.baseUrl);
    await admin.login("admin", "Admin@12345");
    const units = await admin.get<JsonRecord[]>("/api/admin/units");
    const rootUnit = units.find((unit) => unit.code === "UNIVERSITY");
    expect(rootUnit).toBeTruthy();

    const organizationSuggestion = await admin.post<JsonRecord>("/api/admin/code-suggestions", {
      entity_type: "organization",
      name: "Generated Organization"
    });
    expect(organizationSuggestion.code).toMatch(/^GOR-\d{4}$/);

    const generatedOrganization = await admin.post<JsonRecord>("/api/admin/organizations", {
      name: "Generated Organization",
      status: "active"
    });
    expect(generatedOrganization.code).toMatch(/^GOR-\d{4}$/);

    const duplicateOrganization = await admin.postError("/api/admin/organizations", {
      code: generatedOrganization.code,
      name: "Duplicate Generated Organization",
      status: "active"
    });
    expect(duplicateOrganization.status).toBe(409);
    expect(duplicateOrganization.code).toBe("code_conflict");

    const unitTypes = await admin.get<JsonRecord[]>("/api/admin/unit-types");
    const departmentType = unitTypes.find((unitType) => unitType.code === "department") || unitTypes[0];
    const generatedUnit = await admin.post<JsonRecord>("/api/admin/units", {
      name: "Generated Unit",
      organization_id: rootUnit.organization_id,
      parent_unit_id: rootUnit.id,
      status: "active",
      unit_type_id: departmentType.id
    });
    expect(generatedUnit.code).toMatch(/^GUN-\d{4}$/);
    const positionsAfterPlainUnit = await admin.get<JsonRecord[]>("/api/admin/positions");
    expect(positionsAfterPlainUnit.filter((position) => Number(position.unit_id) === Number(generatedUnit.id))).toHaveLength(0);

    const holderUnit = await admin.post<JsonRecord>("/api/admin/units", {
      create_default_position: true,
      name: "Auto Holder Unit",
      name_local: "معاونیت امور علمی",
      organization_id: rootUnit.organization_id,
      parent_unit_id: rootUnit.id,
      status: "active",
      unit_type_id: departmentType.id
    });
    const positionsAfterHolderUnit = await admin.get<JsonRecord[]>("/api/admin/positions");
    const holderPositions = positionsAfterHolderUnit.filter((position) => Number(position.unit_id) === Number(holderUnit.id));
    expect(holderPositions).toHaveLength(1);
    expect(holderPositions[0].title).toBe("Head of Auto Holder Unit");
    expect(holderPositions[0].title_local).toBe("معاون امور علمی");
    expect(holderPositions[0].code).toMatch(/^HAH-\d{4}$/);
    expect(Number(holderPositions[0].authority_level)).toBe(20);
    expect(Boolean(holderPositions[0].is_signing_authority)).toBe(true);
    expect(Boolean(holderPositions[0].allows_multiple_active_assignments)).toBe(false);
    expect(holderPositions[0].status).toBe("active");

    const duplicateUnit = await admin.postError("/api/admin/units", {
      code: holderUnit.code,
      create_default_position: true,
      name: "Rolled Back Holder Unit",
      organization_id: rootUnit.organization_id,
      parent_unit_id: rootUnit.id,
      status: "active",
      unit_type_id: departmentType.id
    });
    expect(duplicateUnit.status).toBe(409);
    expect(duplicateUnit.code).toBe("code_conflict");
    const unitsAfterDuplicate = await admin.get<JsonRecord[]>("/api/admin/units");
    expect(unitsAfterDuplicate.some((unit) => unit.name === "Rolled Back Holder Unit")).toBe(false);

    const generatedPosition = await admin.post<JsonRecord>("/api/admin/positions", {
      status: "active",
      title: "Generated Position",
      unit_id: rootUnit.id
    });
    expect(generatedPosition.code).toMatch(/^GPO-\d{4}$/);

    const generatedDocumentType = await admin.post<JsonRecord>("/api/admin/document-types", {
      name: "Generated Document Type",
      requires_serial: true,
      status: "active"
    });
    expect(generatedDocumentType.code).toMatch(/^GDT-\d{4}$/);

    const generatedPriority = await admin.post<JsonRecord>("/api/admin/priority-levels", {
      name: "Generated Priority",
      rank: 90,
      status: "active"
    });
    expect(generatedPriority.code).toMatch(/^GPR-\d{4}$/);

    const generatedConfidentiality = await admin.post<JsonRecord>("/api/admin/confidentiality-levels", {
      name: "Generated Confidentiality",
      rank: 90,
      status: "active"
    });
    expect(generatedConfidentiality.code).toMatch(/^GCO-\d{4}$/);

    const generatedSerialRule = await admin.post<JsonRecord>("/api/admin/serial-rules", {
      format: "DOC-{YEAR}-{SEQUENCE}",
      name: "Generated Serial",
      reset_policy: "yearly",
      scope: "global",
      sequence_padding: 6,
      status: "draft"
    });
    expect(generatedSerialRule.code).toMatch(/^GSE-\d{4}$/);

    const duplicateSerialRule = await admin.postError("/api/admin/serial-rules", {
      code: generatedSerialRule.code,
      format: "DOC-{YEAR}-{SEQUENCE}",
      name: "Duplicate Generated Serial",
      reset_policy: "yearly",
      scope: "global",
      sequence_padding: 6,
      status: "draft"
    });
    expect(duplicateSerialRule.status).toBe(409);
    expect(duplicateSerialRule.code).toBe("code_conflict");
  });
});
