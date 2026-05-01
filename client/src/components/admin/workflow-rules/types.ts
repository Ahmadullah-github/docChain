import type {
  DocumentType,
  EntityId,
  JsonRecord,
  Position,
  RoutingRule,
  RoutingRuleDetail,
  UnitType
} from "../../../api";
import type { IconName } from "../../ui";

export type WorkflowStepTone = "active" | "optional" | "final" | "system" | "warning";

export type WorkflowCanvasStep = {
  icon: IconName;
  id: string;
  subtitle: string;
  title: string;
  tone: WorkflowStepTone;
};

export type WorkflowWarningIssue =
  | "missing_signature_chain"
  | "missing_final_signature"
  | "missing_visibility_policy"
  | "inactive_rule"
  | "denied_rule"
  | "optional_route"
  | "route_signature_mismatch";

export type WorkflowRuleChecks = {
  finalSignatureDefined: boolean;
  noConflictDetected: boolean;
  routingComplete: boolean;
  serialTriggerSet: boolean;
  signatureChainValid: boolean;
};

export type WorkflowRuleRow = {
  actionLabel: string;
  allowed: string;
  canvasSteps: WorkflowCanvasStep[];
  checks: WorkflowRuleChecks;
  detail: RoutingRuleDetail | null;
  documentType: DocumentType | null;
  documentTypeCode: string;
  documentTypeId: EntityId | null;
  documentTypeLabel: string;
  finalSignatory: string;
  fromPositionLabel: string;
  id: EntityId;
  lastUpdated: string;
  originUnitCode: string;
  originUnitLabel: string;
  originUnitType: UnitType | null;
  priority: number;
  rule: RoutingRule;
  ruleCode: string;
  ruleName: string;
  serialRule: JsonRecord | null;
  serialTrigger: string;
  signatureRules: JsonRecord[];
  status: string;
  toPositionLabel: string;
  toUnitLabel: string;
  warningIssues: WorkflowWarningIssue[];
  visibilityPolicy: string;
  visibilityRule: JsonRecord | null;
};

export type WorkflowConflictRow = {
  date: string;
  id: string;
  issue: WorkflowWarningIssue;
  ruleName: string;
  severity: "low" | "medium" | "high";
};

export type WorkflowRulesPageData = {
  documentTypes: DocumentType[];
  positions: Position[];
  routingDetails: Map<EntityId, RoutingRuleDetail | null>;
  routingRules: RoutingRule[];
  serialRules: JsonRecord[];
  signatureRules: JsonRecord[];
  unitTypes: UnitType[];
  visibilityRules: JsonRecord[];
};

export type WorkflowRulesStats = {
  active: number;
  documentTypes: number;
  signatureRules: number;
  total: number;
  visibilityRules: number;
  warnings: number;
};
