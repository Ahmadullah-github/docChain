import type { DocumentType, EntityId, JsonRecord } from "../../../api";

export type SerialWarningIssue =
  | "inactive_rule"
  | "missing_default"
  | "missing_year_token"
  | "missing_sequence_token"
  | "short_padding"
  | "no_serial_documents";

export type SerialSettingsChecks = {
  activeRule: boolean;
  defaultRuleSet: boolean;
  documentTypesCovered: boolean;
  formatHasSequence: boolean;
  formatHasYear: boolean;
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
  signatureRules: JsonRecord[];
  visibilityRules: JsonRecord[];
};

export type SerialSettingsStats = {
  active: number;
  defaultRules: number;
  documentTypes: number;
  finalSignatureRules: number;
  total: number;
  warnings: number;
};
