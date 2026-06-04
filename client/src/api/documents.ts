import { deleteJson, getJson, patchJson, postForm, postJson } from "./http";
import type {
  CreateDocumentInput,
  DocumentDetail,
  DocumentListItem,
  DocumentRegistryStats,
  DocumentSendOptions,
  DocumentScope,
  DocumentTask,
  EntityId,
  JsonRecord,
  SendDocumentInput,
  UpdateDocumentInput
} from "./types";

export type DocumentListQuery = {
  status?: string;
  q?: string;
  document_type_id?: EntityId;
  priority_level_id?: EntityId;
  confidentiality_level_id?: EntityId;
  date_from?: string;
  date_to?: string;
  scope?: DocumentScope;
  limit?: number;
  offset?: number;
};

export type DocumentStatsQuery = Omit<DocumentListQuery, "limit" | "offset">;

export type CreateRelationInput = {
  related_document_id: EntityId;
  relation_type: "parent" | "reply" | "reference" | "derived" | "related";
  note?: string | null;
};

export type CreateAttachmentInput = {
  purpose?: string;
  storage_disk?: string;
  storage_path: string;
  original_filename: string;
  stored_filename?: string | null;
  mime_type: string;
  byte_size: number;
  checksum_sha256?: string | null;
  encryption_status?: string;
  metadata?: JsonRecord;
  attachment_type?: string;
  title?: string | null;
  description?: string | null;
};

export type CreateTaskInput = {
  workflow_event_id?: EntityId | null;
  assigned_unit_id?: EntityId | null;
  assigned_position_id?: EntityId | null;
  assigned_assignment_id?: EntityId | null;
  task_type: string;
  title: string;
  description?: string | null;
  due_at?: string | Date | null;
};

export const documentApi = {
  list(query?: DocumentListQuery) {
    return getJson<DocumentListItem[]>("/api/documents", query);
  },

  stats(query?: DocumentStatsQuery) {
    return getJson<DocumentRegistryStats>("/api/documents/stats", query);
  },

  create(input: CreateDocumentInput) {
    return postJson<DocumentDetail>("/api/documents", input);
  },

  get(documentId: EntityId) {
    return getJson<DocumentDetail>(`/api/documents/${documentId}`);
  },

  update(documentId: EntityId, input: UpdateDocumentInput) {
    return patchJson<DocumentDetail>(`/api/documents/${documentId}`, input);
  },

  delete(documentId: EntityId) {
    return deleteJson<{ deleted: boolean; id: EntityId; status: string }>(`/api/documents/${documentId}`);
  },

  sendOptions(documentId: EntityId, query?: { q?: string; limit?: number }) {
    return getJson<DocumentSendOptions>(`/api/documents/${documentId}/send-options`, query);
  },

  send(documentId: EntityId, input: SendDocumentInput) {
    return postJson<{ event: JsonRecord; sendRender?: JsonRecord; tasks?: DocumentTask[]; message: string }>(`/api/documents/${documentId}/send`, input);
  },

  finalize(documentId: EntityId, input: { note?: string | null } = {}) {
    return postJson<{ detail: DocumentDetail; finalRender?: JsonRecord | null; serialAssignment: JsonRecord | null }>(`/api/documents/${documentId}/finalize`, input);
  },

  archive(documentId: EntityId, input: { note?: string | null; reason?: string | null } = {}) {
    return postJson<{ detail: DocumentDetail; finalRender?: JsonRecord | null; serialAssignment: JsonRecord | null }>(`/api/documents/${documentId}/archive`, input);
  },

  renderFileUrl(renderId: EntityId, options?: { download?: boolean }) {
    return `/api/document-renders/${renderId}/file${options?.download ? "?download=1" : ""}`;
  },

  addRelation(documentId: EntityId, input: CreateRelationInput) {
    return postJson<JsonRecord>(`/api/documents/${documentId}/relations`, input);
  },

  addAttachment(documentId: EntityId, input: CreateAttachmentInput) {
    return postJson<JsonRecord>(`/api/documents/${documentId}/attachments`, input);
  },

  uploadAttachment(documentId: EntityId, input: {
    attachment_type?: string;
    description?: string | null;
    file: File;
    title?: string | null;
  }) {
    const formData = new FormData();
    formData.append("file", input.file);
    if (input.attachment_type) {
      formData.append("attachment_type", input.attachment_type);
    }
    if (input.title) {
      formData.append("title", input.title);
    }
    if (input.description) {
      formData.append("description", input.description);
    }
    return postForm<JsonRecord>(`/api/documents/${documentId}/attachments/upload`, formData);
  },

  createTask(documentId: EntityId, input: CreateTaskInput) {
    return postJson<DocumentTask>(`/api/documents/${documentId}/tasks`, input);
  },

  completeTask(documentId: EntityId, taskId: EntityId, completion_note?: string | null) {
    return patchJson<DocumentTask>(`/api/documents/${documentId}/tasks/${taskId}/complete`, { completion_note });
  }
};
