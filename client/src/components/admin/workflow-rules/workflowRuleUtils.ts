import type {
  DocumentType,
  EntityId,
  JsonRecord,
  Position,
  RoutingRule,
  RoutingRuleDetail,
  UnitType
} from "../../../api";
import type {
  WorkflowCanvasStep,
  WorkflowConflictRow,
  WorkflowRuleChecks,
  WorkflowRuleRow,
  WorkflowRulesPageData,
  WorkflowWarningIssue
} from "./types";

type BadgeTone = "green" | "amber" | "red" | "blue" | "slate";

type LabelMaps = {
  documentTypes: Map<EntityId, DocumentType>;
  positions: Map<EntityId, Position>;
  unitTypes: Map<EntityId, UnitType>;
};

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

function booleanField(record: JsonRecord | null | undefined, key: string) {
  const value = record?.[key];
  return value === true || value === 1 || value === "1" || value === "true";
}

function codeFor(value: string, fallback: string) {
  const code = value
    .split(/[\s_-]+/)
    .filter(Boolean)
    .map((part) => part.slice(0, 3).toUpperCase())
    .join("-");

  return code || fallback;
}

function sameId(left: unknown, right: unknown) {
  if (left == null || right == null) {
    return false;
  }

  return String(left) === String(right);
}

function labelFromCode(code: string | null | undefined, fallback: string) {
  return formatLabel(code || "", fallback);
}

function documentTypeFor(rule: RoutingRule, maps: LabelMaps) {
  const documentTypeId = numberField(rule, "document_type_id");
  const documentType = documentTypeId ? maps.documentTypes.get(documentTypeId) || null : null;
  const code = documentType?.code || stringField(rule, "documentTypeCode", documentTypeId ? `doc-${documentTypeId}` : "all");
  const label = documentType?.name || stringField(rule, "documentTypeName", labelFromCode(code, "All document types"));

  return {
    code,
    documentType,
    documentTypeId,
    label
  };
}

function unitTypeLabel(rule: RoutingRule, maps: LabelMaps, idKey: string, codeKey: string, fallback: string) {
  const id = numberField(rule, idKey);
  const unitType = id ? maps.unitTypes.get(id) || null : null;
  const code = unitType?.code || stringField(rule, codeKey, id ? `unit-${id}` : "");
  return {
    code,
    label: unitType?.name || labelFromCode(code, fallback),
    unitType
  };
}

function positionLabel(rule: RoutingRule, maps: LabelMaps, idKey: string, codeKey: string, fallback: string) {
  const id = numberField(rule, idKey);
  const position = id ? maps.positions.get(id) || null : null;
  const code = position?.code || stringField(rule, codeKey, "");
  return position?.title || labelFromCode(code, fallback);
}

function signatureRuleSort(left: JsonRecord, right: JsonRecord) {
  const leftStep = numberField(left, "step_number") || 0;
  const rightStep = numberField(right, "step_number") || 0;
  if (leftStep !== rightStep) {
    return leftStep - rightStep;
  }

  return stringField(left, "requiredPositionTitle", stringField(left, "requiredPositionCode"))
    .localeCompare(stringField(right, "requiredPositionTitle", stringField(right, "requiredPositionCode")));
}

function dedupeSignatureRules(signatureRules: JsonRecord[]) {
  const deduped = new Map<string, JsonRecord>();

  for (const signatureRule of signatureRules) {
    const key = [
      numberField(signatureRule, "step_number") || 0,
      signatureRule.required_position_id || signatureRule.requiredPositionCode || signatureRule.requiredPositionTitle || "position",
      booleanField(signatureRule, "can_finalize_document") ? "final" : "intermediate"
    ].join(":");
    const existing = deduped.get(key);

    if (!existing || stringField(existing, "status", "draft") !== "active") {
      deduped.set(key, signatureRule);
    }
  }

  return Array.from(deduped.values()).sort(signatureRuleSort);
}

function matchSignatureRules(rule: RoutingRule, signatureRules: JsonRecord[]) {
  const documentTypeId = numberField(rule, "document_type_id");
  const originUnitTypeId = numberField(rule, "from_unit_type_id");

  if (!documentTypeId) {
    return [];
  }

  const documentTypeMatches = signatureRules.filter((signatureRule) => sameId(signatureRule.document_type_id, documentTypeId));
  if (!documentTypeMatches.length) {
    return [];
  }

  if (originUnitTypeId) {
    const exactOriginMatches = documentTypeMatches.filter((signatureRule) => sameId(signatureRule.origin_unit_type_id, originUnitTypeId));
    if (exactOriginMatches.length) {
      return dedupeSignatureRules(exactOriginMatches);
    }
  }

  const genericOriginMatches = documentTypeMatches.filter((signatureRule) => signatureRule.origin_unit_type_id == null);
  if (genericOriginMatches.length) {
    return dedupeSignatureRules(genericOriginMatches);
  }

  return dedupeSignatureRules(documentTypeMatches);
}

function matchVisibilityRule(rule: RoutingRule, visibilityRules: JsonRecord[]) {
  const documentTypeId = numberField(rule, "document_type_id");
  const fromUnitTypeId = numberField(rule, "from_unit_type_id");
  const toUnitTypeId = numberField(rule, "to_unit_type_id");

  return visibilityRules.find((visibilityRule) => {
    const visibilityDocumentType = visibilityRule.document_type_id;
    const forwardingUnitType = visibilityRule.forwarding_unit_type_id;
    const matchesDocumentType = visibilityDocumentType == null || !documentTypeId || sameId(visibilityDocumentType, documentTypeId);
    const matchesUnitType =
      forwardingUnitType == null ||
      (!fromUnitTypeId && !toUnitTypeId) ||
      sameId(forwardingUnitType, fromUnitTypeId) ||
      sameId(forwardingUnitType, toUnitTypeId);

    return matchesDocumentType && matchesUnitType && stringField(visibilityRule, "status", "draft") !== "archived";
  }) || null;
}

function serialRuleFor(serialRules: JsonRecord[]) {
  return serialRules.find((serialRule) => stringField(serialRule, "status", "draft") === "active" && booleanField(serialRule, "is_default"))
    || serialRules.find((serialRule) => stringField(serialRule, "status", "draft") === "active")
    || null;
}

function finalSignatoryFor(signatureRules: JsonRecord[], fallback: string) {
  const finalRule = signatureRules.find((signatureRule) => booleanField(signatureRule, "can_finalize_document"));
  const lastRule = signatureRules[signatureRules.length - 1] || null;
  const selectedRule = finalRule || lastRule;
  return stringField(selectedRule, "requiredPositionTitle", labelFromCode(stringField(selectedRule, "requiredPositionCode"), fallback));
}

function buildCanvasSteps(rowBase: {
  actionLabel: string;
  allowed: string;
  finalSignatureDefined: boolean;
  fromPositionLabel: string;
  requiresSerial: boolean;
  serialRule: JsonRecord | null;
  signatureRules: JsonRecord[];
  toPositionLabel: string;
  toUnitLabel: string;
}): WorkflowCanvasStep[] {
  const steps: WorkflowCanvasStep[] = [
    {
      icon: "document",
      id: "draft-created",
      subtitle: "Start",
      title: "Draft Created",
      tone: "system"
    },
    {
      icon: "workflow",
      id: "routing",
      subtitle: `${rowBase.fromPositionLabel} to ${rowBase.toPositionLabel} / ${rowBase.toUnitLabel}`,
      title: rowBase.actionLabel,
      tone: rowBase.allowed === "denied" ? "warning" : rowBase.allowed === "optional" ? "optional" : "active"
    }
  ];

  if (!rowBase.signatureRules.length) {
    steps.push({
      icon: "signature",
      id: "signature-missing",
      subtitle: "No signature rule matched",
      title: "Signature Chain Missing",
      tone: "warning"
    });
  } else {
    for (const signatureRule of rowBase.signatureRules) {
      const position = stringField(
        signatureRule,
        "requiredPositionTitle",
        labelFromCode(stringField(signatureRule, "requiredPositionCode"), "Configured Signatory")
      );
      const canFinalize = booleanField(signatureRule, "can_finalize_document");
      const required = !("is_required" in signatureRule) || booleanField(signatureRule, "is_required");
      const stepNumber = numberField(signatureRule, "step_number") || 0;

      steps.push({
        icon: canFinalize ? "shield" : "signature",
        id: `signature-${signatureRule.id || stepNumber}`,
        subtitle: canFinalize ? "Final if enabled" : required ? "Required" : "Optional",
        title: `${position} Signature`,
        tone: canFinalize ? "final" : required ? "active" : "optional"
      });
    }
  }

  if (rowBase.requiresSerial) {
    steps.push({
      icon: "serial",
      id: "official-serial",
      subtitle: rowBase.serialRule ? "After all required signatures" : "Serial rule missing",
      title: rowBase.serialRule ? "Official Serial Generated" : "Official Serial Not Configured",
      tone: rowBase.serialRule ? "system" : "warning"
    });
  }

  steps.push({
    icon: "export",
    id: "dispatch",
    subtitle: "Send / Archive",
    title: "Dispatch",
    tone: rowBase.finalSignatureDefined ? "active" : "system"
  });

  return steps;
}

function warningIssuesFor(input: {
  allowed: string;
  checks: Omit<WorkflowRuleChecks, "noConflictDetected">;
  signatureRules: JsonRecord[];
  status: string;
  visibilityRule: JsonRecord | null;
}): WorkflowWarningIssue[] {
  const issues: WorkflowWarningIssue[] = [];

  if (!input.checks.routingComplete) {
    issues.push("denied_rule");
  }
  if (!input.checks.signatureChainValid) {
    issues.push("missing_signature_chain");
  }
  if (!input.checks.finalSignatureDefined) {
    issues.push("missing_final_signature");
  }
  if (!input.visibilityRule) {
    issues.push("missing_visibility_policy");
  }
  if (input.status !== "active") {
    issues.push("inactive_rule");
  }
  if (input.allowed === "optional") {
    issues.push("optional_route");
  }
  if (input.signatureRules.length && input.signatureRules.every((signatureRule) => stringField(signatureRule, "status", "draft") !== "active")) {
    issues.push("route_signature_mismatch");
  }

  return issues;
}

export function buildWorkflowRows(data: WorkflowRulesPageData) {
  const maps: LabelMaps = {
    documentTypes: new Map(data.documentTypes.map((documentType) => [documentType.id, documentType])),
    positions: new Map(data.positions.map((position) => [position.id, position])),
    unitTypes: new Map(data.unitTypes.map((unitType) => [unitType.id, unitType]))
  };
  const defaultSerialRule = serialRuleFor(data.serialRules);

  return data.routingRules
    .map<WorkflowRuleRow>((routingRule) => {
      const detail = data.routingDetails.get(routingRule.id) || null;
      const rule = detail?.rule || routingRule;
      const documentType = documentTypeFor(rule, maps);
      const originUnit = unitTypeLabel(rule, maps, "from_unit_type_id", "fromUnitTypeCode", "Any origin");
      const targetUnit = unitTypeLabel(rule, maps, "to_unit_type_id", "toUnitTypeCode", "Any target");
      const fromPositionLabel = positionLabel(rule, maps, "from_position_id", "fromPositionCode", "Any sender");
      const toPositionLabel = positionLabel(rule, maps, "to_position_id", "toPositionCode", "Configured receiver");
      const signatureRules = matchSignatureRules(rule, data.signatureRules);
      const activeSignatureRules = signatureRules.filter((signatureRule) => stringField(signatureRule, "status", "draft") === "active");
      const visibilityRule = matchVisibilityRule(rule, data.visibilityRules);
      const serialRule = defaultSerialRule;
      const actionLabel = formatLabel(rule.action, "Routing Step");
      const allowed = rule.allowed || "allowed";
      const status = rule.status || "draft";
      const requiresSerial = Boolean(documentType.documentType?.requires_serial);
      const finalSignatureDefined = activeSignatureRules.some((signatureRule) => booleanField(signatureRule, "can_finalize_document"));
      const serialTriggerSet = !requiresSerial || Boolean(serialRule);
      const checksWithoutConflict = {
        finalSignatureDefined,
        routingComplete: allowed !== "denied" && Boolean(rule.action),
        serialTriggerSet,
        signatureChainValid: activeSignatureRules.length > 0
      };
      const warningIssues = warningIssuesFor({
        allowed,
        checks: checksWithoutConflict,
        signatureRules,
        status,
        visibilityRule
      });
      const checks: WorkflowRuleChecks = {
        ...checksWithoutConflict,
        noConflictDetected: warningIssues.length === 0
      };
      const finalSignatory = finalSignatoryFor(activeSignatureRules.length ? activeSignatureRules : signatureRules, toPositionLabel);
      const visibilityPolicy = visibilityRule
        ? formatLabel(stringField(visibilityRule, "visibility_policy", "configured"), "Configured")
        : "Not configured";
      const serialTrigger = requiresSerial
        ? serialRule
          ? "After all required signatures"
          : "Not configured"
        : "Not required";
      const ruleCode = `WR-${codeFor(documentType.code, "DOC")}-${codeFor(originUnit.code, "ANY")}-${String(rule.id).padStart(2, "0")}`;
      const ruleName = `${originUnit.label === "Any origin" ? "" : `${originUnit.label} `}${documentType.label} - ${actionLabel}`;

      return {
        actionLabel,
        allowed,
        canvasSteps: buildCanvasSteps({
          actionLabel,
          allowed,
          finalSignatureDefined,
          fromPositionLabel,
          requiresSerial,
          serialRule,
          signatureRules: activeSignatureRules.length ? activeSignatureRules : signatureRules,
          toPositionLabel,
          toUnitLabel: targetUnit.label
        }),
        checks,
        detail,
        documentType: documentType.documentType,
        documentTypeCode: documentType.code,
        documentTypeId: documentType.documentTypeId,
        documentTypeLabel: documentType.label,
        finalSignatory,
        fromPositionLabel,
        id: rule.id,
        lastUpdated: formatDateTime(stringField(rule, "updated_at") || stringField(rule, "created_at")),
        originUnitCode: originUnit.code,
        originUnitLabel: originUnit.label,
        originUnitType: originUnit.unitType,
        priority: rule.priority,
        rule,
        ruleCode,
        ruleName,
        serialRule,
        serialTrigger,
        signatureRules: activeSignatureRules.length ? activeSignatureRules : signatureRules,
        status,
        toPositionLabel,
        toUnitLabel: targetUnit.label,
        warningIssues,
        visibilityPolicy,
        visibilityRule
      };
    })
    .sort((left, right) => {
      if (left.status !== right.status) {
        return left.status === "active" ? -1 : right.status === "active" ? 1 : 0;
      }

      if (left.priority !== right.priority) {
        return left.priority - right.priority;
      }

      return right.id - left.id;
    });
}

export function buildConflictQueue(rows: WorkflowRuleRow[]): WorkflowConflictRow[] {
  const severityByIssue: Record<WorkflowWarningIssue, WorkflowConflictRow["severity"]> = {
    denied_rule: "high",
    inactive_rule: "medium",
    missing_final_signature: "medium",
    missing_signature_chain: "high",
    missing_visibility_policy: "medium",
    optional_route: "low",
    route_signature_mismatch: "medium"
  };

  return rows.flatMap((row) =>
    row.warningIssues.map((issue) => ({
      date: row.lastUpdated,
      id: `${row.id}-${issue}`,
      issue,
      ruleName: row.ruleName,
      severity: severityByIssue[issue]
    }))
  );
}

export function rowMatchesSearch(row: WorkflowRuleRow, search: string) {
  if (!search) {
    return true;
  }

  return [
    row.actionLabel,
    row.documentTypeCode,
    row.documentTypeLabel,
    row.finalSignatory,
    row.fromPositionLabel,
    row.originUnitCode,
    row.originUnitLabel,
    row.ruleCode,
    row.ruleName,
    row.toPositionLabel,
    row.toUnitLabel,
    row.visibilityPolicy
  ].some((value) => value.toLowerCase().includes(search));
}
