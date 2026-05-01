import { getJson, patchJson, postJson } from "./http";
import type { EntityId, RoutingRule, RoutingRuleDetail } from "./types";

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
  }
};
