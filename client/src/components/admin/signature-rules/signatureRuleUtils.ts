import type { DocumentType, EntityId, JsonRecord, Position, UnitType } from "../../../api";
import type {
  SignatureChainChecks,
  SignatureConflictRow,
  SignatureFlowStep,
  SignatureRuleChainRow,
  SignatureRulesPageData,
  SignatureWarningIssue
} from "./types";

type LabelMaps = {
  documentTypes: Map<EntityId, DocumentType>;
  positions: Map<EntityId, Position>;
  unitTypes: Map<EntityId, UnitType>;
};

type BadgeTone = "green" | "amber" | "red" | "blue" | "slate";

export function normalizeSearch(value: string) {
  return value.trim().toLowerCase();
}

export function formatDateTime(value?: string | null) {
  if (!value) {
    return "-";
  }

  return String(value).replace("T", " ").slice(0, 16);
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

export function signStepTone(rule: JsonRecord): BadgeTone {
  if (booleanField(rule, "can_finalize_document")) {
    return "red";
  }

  return booleanField(rule, "is_required") || !("is_required" in rule) ? "green" : "amber";
}

function stringField(record: JsonRecord | null | undefined, key: string, fallback = "") {
  const value = record?.[key];
  return typeof value === "string" && value.trim() ? value : fallback;
}

function numberField(record: JsonRecord | null | undefined, key: string) {
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

export function booleanField(record: JsonRecord | null | undefined, key: string) {
  const value = record?.[key];
  return value === true || value === 1 || value === "1" || value === "true";
}

function sameId(left: unknown, right: unknown) {
  if (left == null || right == null) {
    return false;
  }

  return String(left) === String(right);
}

function codeFor(value: string, fallback: string) {
  const code = value
    .split(/[\s_-]+/)
    .filter(Boolean)
    .map((part) => part.slice(0, 3).toUpperCase())
    .join("-");

  return code || fallback;
}

function documentTypeFor(rule: JsonRecord, maps: LabelMaps) {
  const documentTypeId = numberField(rule, "document_type_id");
  const documentType = documentTypeId ? maps.documentTypes.get(documentTypeId) || null : null;
  const code = documentType?.code || stringField(rule, "documentTypeCode", documentTypeId ? `doc-${documentTypeId}` : "all");
  const label = documentType?.name || stringField(rule, "documentTypeName", formatLabel(code, "All document types"));

  return { code, documentType, documentTypeId, label };
}

function unitTypeFor(rule: JsonRecord, maps: LabelMaps) {
  const originUnitTypeId = numberField(rule, "origin_unit_type_id");
  const unitType = originUnitTypeId ? maps.unitTypes.get(originUnitTypeId) || null : null;
  const code = unitType?.code || stringField(rule, "originUnitTypeCode", originUnitTypeId ? `unit-${originUnitTypeId}` : "any");
  const label = unitType?.name || (originUnitTypeId ? formatLabel(code, "Configured origin") : "Any");

  return { code, label, unitType };
}

function positionTitle(rule: JsonRecord, maps: LabelMaps) {
  const positionId = numberField(rule, "required_position_id");
  const position = positionId ? maps.positions.get(positionId) || null : null;
  return position?.title
    || stringField(rule, "requiredPositionTitle")
    || formatLabel(stringField(rule, "requiredPositionCode"), "Configured Signatory");
}

function serialRuleFor(serialRules: JsonRecord[]) {
  return serialRules.find((serialRule) => stringField(serialRule, "status", "draft") === "active" && booleanField(serialRule, "is_default"))
    || serialRules.find((serialRule) => stringField(serialRule, "status", "draft") === "active")
    || null;
}

function visibilityRuleFor(chainRules: JsonRecord[], visibilityRules: JsonRecord[]) {
  const firstRule = chainRules[0] || null;
  const documentTypeId = numberField(firstRule, "document_type_id");
  const originUnitTypeId = numberField(firstRule, "origin_unit_type_id");

  return visibilityRules.find((visibilityRule) => {
    const matchesDocumentType = visibilityRule.document_type_id == null || !documentTypeId || sameId(visibilityRule.document_type_id, documentTypeId);
    const matchesOrigin = visibilityRule.forwarding_unit_type_id == null || !originUnitTypeId || sameId(visibilityRule.forwarding_unit_type_id, originUnitTypeId);
    return matchesDocumentType && matchesOrigin && stringField(visibilityRule, "status", "draft") !== "archived";
  }) || null;
}

function statusFor(chainRules: JsonRecord[]) {
  if (chainRules.some((rule) => stringField(rule, "status", "draft") === "active")) {
    return "active";
  }

  return stringField(chainRules[0], "status", "draft");
}

function chainModeFor(chainRules: JsonRecord[]) {
  return chainRules.some((rule) => booleanField(rule, "is_parallel")) ? "parallel" : "sequential";
}

function finalSignatoryFor(chainRules: JsonRecord[], maps: LabelMaps) {
  const finalRule = chainRules.find((rule) => booleanField(rule, "can_finalize_document"));
  const fallbackRule = chainRules[chainRules.length - 1] || null;
  return finalRule || fallbackRule ? positionTitle(finalRule || fallbackRule || {}, maps) : "Not configured";
}

function placementFor(chainRules: JsonRecord[]) {
  for (const rule of chainRules) {
    const notes = stringField(rule, "notes");
    const match = notes.match(/(?:^|\n)Placement:\s*(.+)\s*$/i);
    if (match?.[1]) {
      return match[1].trim();
    }
  }

  return "Bottom-right of the last page";
}

function buildFlowSteps(chainRules: JsonRecord[], maps: LabelMaps, serialRule: JsonRecord | null, requiresSerial: boolean): SignatureFlowStep[] {
  const steps: SignatureFlowStep[] = [
    {
      icon: "document",
      id: "draft-ready",
      subtitle: "Document Created",
      title: "Draft Ready",
      tone: "system"
    }
  ];

  for (const rule of chainRules) {
    const finalizes = booleanField(rule, "can_finalize_document");
    const required = !("is_required" in rule) || booleanField(rule, "is_required");
    const title = `${positionTitle(rule, maps)} Signature`;

    steps.push({
      icon: finalizes ? "shield" : "signature",
      id: `signature-${String(rule.id || rule.step_number || title)}`,
      subtitle: finalizes ? "Final if enabled" : required ? "Required" : "Optional",
      title,
      tone: finalizes ? "final" : required ? "required" : "optional"
    });
  }

  if (requiresSerial) {
    steps.push({
      icon: "serial",
      id: "serial",
      subtitle: serialRule ? "After all required signatures" : "Serial rule missing",
      title: serialRule ? "Official Serial Generated" : "Official Serial Not Configured",
      tone: serialRule ? "system" : "warning"
    });
  }

  steps.push({
    icon: "export",
    id: "dispatch",
    subtitle: "Document sent to recipients",
    title: "Forward / Dispatch",
    tone: "system"
  });

  return steps;
}

function warningIssuesFor(input: {
  checks: Omit<SignatureChainChecks, "noConflictDetected">;
  chainRules: JsonRecord[];
  status: string;
}): SignatureWarningIssue[] {
  const issues: SignatureWarningIssue[] = [];

  if (!input.checks.signatureChainComplete) {
    issues.push("missing_signature_chain");
  }
  if (!input.checks.finalSignatoryDefined) {
    issues.push("missing_final_signature");
  }
  if (!input.checks.visibilityPolicySet) {
    issues.push("missing_visibility_policy");
  }
  if (!input.checks.serialTriggerSet) {
    issues.push("missing_serial_rule");
  }
  if (input.status !== "active") {
    issues.push("inactive_chain");
  }
  if (input.chainRules.some((rule) => "is_required" in rule && !booleanField(rule, "is_required"))) {
    issues.push("optional_step");
  }

  return issues;
}

function groupSignatureRules(signatureRules: JsonRecord[]) {
  const groups = new Map<string, JsonRecord[]>();

  for (const rule of signatureRules) {
    const key = `${String(rule.document_type_id || "all")}:${String(rule.origin_unit_type_id || "any")}:${stringField(rule, "status", "draft")}`;
    groups.set(key, [...(groups.get(key) || []), rule]);
  }

  return groups;
}

export function buildSignatureRuleRows(data: SignatureRulesPageData) {
  const maps: LabelMaps = {
    documentTypes: new Map(data.documentTypes.map((documentType) => [documentType.id, documentType])),
    positions: new Map(data.positions.map((position) => [position.id, position])),
    unitTypes: new Map(data.unitTypes.map((unitType) => [unitType.id, unitType]))
  };
  const defaultSerialRule = serialRuleFor(data.serialRules);
  const groups = groupSignatureRules(data.signatureRules);

  return Array.from(groups.entries())
    .map<SignatureRuleChainRow>(([id, chainRules]) => {
      const sortedRules = [...chainRules].sort((left, right) => (numberField(left, "step_number") || 0) - (numberField(right, "step_number") || 0));
      const firstRule = sortedRules[0] || {};
      const documentType = documentTypeFor(firstRule, maps);
      const originUnit = unitTypeFor(firstRule, maps);
      const status = statusFor(sortedRules);
      const activeRules = sortedRules.filter((rule) => stringField(rule, "status", "draft") === "active");
      const visibleRules = activeRules.length ? activeRules : sortedRules;
      const visibilityRule = visibilityRuleFor(sortedRules, data.visibilityRules);
      const finalSignatory = finalSignatoryFor(visibleRules, maps);
      const finalSignatoryDefined = visibleRules.some((rule) => booleanField(rule, "can_finalize_document"));
      const requiresSerial = Boolean(documentType.documentType?.requires_serial);
      const serialRule = defaultSerialRule;
      const checksWithoutConflict = {
        finalSignatoryDefined,
        serialTriggerSet: !requiresSerial || Boolean(serialRule),
        signatureChainComplete: visibleRules.length > 0,
        visibilityPolicySet: Boolean(visibilityRule)
      };
      const warningIssues = warningIssuesFor({ checks: checksWithoutConflict, chainRules: visibleRules, status });
      const checks = {
        ...checksWithoutConflict,
        noConflictDetected: warningIssues.length === 0
      };
      const visibilityPolicy = visibilityRule
        ? formatLabel(stringField(visibilityRule, "visibility_policy", "configured"), "Configured")
        : "Not configured";
      const serialTrigger = requiresSerial
        ? serialRule
          ? "After all required signatures"
          : "Not configured"
        : "Not required";
      const ruleCode = `SIG-${codeFor(originUnit.code, "ANY")}-${codeFor(documentType.code, "DOC")}`;
      const ruleName = `${originUnit.label === "Any" ? "" : `${originUnit.label} `}${documentType.label} Signature Chain`;
      const latestDate = sortedRules
        .map((rule) => stringField(rule, "updated_at") || stringField(rule, "created_at"))
        .filter(Boolean)
        .sort()
        .at(-1);

      return {
        chainMode: chainModeFor(visibleRules),
        checks,
        documentType: documentType.documentType,
        documentTypeCode: documentType.code,
        documentTypeId: documentType.documentTypeId,
        documentTypeLabel: documentType.label,
        finalSignatory,
        flowSteps: buildFlowSteps(visibleRules, maps, serialRule, requiresSerial),
        id,
        lastUpdated: formatDateTime(latestDate),
        originUnitCode: originUnit.code,
        originUnitLabel: originUnit.label,
        originUnitType: originUnit.unitType,
        placement: placementFor(visibleRules),
        ruleCode,
        ruleName,
        serialRule,
        serialTrigger,
        signatureRules: visibleRules,
        status,
        visibilityPolicy,
        visibilityRule,
        warningIssues
      };
    })
    .sort((left, right) => {
      if (left.status !== right.status) {
        return left.status === "active" ? -1 : right.status === "active" ? 1 : 0;
      }

      return left.ruleName.localeCompare(right.ruleName);
    });
}

export function buildSignatureConflicts(rows: SignatureRuleChainRow[]): SignatureConflictRow[] {
  const severityByIssue: Record<SignatureWarningIssue, SignatureConflictRow["severity"]> = {
    inactive_chain: "medium",
    missing_final_signature: "high",
    missing_serial_rule: "medium",
    missing_signature_chain: "high",
    missing_visibility_policy: "medium",
    optional_step: "low"
  };

  return rows.flatMap((row) =>
    row.warningIssues.map((issue) => ({
      chainId: row.id,
      date: row.lastUpdated,
      id: `${row.id}-${issue}`,
      issue,
      ruleCode: row.ruleCode,
      ruleName: row.ruleName,
      severity: severityByIssue[issue]
    }))
  );
}

export function rowMatchesSearch(row: SignatureRuleChainRow, search: string) {
  if (!search) {
    return true;
  }

  return [
    row.documentTypeCode,
    row.documentTypeLabel,
    row.finalSignatory,
    row.originUnitCode,
    row.originUnitLabel,
    row.ruleCode,
    row.ruleName,
    row.visibilityPolicy
  ].some((value) => value.toLowerCase().includes(search));
}
