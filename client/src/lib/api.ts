export type ApiResult<T> = {
  data: T;
};

export type ApiErrorPayload = {
  error?: {
    code?: string;
    message?: string;
    details?: unknown;
  };
};

export class ApiError extends Error {
  public readonly status: number;
  public readonly code: string;
  public readonly details?: unknown;

  constructor(status: number, code: string, message: string, details?: unknown) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

let csrfToken: string | null = null;
let apiLocale = "en";

export function setCsrfToken(token: string | null) {
  csrfToken = token;
}

export function setApiLocale(locale: string) {
  apiLocale = locale;
}

function isFormDataBody(body: BodyInit | null | undefined) {
  return typeof FormData !== "undefined" && body instanceof FormData;
}

function filenameFromContentDisposition(value: string | null) {
  const match = value?.match(/filename\*?=(?:UTF-8''|")?([^";]+)/i);
  return match ? decodeURIComponent(match[1].replace(/"$/, "")) : undefined;
}

export async function apiRequest<T>(path: string, options: RequestInit = {}): Promise<T> {
  const method = (options.method || "GET").toUpperCase();
  const headers = new Headers(options.headers);

  if (!headers.has("content-type") && options.body && !isFormDataBody(options.body)) {
    headers.set("content-type", "application/json");
  }

  headers.set("accept-language", apiLocale);

  if (!["GET", "HEAD", "OPTIONS"].includes(method) && csrfToken) {
    headers.set("x-csrf-token", csrfToken);
  }

  const response = await fetch(path, {
    ...options,
    method,
    headers,
    credentials: "include"
  });

  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    const errorPayload = payload as ApiErrorPayload | null;
    throw new ApiError(
      response.status,
      errorPayload?.error?.code || "request_failed",
      errorPayload?.error?.message || "Request failed.",
      errorPayload?.error?.details
    );
  }

  return (payload as ApiResult<T>).data;
}

export async function apiBlobRequest(path: string, options: RequestInit = {}) {
  const method = (options.method || "GET").toUpperCase();
  const headers = new Headers(options.headers);

  headers.set("accept-language", apiLocale);

  if (!["GET", "HEAD", "OPTIONS"].includes(method) && csrfToken) {
    headers.set("x-csrf-token", csrfToken);
  }

  const response = await fetch(path, {
    ...options,
    method,
    headers,
    credentials: "include"
  });

  if (!response.ok) {
    const payload = await response.json().catch(() => null);
    const errorPayload = payload as ApiErrorPayload | null;
    throw new ApiError(
      response.status,
      errorPayload?.error?.code || "request_failed",
      errorPayload?.error?.message || "Request failed.",
      errorPayload?.error?.details
    );
  }

  return {
    blob: await response.blob(),
    filename: filenameFromContentDisposition(response.headers.get("content-disposition"))
  };
}
