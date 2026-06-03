import { getJson, patchJson, postJson } from "./http";
import type { EntityId, JsonRecord } from "./types";

export type TransmissionRecipientInput = {
  recipient_type: "unit" | "assignment" | "external_organization" | "external_recipient";
  to_unit_id?: EntityId | null;
  to_assignment_id?: EntityId | null;
  external_organization_id?: EntityId | null;
  external_recipient_id?: EntityId | null;
  recipient_label?: string | null;
  note?: string | null;
};

export type CreateTransmissionInput = {
  transmission_type: string;
  visibility_policy?: string;
  subject_override?: string | null;
  message?: string | null;
  recipients: TransmissionRecipientInput[];
  metadata?: JsonRecord;
};

export type UpdateTransmissionRecipientStatusInput = {
  status: "received" | "acknowledged" | "under_action" | "completed";
  note?: string | null;
};

export type CreateDocumentRenderInput = {
  transmission_id?: EntityId | null;
  file_asset_id?: EntityId | null;
  render_type?: string;
  visibility_policy?: string;
  source_version_number?: number | null;
  render_definition?: JsonRecord;
  signature_visibility?: Array<{
    signature_event_id?: EntityId | null;
    is_visible: boolean;
    visibility_reason?: string | null;
  }>;
};

export type ArchiveDocumentInput = {
  archive_render_id?: EntityId | null;
  retention_policy_id?: EntityId | null;
  reason?: string | null;
  metadata?: JsonRecord;
};

export const transmissionApi = {
  listForDocument(documentId: EntityId) {
    return getJson<{ transmissions: JsonRecord[]; recipients: JsonRecord[] }>(`/api/documents/${documentId}/transmissions`);
  },

  create(documentId: EntityId, input: CreateTransmissionInput) {
    return postJson<{ transmission: JsonRecord; recipients: JsonRecord[] }>(`/api/documents/${documentId}/transmissions`, input);
  },

  updateRecipientStatus(recipientId: EntityId, input: UpdateTransmissionRecipientStatusInput) {
    return patchJson<JsonRecord>(`/api/transmission-recipients/${recipientId}/status`, input);
  },

  createRender(documentId: EntityId, input: CreateDocumentRenderInput) {
    return postJson<{ render: JsonRecord; signatureVisibility: JsonRecord[] }>(`/api/documents/${documentId}/renders`, input);
  },

  archiveDocument(documentId: EntityId, input: ArchiveDocumentInput) {
    return postJson<JsonRecord>(`/api/documents/${documentId}/archive`, input);
  }
};
