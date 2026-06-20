import { Router } from "express";
import type { ResultSetHeader, RowDataPacket } from "mysql2/promise";
import { z } from "zod";
import { pool } from "../../db/mysql";
import { requireAuth } from "../../middleware/auth";
import { asyncHandler } from "../../shared/async-handler";
import { fetchById } from "../../shared/route-utils";
import { ok } from "../../shared/http";

export const notificationRouter = Router();

notificationRouter.use(requireAuth);

notificationRouter.get("/notifications", asyncHandler(async (request, response) => {
  const authUser = response.locals.authUser!;
  const query = z.object({
    status: z.string().trim().min(1).optional(),
    limit: z.coerce.number().int().min(1).max(100).default(30)
  }).parse(request.query);
  const where = ["recipient_user_id = ?"];
  const params: any[] = [authUser.id];
  if (query.status === "unread") {
    where.push("status <> 'read'");
  } else if (query.status) {
    where.push("status = ?");
    params.push(query.status);
  }
  const limitSql = String(Number(query.limit));
  const [rows] = await pool.execute<RowDataPacket[]>(
    `SELECT *
     FROM notifications
     WHERE ${where.join(" AND ")}
     ORDER BY created_at DESC
     LIMIT ${limitSql}`,
    params
  );
  ok(response, rows);
}));

notificationRouter.get("/notifications/unread-count", asyncHandler(async (_request, response) => {
  const authUser = response.locals.authUser!;
  const [rows] = await pool.execute<RowDataPacket[]>(
    `SELECT COUNT(*) AS count
     FROM notifications
     WHERE recipient_user_id = ?
       AND status <> 'read'`,
    [authUser.id]
  );
  ok(response, { count: Number(rows[0]?.count || 0) });
}));

notificationRouter.patch("/notifications/:notificationId/read", asyncHandler(async (request, response) => {
  const authUser = response.locals.authUser!;
  const { notificationId } = z.object({ notificationId: z.coerce.number().int().positive() }).parse(request.params);
  await pool.execute<ResultSetHeader>(
    `UPDATE notifications
     SET status = 'read', read_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
     WHERE id = ? AND recipient_user_id = ?`,
    [notificationId, authUser.id]
  );
  ok(response, await fetchById("notifications", notificationId));
}));

notificationRouter.patch("/notifications/read-all", asyncHandler(async (_request, response) => {
  const authUser = response.locals.authUser!;
  await pool.execute<ResultSetHeader>(
    `UPDATE notifications
     SET status = 'read', read_at = COALESCE(read_at, CURRENT_TIMESTAMP), updated_at = CURRENT_TIMESTAMP
     WHERE recipient_user_id = ? AND status <> 'read'`,
    [authUser.id]
  );
  ok(response, { markedRead: true });
}));

notificationRouter.get("/notification-preferences", asyncHandler(async (_request, response) => {
  const authUser = response.locals.authUser!;
  const [rows] = await pool.execute<RowDataPacket[]>(
    `SELECT *
     FROM notification_preferences
     WHERE user_id = ?
     ORDER BY notification_type ASC`,
    [authUser.id]
  );
  ok(response, rows);
}));

notificationRouter.post("/notification-preferences", asyncHandler(async (request, response) => {
  const authUser = response.locals.authUser!;
  const input = z.object({
    notification_type: z.string().trim().min(1).max(120),
    in_app_enabled: z.boolean().default(true),
    email_enabled: z.boolean().default(false),
    sms_enabled: z.boolean().default(false),
    settings: z.record(z.string(), z.unknown()).optional()
  }).parse(request.body);
  await pool.execute<ResultSetHeader>(
    `INSERT INTO notification_preferences (
      user_id, notification_type, in_app_enabled, email_enabled, sms_enabled, settings
    ) VALUES (?, ?, ?, ?, ?, ?)
    ON DUPLICATE KEY UPDATE
      in_app_enabled = VALUES(in_app_enabled),
      email_enabled = VALUES(email_enabled),
      sms_enabled = VALUES(sms_enabled),
      settings = VALUES(settings),
      updated_at = CURRENT_TIMESTAMP`,
    [
      authUser.id,
      input.notification_type,
      input.in_app_enabled,
      input.email_enabled,
      input.sms_enabled,
      JSON.stringify(input.settings || {})
    ]
  );
  const [rows] = await pool.execute<RowDataPacket[]>(
    `SELECT *
     FROM notification_preferences
     WHERE user_id = ? AND notification_type = ?
     LIMIT 1`,
    [authUser.id, input.notification_type]
  );
  ok(response, rows[0] || null);
}));
