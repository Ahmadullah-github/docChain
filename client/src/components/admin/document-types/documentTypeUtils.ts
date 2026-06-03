import type { DocumentTemplateBinding, DocumentType, EntityId, JsonRecord } from "../../../api";
import type {
  DocumentTypeConflictRow,
  DocumentTypePageData,
  DocumentTypeRow,
  DocumentTypeWarningIssue
} from "./types";

type BadgeTone = "green" | "amber" | "red" | "blue" | "slate";

export function normalizeSearch(value: string) {
  return value.trim().toLowerCase();
}

export function statusTone(status: string): BadgeTone {
  switch (status) {
    case "active":
      return "green";
    case "draft":
      return "slate";
    case "inactive":
    case "archived":
      return "slate";
    default:
      return "amber";
  }
}

export function formatLabel(value?: string | null, fallback = "-") {
  if (!value) {
    return fallback;
  }

  return value
    .replaceAll("_", " ")
    .replaceAll("-", " ")
    .split(" ")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function stringField(record: JsonRecord | null | undefined, key: string, fallback = "") {
  const value = record?.[key];
  return typeof value === "string" && value.trim() ? value : fallback;
}

function booleanField(record: JsonRecord | null | undefined, key: string) {
  const value = record?.[key];
  return value === true || value === 1 || value === "1" || value === "true";
}

function sameId(left: unknown, right: EntityId) {
  if (left == null || left === "") {
    return false;
  }

  return String(left) === String(right);
}

function isActive(record: JsonRecord | DocumentTemplateBinding | DocumentType) {
  return String(record.status || "").toLowerCase() === "active";
}

function issuesFor(row: Omit<DocumentTypeRow, "warningIssues">) {
  const issues: DocumentTypeWarningIssue[] = [];

  if (row.status !== "active") {
    issues.push("inactive_type");
  }
  if (!row.checks.templateReady) {
    issues.push("missing_template");
  }
  if (!row.checks.serialReady) {
    issues.push("missing_serial_rule");
  }

  return issues;
}

function documentCountFor(type: DocumentType, data: DocumentTypePageData) {
  const normalizedCode = type.code.toLowerCase();
  const normalizedName = type.name.toLowerCase();

  return data.documents.filter((document) =>
    document.documentTypeCode?.toLowerCase() === normalizedCode
    || document.documentTypeName?.toLowerCase() === normalizedName
  ).length;
}

function isOfficialTemplateBinding(binding: DocumentTemplateBinding) {
  return binding.variant === "official";
}

function bindingMatchesDocumentType(binding: DocumentTemplateBinding, typeId: EntityId) {
  return binding.document_type_id == null || String(binding.document_type_id) === "" || sameId(binding.document_type_id, typeId);
}

export function buildDocumentTypeRows(data: DocumentTypePageData) {
  const activeSerialRules = data.serialRules.filter((rule) => stringField(rule, "status", "draft") === "active");
  const activeDefaultSerialRules = activeSerialRules.filter((rule) => booleanField(rule, "is_default"));
  const serialReady = activeDefaultSerialRules.length > 0 || activeSerialRules.length > 0;
  const activeOfficialBindings = data.templateBindings.filter((binding) => isActive(binding) && isOfficialTemplateBinding(binding));

  return data.documentTypes
    .map<DocumentTypeRow>((type) => {
      const templateBindings = activeOfficialBindings.filter((binding) => bindingMatchesDocumentType(binding, type.id));
      const rowWithoutIssues: Omit<DocumentTypeRow, "warningIssues"> = {
        checks: {
          activeType: type.status === "active",
          serialReady,
          templateReady: templateBindings.length > 0
        },
        code: type.code,
        description: type.description || "-",
        documentCount: documentCountFor(type, data),
        id: type.id,
        name: type.name,
        status: type.status || "draft",
        templateBindingsCount: templateBindings.length,
        type
      };

      return {
        ...rowWithoutIssues,
        warningIssues: issuesFor(rowWithoutIssues)
      };
    })
    .sort((left, right) => {
      if (left.status !== right.status) {
        return left.status === "active" ? -1 : right.status === "active" ? 1 : 0;
      }

      return left.name.localeCompare(right.name);
    });
}

export function buildDocumentTypeConflicts(rows: DocumentTypeRow[]): DocumentTypeConflictRow[] {
  const severityByIssue: Record<DocumentTypeWarningIssue, DocumentTypeConflictRow["severity"]> = {
    inactive_type: "low",
    missing_serial_rule: "medium",
    missing_template: "high"
  };

  return rows.flatMap((row) =>
    row.warningIssues.map((issue) => ({
      date: "-",
      id: `${row.id}-${issue}`,
      issue,
      severity: severityByIssue[issue],
      typeCode: row.code,
      typeName: row.name
    }))
  );
}

export function readinessScore(row: DocumentTypeRow) {
  return Object.values(row.checks).filter(Boolean).length;
}

export function rowMatchesSearch(row: DocumentTypeRow, search: string) {
  if (!search) {
    return true;
  }

  return [
    row.code,
    row.description,
    row.name,
    row.status,
    "serial required",
    row.checks.templateReady ? "template ready" : "template missing"
  ].some((value) => value.toLowerCase().includes(search));
}
