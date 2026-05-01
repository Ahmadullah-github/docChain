import { apiRequest } from "../lib/api";

export type QueryValue = string | number | boolean | null | undefined;
export type QueryParams = Record<string, QueryValue>;

export function withQuery(path: string, query?: QueryParams) {
  if (!query) {
    return path;
  }

  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined && value !== null && value !== "") {
      params.set(key, String(value));
    }
  }

  const serialized = params.toString();
  return serialized ? `${path}?${serialized}` : path;
}

export function getJson<T>(path: string, query?: QueryParams) {
  return apiRequest<T>(withQuery(path, query));
}

export function postJson<T>(path: string, body?: unknown) {
  return apiRequest<T>(path, {
    method: "POST",
    body: body === undefined ? undefined : JSON.stringify(body)
  });
}

export function postForm<T>(path: string, body: FormData) {
  return apiRequest<T>(path, {
    method: "POST",
    body
  });
}

export function patchJson<T>(path: string, body?: unknown) {
  return apiRequest<T>(path, {
    method: "PATCH",
    body: body === undefined ? undefined : JSON.stringify(body)
  });
}

export function deleteJson<T>(path: string, body?: unknown) {
  return apiRequest<T>(path, {
    method: "DELETE",
    body: body === undefined ? undefined : JSON.stringify(body)
  });
}
