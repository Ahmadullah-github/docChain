import { getJson, patchJson, postJson } from "./http";
import type {
  CreateDocumentInput,
  DocumentDetail,
  DocumentListItem,
  DocumentTask,
  EntityId,
  JsonRecord,
  UpdateDocumentInput
} from "./types";

export type DocumentListQuery = {
  status?: string;
  q?: string;
  document_type_id?: EntityId;
  limit?: number;
};

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

  create(input: CreateDocumentInput) {
    return postJson<DocumentDetail>("/api/documents", input);
  },

  get(documentId: EntityId) {
    return getJson<DocumentDetail>(`/api/documents/${documentId}`);
  },

  update(documentId: EntityId, input: UpdateDocumentInput) {
    return patchJson<DocumentDetail>(`/api/documents/${documentId}`, input);
  },

  addRelation(documentId: EntityId, input: CreateRelationInput) {
    return postJson<JsonRecord>(`/api/documents/${documentId}/relations`, input);
  },

  addAttachment(documentId: EntityId, input: CreateAttachmentInput) {
    return postJson<JsonRecord>(`/api/documents/${documentId}/attachments`, input);
  },

  createTask(documentId: EntityId, input: CreateTaskInput) {
    return postJson<DocumentTask>(`/api/documents/${documentId}/tasks`, input);
  },

  completeTask(documentId: EntityId, taskId: EntityId, completion_note?: string | null) {
    return patchJson<DocumentTask>(`/api/documents/${documentId}/tasks/${taskId}/complete`, { completion_note });
  }
};
