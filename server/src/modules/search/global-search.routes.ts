import { Router } from "express";
import { z } from "zod";
import { requireAnyRole, requireAuth } from "../../middleware/auth";
import { asyncHandler } from "../../shared/async-handler";
import { ok } from "../../shared/http";
import { rebuildGlobalSearchIndex, searchGlobalIndex } from "./global-search.service";
import type { SearchEntityType } from "./global-search.service";

export const globalSearchRouter = Router();

globalSearchRouter.use(requireAuth, requireAnyRole(["system_admin", "admin_staff"]));

globalSearchRouter.get("/", asyncHandler(async (request, response) => {
  const input = z.object({
    q: z.string().trim().default(""),
    types: z.string().trim().optional(),
    limit: z.coerce.number().int().min(1).max(50).default(20)
  }).parse(request.query);

  const types = input.types
    ? input.types.split(",").map((item) => item.trim()).filter(Boolean) as SearchEntityType[]
    : undefined;

  ok(response, await searchGlobalIndex({ limit: input.limit, q: input.q, types }));
}));

globalSearchRouter.post("/rebuild", asyncHandler(async (_request, response) => {
  await rebuildGlobalSearchIndex();
  ok(response, { rebuilt: true });
}));
