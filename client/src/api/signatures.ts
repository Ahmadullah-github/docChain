import { deleteJson, getJson, patchJson, postJson } from "./http";
import type {
  EnrollSignatureProfileInput,
  EntityId,
  JsonRecord,
  SignDocumentInput,
  SignTaskInput,
  SignatureAssetPreview,
  SignatureProfile,
  SigningSession,
  SigningSessionInput,
  SignatureUploadSession
} from "./types";

export type SerialRuleStatus = "draft" | "active" | "inactive" | "archived";
export type SerialRuleScope = "global" | "organization" | "origin_unit" | "document_type" | "origin_unit_document_type";
export type SerialRuleResetPolicy = "yearly" | "monthly" | "never";

export type CreateSerialRuleInput = {
  code: string;
  name: string;
  format?: string;
  scope?: SerialRuleScope;
  reset_policy?: SerialRuleResetPolicy;
  sequence_padding?: number;
  is_default?: boolean;
  status?: SerialRuleStatus;
  notes?: string | null;
};

export type UpdateSerialRuleInput = Partial<CreateSerialRuleInput>;

export type PreviewSerialRuleInput = {
  serial_rule_id?: EntityId;
  rule?: {
    format?: string;
    reset_policy?: SerialRuleResetPolicy;
    scope?: SerialRuleScope;
    sequence_padding?: number;
  };
  context?: {
    documentTypeCode?: string;
    organizationCode?: string;
    originUnitCode?: string;
  };
  current_value?: number;
  date?: string | Date;
  sequence_value?: number;
};

export type PreviewSerialRuleResponse = {
  serialValue: string;
  sequencePeriod: string;
  sequenceScope: string;
  sequenceValue: number;
  sequenceYear: number;
  unsupportedTokens: string[];
};

export const signatureApi = {
  getProfile() {
    return getJson<SignatureProfile | null>("/api/signatures/profile");
  },

  getProfileAsset() {
    return getJson<SignatureAssetPreview>("/api/signatures/profile/asset");
  },

  enrollProfile(input: EnrollSignatureProfileInput) {
    return postJson<SignatureProfile>("/api/signatures/profile", input);
  },

  createUploadSession() {
    return postJson<SignatureUploadSession>("/api/signatures/upload-sessions");
  },

  getUploadSession(sessionId: EntityId) {
    return getJson<SignatureUploadSession>(`/api/signatures/upload-sessions/${sessionId}`);
  },

  getUploadSessionAsset(sessionId: EntityId) {
    return getJson<SignatureAssetPreview>(`/api/signatures/upload-sessions/${sessionId}/asset`);
  },

  uploadPhoneSignature(token: string, input: { signature_image_base64: string; original_filename?: string; mime_type?: string }) {
    return postJson<{ session_id: EntityId; status: string }>(`/api/signature-upload/${token}`, input);
  },

  confirmUpload(input: {
    upload_session_id: EntityId;
    pin: string;
    signature_image_base64?: string;
    original_filename?: string;
    mime_type?: string;
  }) {
    return postJson<SignatureProfile>("/api/signatures/profile/confirm-upload", input);
  },

  createSigningSession(documentId: EntityId, input: SigningSessionInput) {
    return postJson<SigningSession>(`/api/signatures/documents/${documentId}/signing-session`, input);
  },

  createTaskSigningSession(documentId: EntityId, taskId: EntityId, input: SigningSessionInput) {
    return postJson<SigningSession>(`/api/signatures/documents/${documentId}/tasks/${taskId}/signing-session`, input);
  },

  signDocument(documentId: EntityId, input: SignDocumentInput) {
    return postJson<{
      detail?: JsonRecord;
      document?: JsonRecord;
      finalRender?: JsonRecord | null;
      serialAssignment: JsonRecord | null;
      signatureEvent: JsonRecord;
    }>(`/api/signatures/documents/${documentId}/sign`, input);
  },

  signTask(documentId: EntityId, taskId: EntityId, input: SignTaskInput) {
    return postJson<{
      detail?: JsonRecord;
      document?: JsonRecord;
      finalRender?: JsonRecord | null;
      serialAssignment: JsonRecord | null;
      signatureEvent: JsonRecord;
    }>(`/api/signatures/documents/${documentId}/tasks/${taskId}/sign`, input);
  },

  listSerialRules() {
    return getJson<JsonRecord[]>("/api/admin/serial-rules");
  },

  createSerialRule(input: CreateSerialRuleInput) {
    return postJson<JsonRecord>("/api/admin/serial-rules", input);
  },

  updateSerialRule(serialRuleId: EntityId, input: UpdateSerialRuleInput) {
    return patchJson<JsonRecord>(`/api/admin/serial-rules/${serialRuleId}`, input);
  },

  updateSerialRuleStatus(serialRuleId: EntityId, status: SerialRuleStatus) {
    return patchJson<JsonRecord>(`/api/admin/serial-rules/${serialRuleId}/status`, { status });
  },

  removeSerialRule(serialRuleId: EntityId) {
    return deleteJson<{ id: EntityId; archived: boolean }>(`/api/admin/serial-rules/${serialRuleId}`);
  },

  previewSerialRule(input: PreviewSerialRuleInput) {
    return postJson<PreviewSerialRuleResponse>("/api/admin/serial-rules/preview", input);
  }
};
