import type { DocumentType, EntityId, JsonRecord } from "../../../api";
import type { SerialRuleResetPolicy, SerialRuleScope, SerialRuleStatus } from "../../../api/signatures";

export type SerialWarningIssue =
  | "inactive_rule"
  | "inactive_default"
  | "missing_default"
  | "missing_year_token"
  | "missing_sequence_token"
  | "short_padding"
  | "no_serial_documents"
  | "unsupported_token";

export type SerialSettingsChecks = {
  activeRule: boolean;
  defaultRuleSet: boolean;
  documentTypesCovered: boolean;
  formatHasSequence: boolean;
  formatHasYear: boolean;
  formatTokensSupported: boolean;
};

export type SerialRuleRow = {
  checks: SerialSettingsChecks;
  code: string;
  format: string;
  id: EntityId;
  isDefault: boolean;
  lastUpdated: string;
  name: string;
  notes: string;
  resetPolicy: string;
  rule: JsonRecord;
  sampleSerial: string;
  scope: string;
  sequencePadding: number;
  status: string;
  unsupportedTokens: string[];
  warningIssues: SerialWarningIssue[];
};

export type SerialConflictRow = {
  date: string;
  id: string;
  issue: SerialWarningIssue;
  ruleId: EntityId;
  ruleCode: string;
  ruleName: string;
  severity: "low" | "medium" | "high";
};

export type SerialSettingsPageData = {
  documentTypes: DocumentType[];
  serialRules: JsonRecord[];
};

export type SerialSettingsStats = {
  active: number;
  defaultRules: number;
  documentTypes: number;
  total: number;
  warnings: number;
};

export type SerialRuleForm = {
  id: EntityId | null;
  code: string;
  name: string;
  format: string;
  scope: SerialRuleScope;
  reset_policy: SerialRuleResetPolicy;
  sequence_padding: number;
  is_default: boolean;
  status: SerialRuleStatus;
  notes: string;
};

export type SerialRulePreset = {
  codePrefix: string;
  format: string;
  label: string;
  resetPolicy: SerialRuleResetPolicy;
  scope: SerialRuleScope;
  sequencePadding: number;
};
