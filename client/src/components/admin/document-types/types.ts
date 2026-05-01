import type { DocumentListItem, DocumentType, EntityId, JsonRecord, RoutingRule } from "../../../api";

export type DocumentTypeWarningIssue =
  | "inactive_type"
  | "missing_routing"
  | "missing_signature"
  | "missing_visibility"
  | "missing_serial_rule";

export type DocumentTypeChecks = {
  activeType: boolean;
  routingConfigured: boolean;
  signatureConfigured: boolean;
  visibilityConfigured: boolean;
  serialReady: boolean;
};

export type DocumentTypeRow = {
  activeRoutingRules: number;
  checks: DocumentTypeChecks;
  code: string;
  description: string;
  documentCount: number;
  finalSignatureRules: number;
  id: EntityId;
  name: string;
  requiresSerial: boolean;
  routingRulesCount: number;
  signatureRulesCount: number;
  status: string;
  type: DocumentType;
  visibilityRulesCount: number;
  warningIssues: DocumentTypeWarningIssue[];
};

export type DocumentTypeConflictRow = {
  date: string;
  id: string;
  issue: DocumentTypeWarningIssue;
  severity: "low" | "medium" | "high";
  typeCode: string;
  typeName: string;
};

export type DocumentTypePageData = {
  documentTypes: DocumentType[];
  documents: DocumentListItem[];
  routingRules: RoutingRule[];
  serialRules: JsonRecord[];
  signatureRules: JsonRecord[];
  visibilityRules: JsonRecord[];
};

export type DocumentTypeStats = {
  active: number;
  routed: number;
  serialRequired: number;
  signed: number;
  total: number;
  warnings: number;
};
