import type { DocumentListItem, DocumentTemplateBinding, DocumentType, EntityId, JsonRecord } from "../../../api";

export type DocumentTypeWarningIssue =
  | "inactive_type"
  | "missing_template"
  | "missing_serial_rule";

export type DocumentTypeChecks = {
  activeType: boolean;
  templateReady: boolean;
  serialReady: boolean;
};

export type DocumentTypeRow = {
  checks: DocumentTypeChecks;
  code: string;
  description: string;
  documentCount: number;
  id: EntityId;
  name: string;
  status: string;
  templateBindingsCount: number;
  type: DocumentType;
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
  serialRules: JsonRecord[];
  templateBindings: DocumentTemplateBinding[];
};

export type DocumentTypeStats = {
  active: number;
  serialReady: number;
  templateReady: number;
  total: number;
  warnings: number;
};
