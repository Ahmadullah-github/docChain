import { deleteJson, getJson, patchJson, postJson, putJson } from "./http";
import type { EntityId, JsonRecord, RoutingRule, RoutingRuleDetail } from "./types";

export type RoutingRuleQuery = {
  status?: string;
  action?: string;
  document_type_id?: EntityId;
  limit?: number;
};

export type RoutingRuleConditionInput = {
  condition_key: string;
  operator?: string;
  condition_value: string;
  is_required?: boolean;
};

export type CreateRoutingRuleInput = {
  document_type_id?: EntityId | null;
  from_unit_type_id?: EntityId | null;
  from_position_id?: EntityId | null;
  to_unit_type_id?: EntityId | null;
  to_position_id?: EntityId | null;
  action: string;
  allowed?: "allowed" | "optional" | "denied" | "emergency_only";
  prior_review_required?: boolean;
  prior_signature_required?: boolean;
  is_external_target?: boolean;
  is_multi_recipient?: boolean;
  priority?: number;
  status?: "draft" | "active" | "inactive" | "archived";
  effective_from?: string | Date | null;
  effective_until?: string | Date | null;
  notes?: string | null;
  conditions?: RoutingRuleConditionInput[];
};

export type UpdateRoutingRuleInput = Partial<CreateRoutingRuleInput>;

export type RoutingRuleDesignerSignatureRuleInput = {
  id?: EntityId | null;
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

export type RoutingRuleDesignerVisibilityRuleInput = {
  id?: EntityId | null;
  forwarding_unit_type_id?: EntityId | null;
  document_type_id?: EntityId | null;
  visibility_policy: string;
  show_child_signatures?: boolean;
  show_parent_signatures?: boolean;
  allowed?: string;
  status?: string;
  priority?: number;
  notes?: string | null;
  conditions?: JsonRecord;
};

export type RoutingRuleDesignerSerialRuleInput = {
  id?: EntityId | null;
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

export type RoutingRuleDesignerInput = {
  archive?: {
    serialRuleIds?: EntityId[];
    signatureRuleIds?: EntityId[];
    visibilityRuleIds?: EntityId[];
  };
  routingRule: CreateRoutingRuleInput;
  serialRule?: RoutingRuleDesignerSerialRuleInput | null;
  signatureRules?: RoutingRuleDesignerSignatureRuleInput[];
  visibilityRule?: RoutingRuleDesignerVisibilityRuleInput | null;
};

export type RoutingRuleDesignerResponse = {
  archived: {
    serialRuleIds: EntityId[];
    signatureRuleIds: EntityId[];
    visibilityRuleIds: EntityId[];
  };
  routingRule: RoutingRuleDetail;
  serialRule: JsonRecord | null;
  signatureRules: JsonRecord[];
  visibilityRule: JsonRecord | null;
};

export const routingRulesApi = {
  list(query?: RoutingRuleQuery) {
    return getJson<RoutingRule[]>("/api/admin/routing-rules", query);
  },

  get(routingRuleId: EntityId) {
    return getJson<RoutingRuleDetail>(`/api/admin/routing-rules/${routingRuleId}`);
  },

  create(input: CreateRoutingRuleInput) {
    return postJson<RoutingRuleDetail>("/api/admin/routing-rules", input);
  },

  update(routingRuleId: EntityId, input: UpdateRoutingRuleInput) {
    return patchJson<RoutingRuleDetail>(`/api/admin/routing-rules/${routingRuleId}`, input);
  },

  updateStatus(routingRuleId: EntityId, status: "draft" | "active" | "inactive" | "archived") {
    return patchJson<RoutingRuleDetail>(`/api/admin/routing-rules/${routingRuleId}/status`, { status });
  },

  remove(routingRuleId: EntityId) {
    return deleteJson<{ id: EntityId; archived: boolean }>(`/api/admin/routing-rules/${routingRuleId}`);
  },

  createDesigner(input: RoutingRuleDesignerInput) {
    return postJson<RoutingRuleDesignerResponse>("/api/admin/routing-rules/designer", input);
  },

  updateDesigner(routingRuleId: EntityId, input: RoutingRuleDesignerInput) {
    return putJson<RoutingRuleDesignerResponse>(`/api/admin/routing-rules/designer/${routingRuleId}`, input);
  }
};
