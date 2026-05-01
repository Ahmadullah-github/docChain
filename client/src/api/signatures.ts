import { getJson, patchJson, postJson } from "./http";
import type {
  EnrollSignatureProfileInput,
  EntityId,
  JsonRecord,
  SignSlotInput,
  SignatureProfile,
  SignatureSlot
} from "./types";

export type GenerateSignatureSlotsInput = {
  force?: boolean;
};

export type CreateSignatureRuleInput = {
  document_type_id: EntityId;
  origin_unit_type_id?: EntityId | null;
  step_number: number;
  required_position_id: EntityId;
  required_unit_scope: string;
  signature_mode?: string;
  is_required?: boolean;
  is_parallel?: boolean;
  can_finalize_document?: boolean;
  can_be_hidden_later?: boolean;
  status?: "draft" | "active" | "inactive" | "archived";
  notes?: string | null;
};

export type CreateSerialRuleInput = {
  code: string;
  name: string;
  format?: string;
  scope?: "global";
  reset_policy?: "yearly";
  sequence_padding?: number;
  is_default?: boolean;
  status?: "draft" | "active" | "inactive" | "archived";
  notes?: string | null;
};

export const signatureApi = {
  getProfile() {
    return getJson<SignatureProfile | null>("/api/signatures/profile");
  },

  enrollProfile(input: EnrollSignatureProfileInput) {
    return postJson<SignatureProfile>("/api/signatures/profile", input);
  },

  listSlots(documentId: EntityId) {
    return getJson<SignatureSlot[]>(`/api/signatures/documents/${documentId}/slots`);
  },

  generateSlots(documentId: EntityId, input: GenerateSignatureSlotsInput = {}) {
    return postJson<SignatureSlot[]>(`/api/signatures/documents/${documentId}/slots/generate`, input);
  },

  signSlot(documentId: EntityId, slotId: EntityId, input: SignSlotInput) {
    return postJson<{
      signatureEvent: JsonRecord;
      slots: SignatureSlot[];
      document: JsonRecord;
      serialAssignment: JsonRecord | null;
    }>(`/api/signatures/documents/${documentId}/slots/${slotId}/sign`, input);
  },

  listSignatureRules() {
    return getJson<JsonRecord[]>("/api/admin/signature-rules");
  },

  createSignatureRule(input: CreateSignatureRuleInput) {
    return postJson<JsonRecord>("/api/admin/signature-rules", input);
  },

  updateSignatureRuleStatus(signatureRuleId: EntityId, status: "draft" | "active" | "inactive" | "archived") {
    return patchJson<JsonRecord>(`/api/admin/signature-rules/${signatureRuleId}/status`, { status });
  },

  listSerialRules() {
    return getJson<JsonRecord[]>("/api/admin/serial-rules");
  },

  createSerialRule(input: CreateSerialRuleInput) {
    return postJson<JsonRecord>("/api/admin/serial-rules", input);
  },

  updateSerialRuleStatus(serialRuleId: EntityId, status: "draft" | "active" | "inactive" | "archived") {
    return patchJson<JsonRecord>(`/api/admin/serial-rules/${serialRuleId}/status`, { status });
  }
};
