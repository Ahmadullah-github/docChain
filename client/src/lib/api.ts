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
let csrfRefreshPromise: Promise<string | null> | null = null;

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

function requestPathname(path: string) {
  if (/^https?:\/\//i.test(path)) {
    return new URL(path).pathname;
  }
  return path.split("?")[0] || path;
}

function isCsrfExemptPath(path: string) {
  const pathname = requestPathname(path);
  return [
    "/api/auth/login",
    "/api/auth/forgot-password",
    "/api/auth/reset-password"
  ].includes(pathname) || pathname.startsWith("/api/signature-upload/");
}

async function refreshCsrfTokenFromSession() {
  if (csrfRefreshPromise) {
    return csrfRefreshPromise;
  }

  csrfRefreshPromise = fetch("/api/auth/me", {
    credentials: "include",
    headers: {
      "accept-language": apiLocale
    }
  })
    .then(async (response) => {
      const payload = await response.json().catch(() => null) as ApiResult<{ csrfToken?: string | null }> | null;
      const token = response.ok ? payload?.data?.csrfToken || null : null;
      csrfToken = token;
      return token;
    })
    .catch(() => null)
    .finally(() => {
      csrfRefreshPromise = null;
    });

  return csrfRefreshPromise;
}

export async function apiRequest<T>(path: string, options: RequestInit = {}): Promise<T> {
  const method = (options.method || "GET").toUpperCase();
  const unsafeRequest = !["GET", "HEAD", "OPTIONS"].includes(method);
  const csrfExempt = isCsrfExemptPath(path);

  if (unsafeRequest && !csrfExempt && !csrfToken) {
    await refreshCsrfTokenFromSession();
  }

  const request = async () => {
    const headers = new Headers(options.headers);

    if (!headers.has("content-type") && options.body && !isFormDataBody(options.body)) {
      headers.set("content-type", "application/json");
    }

    headers.set("accept-language", apiLocale);

    if (unsafeRequest && csrfToken) {
      headers.set("x-csrf-token", csrfToken);
    }

    const response = await fetch(path, {
      ...options,
      method,
      headers,
      credentials: "include"
    });

    const payload = await response.json().catch(() => null);
    return { payload, response };
  };

  let { payload, response } = await request();

  if (!response.ok && unsafeRequest && !csrfExempt) {
    const errorPayload = payload as ApiErrorPayload | null;
    if (response.status === 403 && errorPayload?.error?.code === "csrf_failed") {
      await refreshCsrfTokenFromSession();
      if (csrfToken) {
        ({ payload, response } = await request());
      }
    }
  }

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
  const unsafeRequest = !["GET", "HEAD", "OPTIONS"].includes(method);
  const csrfExempt = isCsrfExemptPath(path);

  if (unsafeRequest && !csrfExempt && !csrfToken) {
    await refreshCsrfTokenFromSession();
  }

  const request = async () => {
    const headers = new Headers(options.headers);

    if (!headers.has("content-type") && options.body && !isFormDataBody(options.body)) {
      headers.set("content-type", "application/json");
    }

    headers.set("accept-language", apiLocale);

    if (unsafeRequest && csrfToken) {
      headers.set("x-csrf-token", csrfToken);
    }

    return fetch(path, {
      ...options,
      method,
      headers,
      credentials: "include"
    });
  };

  let response = await request();

  if (!response.ok && unsafeRequest && !csrfExempt) {
    const payload = await response.clone().json().catch(() => null);
    const errorPayload = payload as ApiErrorPayload | null;
    if (response.status === 403 && errorPayload?.error?.code === "csrf_failed") {
      await refreshCsrfTokenFromSession();
      if (csrfToken) {
        response = await request();
      }
    }
  }

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
