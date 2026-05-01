import { Router } from "express";
import type { ResultSetHeader, RowDataPacket } from "mysql2/promise";
import { z } from "zod";
import { pool } from "../../db/mysql";
import { requireAuth } from "../../middleware/auth";
import { asyncHandler } from "../../shared/async-handler";
import { created, ok } from "../../shared/http";
import { fetchById } from "../../shared/route-utils";
import { uuid } from "../../shared/ids";

export const savedSearchRouter = Router();

savedSearchRouter.use(requireAuth);

savedSearchRouter.get("/saved-searches", asyncHandler(async (_request, response) => {
  const authUser = response.locals.authUser!;
  const [rows] = await pool.execute<RowDataPacket[]>(
    "SELECT * FROM saved_searches WHERE user_id = ? ORDER BY id DESC",
    [authUser.id]
  );
  ok(response, rows);
}));

savedSearchRouter.post("/saved-searches", asyncHandler(async (request, response) => {
  const authUser = response.locals.authUser!;
  const input = z.object({
    name: z.string().trim().min(1).max(140),
    search_type: z.string().trim().min(1).max(80).default("documents"),
    filters: z.record(z.string(), z.unknown()),
    is_default: z.boolean().default(false)
  }).parse(request.body);
  const [result] = await pool.execute<ResultSetHeader>(
    `INSERT INTO saved_searches (
      uuid, user_id, assignment_id, name, search_type, filters, is_default
    ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [
      uuid(),
      authUser.id,
      request.session.activeAssignmentId || null,
      input.name,
      input.search_type,
      JSON.stringify(input.filters),
      input.is_default
    ]
  );
  const id = result.insertId;
  created(response, await fetchById("saved_searches", Number(id)));
}));
