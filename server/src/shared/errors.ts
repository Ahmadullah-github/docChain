export class AppError extends Error {
  public readonly statusCode: number;
  public readonly code: string;
  public readonly details?: unknown;

  constructor(statusCode: number, code: string, message: string, details?: unknown) {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
  }
}

export const unauthorized = () => new AppError(401, "unauthorized", "Authentication is required.");

export const forbidden = () => new AppError(403, "forbidden", "You are not allowed to perform this action.");

export const notFound = (entity = "Resource") => new AppError(404, "not_found", `${entity} was not found.`);

