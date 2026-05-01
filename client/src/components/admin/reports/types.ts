import type {
  AdminAssignment,
  AuditLog,
  DocumentListItem,
  DocumentType,
  JsonRecord,
  Organization,
  Position,
  RoutingRule,
  Unit,
  UserListItem
} from "../../../api";
import type { TranslationKey } from "../../../i18n";

export type ReportCategory = "documents" | "workflow" | "structure" | "authority" | "security" | "serial";

export type ReportStatus = "ready" | "review" | "empty";

export type ReportCheck = {
  labelKey: "dataAvailable" | "coverageReady" | "auditReady" | "exportReady";
  ok: boolean;
};

export type ReportRow = {
  category: ReportCategory;
  descriptionKey: TranslationKey;
  id: string;
  metric: number;
  metricLabelKey: TranslationKey;
  nameKey: TranslationKey;
  secondaryMetric: number;
  secondaryMetricLabelKey: TranslationKey;
  status: ReportStatus;
  updatedAt: string;
  checks: ReportCheck[];
};

export type ReportIssueType =
  | "no_documents"
  | "no_active_assignments"
  | "workflow_warnings"
  | "serial_not_ready"
  | "audit_sparse";

export type ReportIssue = {
  category: ReportCategory;
  id: string;
  issue: ReportIssueType;
  severity: "low" | "medium" | "high";
};

export type ReportsPageData = {
  assignments: AdminAssignment[];
  auditLogs: AuditLog[];
  documentTypes: DocumentType[];
  documents: DocumentListItem[];
  organizations: Organization[];
  positions: Position[];
  routingRules: RoutingRule[];
  serialRules: JsonRecord[];
  signatureRules: JsonRecord[];
  units: Unit[];
  users: UserListItem[];
  visibilityRules: JsonRecord[];
};

export type ReportStats = {
  activeAssignments: number;
  auditEvents: number;
  documents: number;
  reportPacks: number;
  signatureRules: number;
  workflowRules: number;
};
