import { getJson, patchJson, postJson } from "./http";
import type {
  CreateWalkInDocumentInput,
  CreateWalkInRequestInput,
  EntityId,
  JsonRecord,
  UpdateWalkInPersonsInput,
  WalkInHandoverMethod,
  WalkInPrintType,
  WalkInReference,
  WalkInRequestDetail
} from "./types";

export const walkInIssuanceApi = {
  reference() {
    return getJson<WalkInReference>("/api/walk-in-issuance/reference");
  },

  documentTypes() {
    return getJson<WalkInReference["documentTypes"]>("/api/walk-in-issuance/document-types");
  },

  createRequest(input: CreateWalkInRequestInput) {
    return postJson<WalkInRequestDetail>("/api/walk-in-issuance/requests", input);
  },

  getRequest(requestId: EntityId) {
    return getJson<WalkInRequestDetail>(`/api/walk-in-issuance/requests/${requestId}`);
  },

  updatePersons(requestId: EntityId, input: UpdateWalkInPersonsInput) {
    return patchJson<WalkInRequestDetail>(`/api/walk-in-issuance/requests/${requestId}/persons`, input);
  },

  createDocument(requestId: EntityId, input: CreateWalkInDocumentInput) {
    return postJson<WalkInRequestDetail>(`/api/walk-in-issuance/requests/${requestId}/create-document`, input);
  },

  recordPrintEvent(requestId: EntityId, input: {
    copy_number?: number;
    print_reason?: string | null;
    print_type?: WalkInPrintType;
  }) {
    return postJson<WalkInRequestDetail>(`/api/walk-in-issuance/requests/${requestId}/print-events`, input);
  },

  recordHandover(requestId: EntityId, input: {
    copy_count?: number;
    handover_method?: WalkInHandoverMethod;
    handover_note?: string | null;
    printed_snapshot_id?: EntityId | null;
    receiver_signature_asset_id?: EntityId | null;
    receiver_thumbprint_asset_id?: EntityId | null;
  }) {
    return postJson<WalkInRequestDetail>(`/api/walk-in-issuance/requests/${requestId}/handover`, input);
  },

  archive(requestId: EntityId, input: { note?: string | null; reason?: string | null } = {}) {
    return postJson<WalkInRequestDetail>(`/api/walk-in-issuance/requests/${requestId}/archive`, input);
  },

  cancel(requestId: EntityId, input: { note?: string | null; reason?: string | null } = {}) {
    return postJson<WalkInRequestDetail>(`/api/walk-in-issuance/requests/${requestId}/cancel`, input);
  }
};

export type WalkInActionResponse = WalkInRequestDetail | JsonRecord;
