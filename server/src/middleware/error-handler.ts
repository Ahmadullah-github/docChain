import type { NextFunction, Request, Response } from "express";
import { ZodError } from "zod";
import { AppError } from "../shared/errors";
import { logger } from "../config/logger";

export function notFoundHandler(request: Request, response: Response) {
  response.status(404).json({
    error: {
      code: "not_found",
      message: `Route not found: ${request.method} ${request.path}`
    }
  });
}

export function errorHandler(error: unknown, _request: Request, response: Response, _next: NextFunction) {
  if (error instanceof AppError) {
    response.status(error.statusCode).json({
      error: {
        code: error.code,
        message: error.message,
        details: error.details
      }
    });
    return;
  }

  if (error instanceof ZodError) {
    response.status(422).json({
      error: {
        code: "validation_failed",
        message: "Request validation failed.",
        details: error.flatten()
      }
    });
    return;
  }

  logger.error({ error }, "Unhandled application error");
  response.status(500).json({
    error: {
      code: "internal_server_error",
      message: "An unexpected error occurred."
    }
  });
}

