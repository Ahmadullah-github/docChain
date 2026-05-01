import { getJson, postJson } from "./http";
import type { EntityId, JsonRecord } from "./types";

export const collaborationApi = {
  listComments(documentId: EntityId) {
    return getJson<JsonRecord[]>(`/api/documents/${documentId}/comments`);
  },

  createComment(documentId: EntityId, input: { parent_comment_id?: EntityId | null; visibility?: string; body: string }) {
    return postJson<JsonRecord>(`/api/documents/${documentId}/comments`, input);
  },

  listOcrText(documentId: EntityId) {
    return getJson<JsonRecord[]>(`/api/documents/${documentId}/ocr-text`);
  },

  createOcrText(documentId: EntityId, input: JsonRecord) {
    return postJson<JsonRecord>(`/api/documents/${documentId}/ocr-text`, input);
  },

  createVerificationToken(documentId: EntityId, input: { document_render_id?: EntityId | null; expires_at?: string | Date | null } = {}) {
    return postJson<{ id: EntityId; token: string; scope: string }>(`/api/documents/${documentId}/verification-token`, input);
  }
};
