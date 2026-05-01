import type { Response } from "express";

export function ok(response: Response, data: unknown, status = 200) {
  return response.status(status).json({ data });
}

export function created(response: Response, data: unknown) {
  return ok(response, data, 201);
}

