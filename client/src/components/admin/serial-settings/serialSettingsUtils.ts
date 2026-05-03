import type { JsonRecord } from "../../../api";
import type {
  SerialConflictRow,
  SerialRuleRow,
  SerialSettingsPageData,
  SerialWarningIssue
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

export function formatDateTime(value?: string | null) {
  if (!value) {
    return "-";
  }

  return String(value).replace("T", " ").slice(0, 16);
}

function stringField(record: JsonRecord | null | undefined, key: string, fallback = "") {
  const value = record?.[key];
  return typeof value === "string" && value.trim() ? value : fallback;
}

function numberField(record: JsonRecord | null | undefined, key: string, fallback = 0) {
  const value = record?.[key];
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
  }

  return fallback;
}

function booleanField(record: JsonRecord | null | undefined, key: string) {
  const value = record?.[key];
  return value === true || value === 1 || value === "1" || value === "true";
}

export function sampleSerialFor(format: string, padding: number) {
  const sequence = "1".padStart(Math.max(1, padding), "0");

  return format
    .replaceAll("{YEAR}", "2026")
    .replaceAll("{YY}", "26")
    .replaceAll("{MONTH}", "04")
    .replaceAll("{SEQUENCE}", sequence)
    .replaceAll("{SEQ}", sequence)
    .replaceAll("{ORG}", "UNI")
    .replaceAll("{DOC}", "DOC");
}

function warningIssuesFor(input: {
  defaultRulesCount: number;
  documentTypesRequiringSerial: number;
  format: string;
  padding: number;
  status: string;
}) {
  const issues: SerialWarningIssue[] = [];
  const normalizedFormat = input.format.toUpperCase();

  if (input.status !== "active") {
    issues.push("inactive_rule");
  }
  if (!input.defaultRulesCount) {
    issues.push("missing_default");
  }
  if (!normalizedFormat.includes("{YEAR}") && !normalizedFormat.includes("{YY}")) {
    issues.push("missing_year_token");
  }
  if (!normalizedFormat.includes("{SEQUENCE}") && !normalizedFormat.includes("{SEQ}")) {
    issues.push("missing_sequence_token");
  }
  if (input.padding < 4) {
    issues.push("short_padding");
  }
  if (!input.documentTypesRequiringSerial) {
    issues.push("no_serial_documents");
  }

  return issues;
}

export function buildSerialRuleRows(data: SerialSettingsPageData) {
  const documentTypesRequiringSerial = data.documentTypes.filter((documentType) => documentType.requires_serial).length;
  const defaultRulesCount = data.serialRules.filter((rule) => booleanField(rule, "is_default")).length;

  return data.serialRules
    .map<SerialRuleRow>((rule) => {
      const code = stringField(rule, "code", `serial-${String(rule.id || "")}`);
      const name = stringField(rule, "name", formatLabel(code, "Serial Rule"));
      const format = stringField(rule, "format", "DOC-{YEAR}-{SEQUENCE}");
      const sequencePadding = numberField(rule, "sequence_padding", 6);
      const status = stringField(rule, "status", "draft");
      const warningIssues = warningIssuesFor({
        defaultRulesCount,
        documentTypesRequiringSerial,
        format,
        padding: sequencePadding,
        status
      });

      return {
        checks: {
          activeRule: status === "active",
          defaultRuleSet: defaultRulesCount > 0,
          documentTypesCovered: documentTypesRequiringSerial > 0,
          formatHasSequence: format.toUpperCase().includes("{SEQUENCE}") || format.toUpperCase().includes("{SEQ}"),
          formatHasYear: format.toUpperCase().includes("{YEAR}") || format.toUpperCase().includes("{YY}")
        },
        code,
        format,
        id: numberField(rule, "id"),
        isDefault: booleanField(rule, "is_default"),
        lastUpdated: formatDateTime(stringField(rule, "updated_at") || stringField(rule, "created_at")),
        name,
        notes: stringField(rule, "notes", "-"),
        resetPolicy: stringField(rule, "reset_policy", "yearly"),
        rule,
        sampleSerial: sampleSerialFor(format, sequencePadding),
        scope: stringField(rule, "scope", "global"),
        sequencePadding,
        status,
        warningIssues
      };
    })
    .sort((left, right) => {
      if (left.isDefault !== right.isDefault) {
        return left.isDefault ? -1 : 1;
      }

      if (left.status !== right.status) {
        return left.status === "active" ? -1 : right.status === "active" ? 1 : 0;
      }

      return left.name.localeCompare(right.name);
    });
}

export function buildSerialConflicts(rows: SerialRuleRow[]): SerialConflictRow[] {
  const severityByIssue: Record<SerialWarningIssue, SerialConflictRow["severity"]> = {
    inactive_rule: "medium",
    missing_default: "high",
    missing_sequence_token: "high",
    missing_year_token: "medium",
    no_serial_documents: "low",
    short_padding: "low"
  };

  return rows.flatMap((row) =>
    row.warningIssues.map((issue) => ({
      date: row.lastUpdated,
      id: `${row.id}-${issue}`,
      issue,
      ruleId: row.id,
      ruleCode: row.code,
      ruleName: row.name,
      severity: severityByIssue[issue]
    }))
  );
}

export function rowMatchesSearch(row: SerialRuleRow, search: string) {
  if (!search) {
    return true;
  }

  return [
    row.code,
    row.format,
    row.name,
    row.resetPolicy,
    row.sampleSerial,
    row.scope,
    row.status
  ].some((value) => value.toLowerCase().includes(search));
}
