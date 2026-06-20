import { randomBytes } from "node:crypto";
import type { NextFunction, Request, Response } from "express";
import { AppError } from "../shared/errors";

const unsafeMethods = new Set(["POST", "PUT", "PATCH", "DELETE"]);
const csrfExemptPaths = new Set([
  "/api/auth/login",
  "/api/auth/forgot-password",
  "/api/auth/reset-password"
]);

export function ensureCsrfToken(request: Request) {
  if (!request.session.csrfToken) {
    request.session.csrfToken = randomBytes(32).toString("hex");
  }

  return request.session.csrfToken;
}

export function csrfGuard(request: Request, _response: Response, next: NextFunction) {
  if (
    !unsafeMethods.has(request.method)
    || csrfExemptPaths.has(request.path)
    || request.path.startsWith("/api/signature-upload/")
  ) {
    next();
    return;
  }

  const expected = request.session.csrfToken;
  const received = request.get("x-csrf-token");

  if (!expected || !received || expected !== received) {
    next(new AppError(403, "csrf_failed", "Invalid or missing CSRF token."));
    return;
  }

  next();
}
