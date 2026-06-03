import type { JsonRecord } from "../../../api";
import type {
  SerialConflictRow,
  SerialRuleForm,
  SerialRuleRow,
  SerialSettingsPageData,
  SerialWarningIssue
} from "./types";

type BadgeTone = "green" | "amber" | "red" | "blue" | "slate";

export const serialStatusOptions = ["draft", "active", "inactive", "archived"] as const;
export const serialScopeOptions = ["global", "organization", "origin_unit", "document_type", "origin_unit_document_type"] as const;
export const serialResetPolicyOptions = ["yearly", "monthly", "never"] as const;
const supportedSerialTokens = new Set(["YEAR", "YY", "MONTH", "SEQUENCE", "SEQ", "ORG", "DOC"]);

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

function normalizeOption<T extends readonly string[]>(value: string | undefined, options: T, fallback: T[number]): T[number] {
  return options.includes(value || "") ? value as T[number] : fallback;
}

export function unsupportedSerialTokens(format: string) {
  const matches = Array.from(format.matchAll(/\{([A-Z_]+)\}/gi));
  const tokens = matches.map((match) => match[1].toUpperCase());

  return Array.from(new Set(tokens.filter((token) => !supportedSerialTokens.has(token))));
}

export function sampleSerialFor(format: string, padding: number) {
  const sequence = "1".padStart(Math.max(1, padding), "0");

  return format
    .replaceAll("{YEAR}", "2026")
    .replaceAll("{YY}", "26")
    .replaceAll("{MONTH}", "05")
    .replaceAll("{SEQUENCE}", sequence)
    .replaceAll("{SEQ}", sequence)
    .replaceAll("{ORG}", "UNI")
    .replaceAll("{DOC}", "DOC");
}

function warningIssuesFor(input: {
  defaultRulesCount: number;
  documentTypesRequiringSerial: number;
  format: string;
  isDefault: boolean;
  padding: number;
  status: string;
}) {
  const issues: SerialWarningIssue[] = [];
  const normalizedFormat = input.format.toUpperCase();
  const unsupportedTokens = unsupportedSerialTokens(input.format);

  if (input.status !== "active") {
    issues.push("inactive_rule");
  }
  if (input.isDefault && input.status !== "active") {
    issues.push("inactive_default");
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
  if (unsupportedTokens.length) {
    issues.push("unsupported_token");
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
      const isDefault = booleanField(rule, "is_default");
      const unsupportedTokens = unsupportedSerialTokens(format);
      const warningIssues = warningIssuesFor({
        defaultRulesCount,
        documentTypesRequiringSerial,
        format,
        isDefault,
        padding: sequencePadding,
        status
      });

      return {
        checks: {
          activeRule: status === "active",
          defaultRuleSet: defaultRulesCount > 0,
          documentTypesCovered: documentTypesRequiringSerial > 0,
          formatHasSequence: format.toUpperCase().includes("{SEQUENCE}") || format.toUpperCase().includes("{SEQ}"),
          formatHasYear: format.toUpperCase().includes("{YEAR}") || format.toUpperCase().includes("{YY}"),
          formatTokensSupported: unsupportedTokens.length === 0
        },
        code,
        format,
        id: numberField(rule, "id"),
        isDefault,
        lastUpdated: formatDateTime(stringField(rule, "updated_at") || stringField(rule, "created_at")),
        name,
        notes: stringField(rule, "notes", "-"),
        resetPolicy: stringField(rule, "reset_policy", "yearly"),
        rule,
        sampleSerial: sampleSerialFor(format, sequencePadding),
        scope: stringField(rule, "scope", "global"),
        sequencePadding,
        status,
        unsupportedTokens,
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
    inactive_default: "high",
    missing_default: "high",
    missing_sequence_token: "high",
    missing_year_token: "medium",
    no_serial_documents: "low",
    short_padding: "low",
    unsupported_token: "high"
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

export function serialRuleFormDefaults(hasDefaultRule = false): SerialRuleForm {
  return {
    code: "",
    format: "DOC-{YEAR}-{SEQUENCE}",
    id: null,
    is_default: !hasDefaultRule,
    name: "",
    notes: "",
    reset_policy: "yearly",
    scope: "global",
    sequence_padding: 6,
    status: "draft"
  };
}

export function serialRuleFormFromRow(row: SerialRuleRow, clone = false): SerialRuleForm {
  return {
    code: clone ? `${row.code}-COPY` : row.code,
    format: row.format,
    id: clone ? null : row.id,
    is_default: clone ? false : row.isDefault,
    name: clone ? `${row.name} Copy` : row.name,
    notes: row.notes === "-" ? "" : row.notes,
    reset_policy: normalizeOption(row.resetPolicy, serialResetPolicyOptions, "yearly"),
    scope: normalizeOption(row.scope, serialScopeOptions, "global"),
    sequence_padding: row.sequencePadding,
    status: normalizeOption(row.status, serialStatusOptions, "draft")
  };
}

export function serialRuleRowFromForm(form: SerialRuleForm): SerialRuleRow {
  const unsupportedTokens = unsupportedSerialTokens(form.format);

  return {
    checks: {
      activeRule: form.status === "active",
      defaultRuleSet: form.is_default,
      documentTypesCovered: true,
      formatHasSequence: form.format.toUpperCase().includes("{SEQUENCE}") || form.format.toUpperCase().includes("{SEQ}"),
      formatHasYear: form.format.toUpperCase().includes("{YEAR}") || form.format.toUpperCase().includes("{YY}"),
      formatTokensSupported: unsupportedTokens.length === 0
    },
    code: form.code || "unsaved-serial-rule",
    format: form.format,
    id: form.id || 0,
    isDefault: form.is_default,
    lastUpdated: "-",
    name: form.name || "Unsaved serial rule",
    notes: form.notes || "-",
    resetPolicy: form.reset_policy,
    rule: form as unknown as JsonRecord,
    sampleSerial: sampleSerialFor(form.format, form.sequence_padding),
    scope: form.scope,
    sequencePadding: form.sequence_padding,
    status: form.status,
    unsupportedTokens,
    warningIssues: []
  };
}
