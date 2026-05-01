import type { DocumentType, EntityId, JsonRecord } from "../../../api";
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

function numberField(record: JsonRecord | null | undefined, key: string): EntityId | null {
  const value = record?.[key];
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
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

function isBroadDocumentRule(record: JsonRecord) {
  return record.document_type_id == null || record.document_type_id === "";
}

function isActive(record: JsonRecord | DocumentType) {
  return String(record.status || "").toLowerCase() === "active";
}

function issuesFor(row: Omit<DocumentTypeRow, "warningIssues">) {
  const issues: DocumentTypeWarningIssue[] = [];

  if (row.status !== "active") {
    issues.push("inactive_type");
  }
  if (!row.checks.routingConfigured) {
    issues.push("missing_routing");
  }
  if (!row.checks.signatureConfigured) {
    issues.push("missing_signature");
  }
  if (!row.checks.visibilityConfigured) {
    issues.push("missing_visibility");
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

export function buildDocumentTypeRows(data: DocumentTypePageData) {
  const activeSerialRules = data.serialRules.filter((rule) => stringField(rule, "status", "draft") === "active");
  const activeDefaultSerialRules = activeSerialRules.filter((rule) => booleanField(rule, "is_default"));
  const serialReady = activeDefaultSerialRules.length > 0 || activeSerialRules.length > 0;

  return data.documentTypes
    .map<DocumentTypeRow>((type) => {
      const routingExact = data.routingRules.filter((rule) => sameId(rule.document_type_id, type.id));
      const routingBroad = data.routingRules.filter((rule) => isBroadDocumentRule(rule));
      const activeRoutingRules = [...routingExact, ...routingBroad].filter((rule) => isActive(rule) && rule.allowed !== "denied").length;
      const signatureRules = data.signatureRules.filter((rule) => sameId(rule.document_type_id, type.id));
      const activeSignatureRules = signatureRules.filter(isActive);
      const visibilityRules = data.visibilityRules.filter((rule) => sameId(rule.document_type_id, type.id) || isBroadDocumentRule(rule));
      const rowWithoutIssues: Omit<DocumentTypeRow, "warningIssues"> = {
        activeRoutingRules,
        checks: {
          activeType: type.status === "active",
          routingConfigured: activeRoutingRules > 0,
          serialReady: !type.requires_serial || serialReady,
          signatureConfigured: activeSignatureRules.length > 0,
          visibilityConfigured: visibilityRules.length > 0
        },
        code: type.code,
        description: type.description || "-",
        documentCount: documentCountFor(type, data),
        finalSignatureRules: signatureRules.filter((rule) => booleanField(rule, "can_finalize_document")).length,
        id: type.id,
        name: type.name,
        requiresSerial: type.requires_serial,
        routingRulesCount: routingExact.length + routingBroad.length,
        signatureRulesCount: signatureRules.length,
        status: type.status || "draft",
        type,
        visibilityRulesCount: visibilityRules.length
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
    missing_routing: "high",
    missing_serial_rule: "medium",
    missing_signature: "high",
    missing_visibility: "medium"
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
    row.requiresSerial ? "serial required" : "serial optional"
  ].some((value) => value.toLowerCase().includes(search));
}
