import { getJson, postJson, withQuery } from "./http";
import { apiRequest } from "../lib/api";
import type { GlobalSearchEntityType, GlobalSearchResult, JsonRecord } from "./types";

export const savedSearchApi = {
  list() {
    return getJson<JsonRecord[]>("/api/saved-searches");
  },

  create(input: { name: string; search_type?: string; filters: JsonRecord; is_default?: boolean }) {
    return postJson<JsonRecord>("/api/saved-searches", input);
  }
};

export const globalSearchApi = {
  search(query: { q: string; types?: GlobalSearchEntityType[]; limit?: number }, signal?: AbortSignal) {
    return apiRequest<GlobalSearchResult[]>(withQuery("/api/admin/search", {
      q: query.q,
      types: query.types?.join(","),
      limit: query.limit
    }), { signal });
  }
};
