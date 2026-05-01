import argon2 from "argon2";
import { randomBytes } from "node:crypto";
import { Router } from "express";
import type { ResultSetHeader, RowDataPacket } from "mysql2/promise";
import { z } from "zod";
import { pool } from "../../db/mysql";
import { requireAnyRole, requireAuth } from "../../middleware/auth";
import { asyncHandler } from "../../shared/async-handler";
import { writeAuditLog } from "../../shared/audit";
import { created, ok } from "../../shared/http";
import { uuid } from "../../shared/ids";

export const adminApiClientRouter = Router();

adminApiClientRouter.use(requireAuth, requireAnyRole(["system_admin", "admin_staff"]));

adminApiClientRouter.get("/api-clients", asyncHandler(async (_request, response) => {
  const [rows] = await pool.execute<RowDataPacket[]>(
    `SELECT id, uuid, client_id, name, status, scopes, last_used_ip,
      last_used_at, created_at, updated_at, revoked_at
     FROM api_clients
     ORDER BY id DESC`
  );
  ok(response, rows);
}));

adminApiClientRouter.post("/api-clients", asyncHandler(async (request, response) => {
  const input = z.object({
    name: z.string().trim().min(1).max(160),
    scopes: z.array(z.string().trim().min(1)).default([])
  }).parse(request.body);
  const clientId = `dc_${randomBytes(12).toString("hex")}`;
  const clientSecret = randomBytes(32).toString("hex");
  const [result] = await pool.execute<ResultSetHeader>(
    `INSERT INTO api_clients (
      uuid, client_id, client_secret_hash, name, status, scopes, created_by_user_id
    ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [
      uuid(),
      clientId,
      await argon2.hash(clientSecret, { type: argon2.argon2id }),
      input.name,
      "active",
      JSON.stringify(input.scopes),
      request.session.userId || null
    ]
  );
  const id = result.insertId;
  await writeAuditLog(request, { action: "admin.api_client.create", entityType: "api_client", entityId: id });
  created(response, { id, clientId, clientSecret, name: input.name, scopes: input.scopes });
}));
