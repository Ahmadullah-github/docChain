import type { DocumentType, EntityId, JsonRecord, Position, UnitType } from "../../../api";
import type { IconName } from "../../ui";

export type SignatureStepTone = "required" | "optional" | "final" | "system" | "warning";

export type SignatureFlowStep = {
  icon: IconName;
  id: string;
  subtitle: string;
  title: string;
  tone: SignatureStepTone;
};

export type SignatureWarningIssue =
  | "missing_signature_chain"
  | "missing_final_signature"
  | "missing_visibility_policy"
  | "missing_serial_rule"
  | "inactive_chain"
  | "optional_step";

export type SignatureChainChecks = {
  finalSignatoryDefined: boolean;
  noConflictDetected: boolean;
  serialTriggerSet: boolean;
  signatureChainComplete: boolean;
  visibilityPolicySet: boolean;
};

export type SignatureRuleChainRow = {
  chainMode: "sequential" | "parallel";
  checks: SignatureChainChecks;
  documentType: DocumentType | null;
  documentTypeCode: string;
  documentTypeId: EntityId | null;
  documentTypeLabel: string;
  finalSignatory: string;
  flowSteps: SignatureFlowStep[];
  id: string;
  lastUpdated: string;
  originUnitCode: string;
  originUnitLabel: string;
  originUnitType: UnitType | null;
  placement: string;
  ruleCode: string;
  ruleName: string;
  serialRule: JsonRecord | null;
  serialTrigger: string;
  signatureRules: JsonRecord[];
  status: string;
  visibilityPolicy: string;
  visibilityRule: JsonRecord | null;
  warningIssues: SignatureWarningIssue[];
};

export type SignatureConflictRow = {
  date: string;
  id: string;
  issue: SignatureWarningIssue;
  ruleCode: string;
  ruleName: string;
  severity: "low" | "medium" | "high";
};

export type SignatureRulesPageData = {
  documentTypes: DocumentType[];
  positions: Position[];
  serialRules: JsonRecord[];
  signatureRules: JsonRecord[];
  unitTypes: UnitType[];
  visibilityRules: JsonRecord[];
};

export type SignatureRulesStats = {
  activeChains: number;
  documentTypes: number;
  finalRules: number;
  total: number;
  visibilityRules: number;
  warnings: number;
};
