import { type FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { adminApi, routingRulesApi, signatureApi } from "../../api";
import type { DocumentType, EntityId, JsonRecord, Position, RoutingRule, RoutingRuleDetail, UnitType } from "../../api";
import { AdminModal, AdminPageHeader } from "../../components/admin";
import {
  buildConflictQueue,
  buildWorkflowRows,
  EasyWorkflowBuilder,
  WorkflowCanvas,
  WorkflowConflictQueue,
  WorkflowRuleDirectory,
  WorkflowRuleHelp,
  WorkflowRuleInspector,
  WorkflowRuleStats,
  WorkflowRuleTemplates
} from "../../components/admin/workflow-rules";
import type { WorkflowRulesPageData, WorkflowTemplateKey } from "../../components/admin/workflow-rules";
import type { WorkflowConflictRow, WorkflowRuleRow } from "../../components/admin/workflow-rules/types";
import { Button, StatusBadge } from "../../components/ui";
import { useI18n } from "../../i18n";
import { downloadWorkbook } from "../../lib/workbook";

type ActiveModal = "actions" | "archive" | "builder" | "conflicts" | "preview" | "templates" | null;
type BuilderMode = "clone" | "create" | "edit" | "guided";
type WorkflowAllowed = "allowed" | "optional" | "denied" | "emergency_only";
type WorkflowStatus = "draft" | "active" | "inactive" | "archived";

type WorkflowRuleForm = {
  action: string;
  allowed: WorkflowAllowed;
  create_serial_rule: boolean;
  create_signature_chain: boolean;
  create_visibility_rule: boolean;
  document_type_id: string;
  effective_from: string;
  effective_until: string;
  from_position_id: string;
  from_unit_type_id: string;
  is_external_target: boolean;
  is_multi_recipient: boolean;
  notes: string;
  prior_review_required: boolean;
  prior_signature_required: boolean;
  priority: string;
  required_unit_scope: string;
  show_child_signatures: boolean;
  show_parent_signatures: boolean;
  signature_position_ids: string[];
  signature_status: WorkflowStatus;
  status: WorkflowStatus;
  to_position_id: string;
  to_unit_type_id: string;
  visibility_policy: string;
};

const emptyData: WorkflowRulesPageData = {
  documentTypes: [],
  positions: [],
  routingDetails: new Map<EntityId, RoutingRuleDetail | null>(),
  routingRules: [],
  serialRules: [],
  signatureRules: [],
  unitTypes: [],
  visibilityRules: []
};

const allowedOptions: WorkflowAllowed[] = ["allowed", "optional", "denied", "emergency_only"];
const statusOptions: WorkflowStatus[] = ["draft", "active", "inactive", "archived"];
const labelClassName = "text-sm font-semibold text-slate-700";
const fieldClassName = "mt-1 block min-h-10 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-800 shadow-sm shadow-slate-900/5 outline-none transition focus:border-[#061d49] focus:ring-4 focus:ring-[#061d49]/10 disabled:bg-slate-50 disabled:text-slate-500";
const checkboxClassName = "h-4 w-4 rounded border-slate-300 text-[#061d49] focus:ring-[#061d49]/20";

async function safe<T>(promise: Promise<T>, fallback: T) {
  try {
    return await promise;
  } catch {
    return fallback;
  }
}

function chooseDefaultRule(rows: ReturnType<typeof buildWorkflowRows>) {
  return rows.find((row) => row.status === "active" && row.warningIssues.length === 0)
    || rows.find((row) => row.status === "active")
    || rows[0]
    || null;
}

function findMatchingRule(
  rows: ReturnType<typeof buildWorkflowRows>,
  documentTypeId: string,
  originUnitTypeId: string,
  status: string
) {
  return rows.find((row) => {
    const matchesDocumentType = documentTypeId === "all" || String(row.documentTypeId || "") === documentTypeId;
    const matchesOrigin = originUnitTypeId === "all" || String(row.originUnitType?.id || "") === originUnitTypeId;
    const matchesStatus = status === "all" || row.status === status;
    return matchesDocumentType && matchesOrigin && matchesStatus;
  }) || null;
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Request failed.";
}

function nullableId(value: string) {
  return value ? Number(value) : null;
}

function recordNumber(record: JsonRecord | null | undefined, key: string) {
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

function recordBoolean(record: JsonRecord | null | undefined, key: string) {
  const value = record?.[key];
  return value === true || value === 1 || value === "1" || value === "true";
}

function dateTimeInput(value: unknown) {
  if (!value) {
    return "";
  }

  return String(value).replace(" ", "T").slice(0, 16);
}

function normalizedPriority(value: string) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? Math.round(parsed) : 100;
}

function asAllowed(value: unknown): WorkflowAllowed {
  return allowedOptions.includes(value as WorkflowAllowed) ? value as WorkflowAllowed : "allowed";
}

function asStatus(value: unknown): WorkflowStatus {
  return statusOptions.includes(value as WorkflowStatus) ? value as WorkflowStatus : "draft";
}

function firstActive<T extends { status?: string }>(items: T[]) {
  return items.find((item) => item.status === "active") || items[0] || null;
}

function matchesAny(value: string, needles: string[]) {
  const normalized = value.toLowerCase();
  return needles.some((needle) => normalized.includes(needle));
}

function findDocumentType(data: WorkflowRulesPageData, needles: string[]) {
  return data.documentTypes.find((documentType) =>
    matchesAny(`${documentType.code} ${documentType.name}`, needles)
  ) || firstActive(data.documentTypes);
}

function findUnitType(data: WorkflowRulesPageData, needles: string[]) {
  return data.unitTypes.find((unitType) =>
    matchesAny(`${unitType.code} ${unitType.name}`, needles)
  ) || firstActive(data.unitTypes);
}

function findPosition(data: WorkflowRulesPageData, needles: string[]) {
  return data.positions.find((position) =>
    matchesAny(`${position.code} ${position.title} ${position.title_local || ""}`, needles)
  ) || firstActive(data.positions);
}

function serialNeeded(documentTypeId: string, data: WorkflowRulesPageData) {
  const documentType = data.documentTypes.find((item) => String(item.id) === documentTypeId);
  return Boolean(documentType?.requires_serial);
}

function workflowFormDefaults(data: WorkflowRulesPageData): WorkflowRuleForm {
  const documentType = firstActive(data.documentTypes);
  const originUnitType = firstActive(data.unitTypes);
  const targetUnitType = data.unitTypes.find((unitType) => unitType.id !== originUnitType?.id) || originUnitType;
  const fromPosition = firstActive(data.positions);
  const signingPosition = data.positions.find((position) => position.is_signing_authority && position.status === "active")
    || data.positions.find((position) => position.is_signing_authority)
    || firstActive(data.positions);
  const documentTypeId = documentType ? String(documentType.id) : "";

  return {
    action: "submit_for_review",
    allowed: "allowed",
    create_serial_rule: serialNeeded(documentTypeId, data),
    create_signature_chain: Boolean(documentTypeId && signingPosition),
    create_visibility_rule: Boolean(documentTypeId),
    document_type_id: documentTypeId,
    effective_from: "",
    effective_until: "",
    from_position_id: fromPosition ? String(fromPosition.id) : "",
    from_unit_type_id: originUnitType ? String(originUnitType.id) : "",
    is_external_target: false,
    is_multi_recipient: false,
    notes: "",
    prior_review_required: true,
    prior_signature_required: false,
    priority: "100",
    required_unit_scope: "origin_unit",
    show_child_signatures: true,
    show_parent_signatures: true,
    signature_position_ids: signingPosition ? [String(signingPosition.id)] : [""],
    signature_status: "draft",
    status: "draft",
    to_position_id: signingPosition ? String(signingPosition.id) : "",
    to_unit_type_id: targetUnitType ? String(targetUnitType.id) : "",
    visibility_policy: "show_all"
  };
}

function workflowFormForRow(row: WorkflowRuleRow, mode: BuilderMode): WorkflowRuleForm {
  const rule = row.rule;
  const signaturePositions = row.signatureRules
    .map((signatureRule) => recordNumber(signatureRule, "required_position_id"))
    .filter((value): value is EntityId => Boolean(value))
    .map(String);

  return {
    action: mode === "clone" ? `${rule.action}_copy`.slice(0, 80) : rule.action,
    allowed: asAllowed(rule.allowed),
    create_serial_rule: false,
    create_signature_chain: false,
    create_visibility_rule: false,
    document_type_id: recordNumber(rule, "document_type_id") ? String(recordNumber(rule, "document_type_id")) : "",
    effective_from: dateTimeInput(rule.effective_from),
    effective_until: dateTimeInput(rule.effective_until),
    from_position_id: recordNumber(rule, "from_position_id") ? String(recordNumber(rule, "from_position_id")) : "",
    from_unit_type_id: recordNumber(rule, "from_unit_type_id") ? String(recordNumber(rule, "from_unit_type_id")) : "",
    is_external_target: recordBoolean(rule, "is_external_target"),
    is_multi_recipient: recordBoolean(rule, "is_multi_recipient"),
    notes: typeof rule.notes === "string" ? rule.notes : "",
    prior_review_required: recordBoolean(rule, "prior_review_required"),
    prior_signature_required: recordBoolean(rule, "prior_signature_required"),
    priority: String(row.priority || 100),
    required_unit_scope: "origin_unit",
    show_child_signatures: true,
    show_parent_signatures: true,
    signature_position_ids: signaturePositions.length ? signaturePositions : [""],
    signature_status: row.signatureRules.length ? asStatus(row.signatureRules[0].status) : "draft",
    status: mode === "clone" ? "draft" : asStatus(row.status),
    to_position_id: recordNumber(rule, "to_position_id") ? String(recordNumber(rule, "to_position_id")) : "",
    to_unit_type_id: recordNumber(rule, "to_unit_type_id") ? String(recordNumber(rule, "to_unit_type_id")) : "",
    visibility_policy: row.visibilityRule && typeof row.visibilityRule.visibility_policy === "string" ? row.visibilityRule.visibility_policy : "show_all"
  };
}

function workflowFormForTemplate(template: WorkflowTemplateKey, data: WorkflowRulesPageData): WorkflowRuleForm {
  const base = workflowFormDefaults(data);

  switch (template) {
    case "department_to_faculty": {
      const documentType = findDocumentType(data, ["letter", "maktob", "official"]);
      const originUnit = findUnitType(data, ["department", "dept"]);
      const targetUnit = findUnitType(data, ["faculty"]);
      const fromPosition = findPosition(data, ["head", "chair", "department"]);
      const toPosition = findPosition(data, ["dean", "faculty"]);
      return {
        ...base,
        action: "submit_to_faculty",
        document_type_id: documentType ? String(documentType.id) : base.document_type_id,
        from_position_id: fromPosition ? String(fromPosition.id) : base.from_position_id,
        from_unit_type_id: originUnit ? String(originUnit.id) : base.from_unit_type_id,
        notes: "Template: department to faculty approval flow.",
        signature_position_ids: toPosition ? [String(toPosition.id)] : base.signature_position_ids,
        to_position_id: toPosition ? String(toPosition.id) : base.to_position_id,
        to_unit_type_id: targetUnit ? String(targetUnit.id) : base.to_unit_type_id
      };
    }
    case "faculty_to_vc": {
      const originUnit = findUnitType(data, ["faculty"]);
      const targetUnit = findUnitType(data, ["vice", "chancellery", "directorate"]);
      const fromPosition = findPosition(data, ["dean", "faculty"]);
      const toPosition = findPosition(data, ["vice", "chancellor", "director"]);
      return {
        ...base,
        action: "escalate_to_vice_chancellor",
        from_position_id: fromPosition ? String(fromPosition.id) : base.from_position_id,
        from_unit_type_id: originUnit ? String(originUnit.id) : base.from_unit_type_id,
        notes: "Template: faculty escalation to vice chancellor.",
        prior_signature_required: true,
        signature_position_ids: toPosition ? [String(toPosition.id)] : base.signature_position_ids,
        to_position_id: toPosition ? String(toPosition.id) : base.to_position_id,
        to_unit_type_id: targetUnit ? String(targetUnit.id) : base.to_unit_type_id
      };
    }
    case "internal_memo":
      return {
        ...base,
        action: "route_internal_memo",
        allowed: "optional",
        create_serial_rule: false,
        notes: "Template: fast internal memo routing.",
        prior_review_required: false,
        priority: "60",
        visibility_policy: "metadata_only"
      };
    case "committee_report": {
      const reportType = findDocumentType(data, ["report", "committee"]);
      const signer = findPosition(data, ["committee", "chair", "secretary"]);
      return {
        ...base,
        action: "submit_committee_report",
        document_type_id: reportType ? String(reportType.id) : base.document_type_id,
        notes: "Template: committee report approval.",
        prior_signature_required: true,
        signature_position_ids: signer ? [String(signer.id)] : base.signature_position_ids,
        to_position_id: signer ? String(signer.id) : base.to_position_id
      };
    }
    case "policy_approval": {
      const policyType = findDocumentType(data, ["policy", "regulation"]);
      const signer = findPosition(data, ["chancellor", "president", "director"]);
      return {
        ...base,
        action: "approve_policy",
        document_type_id: policyType ? String(policyType.id) : base.document_type_id,
        notes: "Template: policy approval workflow.",
        priority: "20",
        signature_position_ids: signer ? [String(signer.id)] : base.signature_position_ids,
        status: "draft",
        to_position_id: signer ? String(signer.id) : base.to_position_id
      };
    }
  }
}

function routePayload(form: WorkflowRuleForm, statusOverride?: WorkflowStatus) {
  return {
    action: form.action.trim(),
    allowed: form.allowed,
    conditions: [],
    document_type_id: nullableId(form.document_type_id),
    effective_from: form.effective_from || null,
    effective_until: form.effective_until || null,
    from_position_id: nullableId(form.from_position_id),
    from_unit_type_id: nullableId(form.from_unit_type_id),
    is_external_target: form.is_external_target,
    is_multi_recipient: form.is_multi_recipient,
    notes: form.notes.trim() || null,
    prior_review_required: form.prior_review_required,
    prior_signature_required: form.prior_signature_required,
    priority: normalizedPriority(form.priority),
    status: statusOverride || form.status,
    to_position_id: nullableId(form.to_position_id),
    to_unit_type_id: nullableId(form.to_unit_type_id)
  };
}

function conflictRuleId(row: WorkflowConflictRow) {
  const parsed = Number(String(row.id).split("-")[0]);
  return Number.isFinite(parsed) ? parsed : null;
}

function labelForOption(value: string) {
  return value.replaceAll("_", " ").replace(/\b\w/g, (match) => match.toUpperCase());
}

export function AdminWorkflowRulesPage() {
  const { t } = useI18n();
  const [searchParams] = useSearchParams();
  const [data, setData] = useState<WorkflowRulesPageData>(emptyData);
  const [loading, setLoading] = useState(true);
  const [selectedRuleId, setSelectedRuleId] = useState<EntityId | null>(null);
  const [builderStatus, setBuilderStatus] = useState("all");
  const [activeModal, setActiveModal] = useState<ActiveModal>(null);
  const [builderMode, setBuilderMode] = useState<BuilderMode>("create");
  const [modalRuleId, setModalRuleId] = useState<EntityId | null>(null);
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [workflowForm, setWorkflowForm] = useState<WorkflowRuleForm>(() => workflowFormDefaults(emptyData));
  const inspectorRef = useRef<HTMLDivElement | null>(null);

  const refreshWorkflowRules = useCallback(async (nextSelectedRuleId?: EntityId | null) => {
    setLoading(true);
    const [
      routingRules,
      signatureRules,
      serialRules,
      visibilityRules,
      documentTypes,
      unitTypes,
      positions
    ] = await Promise.all([
      safe(routingRulesApi.list({ limit: 250 }), [] as RoutingRule[]),
      safe(signatureApi.listSignatureRules(), [] as JsonRecord[]),
      safe(signatureApi.listSerialRules(), [] as JsonRecord[]),
      safe(adminApi.visibilityRules.list(), [] as JsonRecord[]),
      safe(adminApi.documentTypes.list(), [] as DocumentType[]),
      safe(adminApi.unitTypes.list(), [] as UnitType[]),
      safe(adminApi.positions.list(), [] as Position[])
    ]);

    const detailEntries = await Promise.all(
      routingRules.map(async (rule) => [
        rule.id,
        await safe(routingRulesApi.get(rule.id), null as RoutingRuleDetail | null)
      ] as const)
    );

    setData({
      documentTypes,
      positions,
      routingDetails: new Map(detailEntries),
      routingRules,
      serialRules,
      signatureRules,
      unitTypes,
      visibilityRules
    });
    setLoading(false);
    if (nextSelectedRuleId !== undefined) {
      setSelectedRuleId(nextSelectedRuleId);
    }
  }, []);

  useEffect(() => {
    void refreshWorkflowRules();
  }, [refreshWorkflowRules]);

  const rows = useMemo(() => buildWorkflowRows(data), [data]);
  const conflictQueue = useMemo(() => buildConflictQueue(rows), [rows]);

  useEffect(() => {
    const selectedStillExists = selectedRuleId ? rows.some((row) => row.id === selectedRuleId) : false;
    if (!selectedStillExists) {
      setSelectedRuleId(chooseDefaultRule(rows)?.id || null);
    }
  }, [rows, selectedRuleId]);

  useEffect(() => {
    const ruleId = searchParams.get("ruleId");
    const originUnitTypeId = searchParams.get("originUnitTypeId");
    if (!rows.length || (!ruleId && !originUnitTypeId)) {
      return;
    }

    const match = ruleId
      ? rows.find((row) => String(row.id) === ruleId)
      : rows.find((row) => String(row.originUnitType?.id || "") === originUnitTypeId);

    if (match && match.id !== selectedRuleId) {
      setSelectedRuleId(match.id);
    }
  }, [rows, searchParams, selectedRuleId]);

  const selectedRule = rows.find((row) => row.id === selectedRuleId) || null;
  const modalRule = modalRuleId ? rows.find((row) => row.id === modalRuleId) || null : null;
  const activePositions = data.positions.filter((position) => position.status === "active");
  const positionOptions = activePositions.length ? activePositions : data.positions;
  const stats = {
    active: rows.filter((row) => row.status === "active").length,
    documentTypes: new Set(rows.map((row) => row.documentTypeId).filter(Boolean)).size,
    signatureRules: data.signatureRules.length,
    total: rows.length,
    visibilityRules: data.visibilityRules.length,
    warnings: conflictQueue.length
  };

  function updateWorkflowForm(patch: Partial<WorkflowRuleForm>) {
    setWorkflowForm((current) => ({ ...current, ...patch }));
  }

  function closeModal() {
    setActiveModal(null);
    setModalRuleId(null);
    setFormError(null);
    setBusy(false);
  }

  function scrollToInspector() {
    window.requestAnimationFrame(() => {
      inspectorRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      inspectorRef.current?.focus({ preventScroll: true });
    });
  }

  function viewRule(ruleId: EntityId) {
    setSelectedRuleId(ruleId);
    scrollToInspector();
  }

  function openCreateRuleModal(mode: BuilderMode = "create") {
    setWorkflowForm(workflowFormDefaults(data));
    setBuilderMode(mode);
    setModalRuleId(null);
    setFormError(null);
    setActiveModal("builder");
  }

  function openEditRuleModal(row: WorkflowRuleRow) {
    setSelectedRuleId(row.id);
    setWorkflowForm(workflowFormForRow(row, "edit"));
    setBuilderMode("edit");
    setModalRuleId(row.id);
    setFormError(null);
    setActiveModal("builder");
  }

  function openCloneRuleModal(row: WorkflowRuleRow) {
    setSelectedRuleId(row.id);
    setWorkflowForm(workflowFormForRow(row, "clone"));
    setBuilderMode("clone");
    setModalRuleId(row.id);
    setFormError(null);
    setActiveModal("builder");
  }

  function openActionsModal(row: WorkflowRuleRow) {
    setSelectedRuleId(row.id);
    setModalRuleId(row.id);
    setFormError(null);
    setActiveModal("actions");
  }

  function openArchiveModal(row: WorkflowRuleRow) {
    setSelectedRuleId(row.id);
    setModalRuleId(row.id);
    setFormError(null);
    setActiveModal("archive");
  }

  function openPreviewModal(row: WorkflowRuleRow) {
    setSelectedRuleId(row.id);
    setModalRuleId(row.id);
    setFormError(null);
    setActiveModal("preview");
  }

  function applyTemplate(template: WorkflowTemplateKey) {
    setWorkflowForm(workflowFormForTemplate(template, data));
    setBuilderMode("create");
    setModalRuleId(null);
    setFormError(null);
    setActiveModal("builder");
  }

  function handleSelectScope(documentTypeId: string, originUnitTypeId: string) {
    const match = findMatchingRule(rows, documentTypeId, originUnitTypeId, builderStatus)
      || findMatchingRule(rows, documentTypeId, originUnitTypeId, "all");

    if (match) {
      setSelectedRuleId(match.id);
    }
  }

  function handleSelectRuleStatus(status: string) {
    setBuilderStatus(status);

    if (!selectedRule) {
      return;
    }

    const match = findMatchingRule(
      rows,
      selectedRule.documentTypeId ? String(selectedRule.documentTypeId) : "all",
      selectedRule.originUnitType?.id ? String(selectedRule.originUnitType.id) : "all",
      status
    ) || (status === "all" ? selectedRule : rows.find((row) => row.status === status) || null);

    if (match) {
      setSelectedRuleId(match.id);
    }
  }

  async function createSupportRules(form: WorkflowRuleForm, routeStatus: WorkflowStatus) {
    const documentTypeId = nullableId(form.document_type_id);
    const originUnitTypeId = nullableId(form.from_unit_type_id);
    const priority = normalizedPriority(form.priority);
    const supportStatus: WorkflowStatus = routeStatus === "active" ? "active" : "draft";
    const notes = form.notes.trim() || null;

    if (form.create_visibility_rule) {
      await adminApi.visibilityRules.create({
        allowed: form.allowed,
        conditions: {},
        document_type_id: documentTypeId,
        forwarding_unit_type_id: originUnitTypeId,
        notes,
        priority,
        show_child_signatures: form.show_child_signatures,
        show_parent_signatures: form.show_parent_signatures,
        status: supportStatus,
        visibility_policy: form.visibility_policy
      });
    }

    if (form.create_signature_chain && documentTypeId) {
      const signaturePositionIds = form.signature_position_ids.filter(Boolean);
      for (let index = 0; index < signaturePositionIds.length; index += 1) {
        await signatureApi.createSignatureRule({
          can_be_hidden_later: !form.show_child_signatures,
          can_finalize_document: index === signaturePositionIds.length - 1,
          document_type_id: documentTypeId,
          is_parallel: false,
          is_required: true,
          notes,
          origin_unit_type_id: originUnitTypeId,
          required_position_id: Number(signaturePositionIds[index]),
          required_unit_scope: form.required_unit_scope,
          signature_mode: "pin_signature_image",
          status: form.signature_status,
          step_number: index + 1
        });
      }
    }

    if (form.create_serial_rule) {
      const documentType = data.documentTypes.find((item) => String(item.id) === form.document_type_id);
      const codePart = (documentType?.code || "WF").replace(/[^a-z0-9_-]/gi, "").slice(0, 28).toUpperCase() || "WF";
      const uniquePart = Date.now().toString(36).toUpperCase();
      await signatureApi.createSerialRule({
        code: `WF-${codePart}-${uniquePart}`,
        format: `${codePart}-{YEAR}-{SEQUENCE}`,
        is_default: !data.serialRules.some((rule) => rule.is_default === true || rule.is_default === 1),
        name: `${documentType?.name || "Workflow"} serial rule`,
        notes,
        reset_policy: "yearly",
        scope: "global",
        sequence_padding: 6,
        status: supportStatus
      });
    }
  }

  async function saveWorkflow(statusOverride?: WorkflowStatus) {
    if (busy) {
      return;
    }

    const routeStatus = statusOverride || workflowForm.status;
    if (!workflowForm.document_type_id || !workflowForm.action.trim()) {
      setFormError(t("admin.workflowRules.form.requiredFields"));
      return;
    }
    if (workflowForm.create_signature_chain && !workflowForm.signature_position_ids.some(Boolean)) {
      setFormError(t("admin.workflowRules.form.signatureRequired"));
      return;
    }

    setBusy(true);
    setFormError(null);
    try {
      let savedRuleId: EntityId;
      if (builderMode === "edit" && modalRule) {
        const updated = await routingRulesApi.update(modalRule.id, routePayload(workflowForm, routeStatus));
        savedRuleId = updated.rule.id;
      } else {
        const created = await routingRulesApi.create(routePayload(workflowForm, routeStatus));
        savedRuleId = created.rule.id;
      }

      await createSupportRules(workflowForm, routeStatus);
      await refreshWorkflowRules(savedRuleId);
      closeModal();
    } catch (error) {
      setFormError(errorMessage(error));
      setBusy(false);
    }
  }

  async function handleWorkflowSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await saveWorkflow();
  }

  async function updateRuleStatus(row: WorkflowRuleRow, status: WorkflowStatus) {
    if (busy) {
      return;
    }

    setBusy(true);
    setFormError(null);
    try {
      const updated = await routingRulesApi.updateStatus(row.id, status);
      await refreshWorkflowRules(updated.rule.id);
      closeModal();
    } catch (error) {
      setFormError(errorMessage(error));
      setBusy(false);
    }
  }

  async function archiveRule() {
    if (!modalRule || busy) {
      return;
    }

    setBusy(true);
    setFormError(null);
    try {
      await routingRulesApi.remove(modalRule.id);
      await refreshWorkflowRules(null);
      closeModal();
    } catch (error) {
      setFormError(errorMessage(error));
      setBusy(false);
    }
  }

  async function exportRules() {
    await downloadWorkbook("workflow-rules.xlsx", [
      {
        name: "Workflow rules",
        rows: rows.map((row) => ({
          action: row.actionLabel,
          allowed: row.allowed,
          documentType: row.documentTypeLabel,
          finalSignatory: row.finalSignatory,
          originUnit: row.originUnitLabel,
          priority: row.priority,
          ruleCode: row.ruleCode,
          ruleName: row.ruleName,
          serialTrigger: row.serialTrigger,
          status: row.status,
          updated: row.lastUpdated,
          visibility: row.visibilityPolicy,
          warnings: row.warningIssues.join(", ")
        }))
      }
    ]);
  }

  function addSigner() {
    updateWorkflowForm({ signature_position_ids: [...workflowForm.signature_position_ids, ""] });
  }

  function updateSigner(index: number, value: string) {
    updateWorkflowForm({
      signature_position_ids: workflowForm.signature_position_ids.map((item, itemIndex) => itemIndex === index ? value : item)
    });
  }

  function removeSigner(index: number) {
    updateWorkflowForm({
      signature_position_ids: workflowForm.signature_position_ids.filter((_item, itemIndex) => itemIndex !== index)
    });
  }

  const builderTitle = builderMode === "edit"
    ? t("admin.workflowRules.form.editTitle")
    : builderMode === "clone"
      ? t("admin.workflowRules.form.cloneTitle")
      : builderMode === "guided"
        ? t("admin.workflowRules.form.guidedTitle")
        : t("admin.workflowRules.form.createTitle");

  return (
    <div className="space-y-4">
      <AdminPageHeader
        actions={(
          <>
            <Button icon="plus" onClick={() => openCreateRuleModal("create")} variant="primary">{t("admin.workflowRules.actions.newRule")}</Button>
            <Button icon="template" onClick={() => setActiveModal("templates")}>{t("admin.workflowRules.actions.useTemplate")}</Button>
            <Button icon="settings" onClick={() => openCreateRuleModal("guided")} variant="primary">{t("admin.workflowRules.actions.guidedBuilder")}</Button>
            <Button icon="export" onClick={() => void exportRules()}>{t("admin.workflowRules.actions.exportRules")}</Button>
          </>
        )}
        description={t("admin.workflowRules.description")}
        title={t("admin.workflowRules.title")}
      />

      <WorkflowRuleStats
        labels={{
          active: t("admin.workflowRules.stats.active"),
          documentTypes: t("admin.workflowRules.stats.documentTypes"),
          signatureRules: t("admin.workflowRules.stats.signatureRules"),
          total: t("admin.workflowRules.stats.total"),
          visibilityRules: t("admin.workflowRules.stats.visibilityRules"),
          warnings: t("admin.workflowRules.stats.warnings")
        }}
        loading={loading}
        stats={stats}
      />

      <section className="grid min-w-0 gap-4 2xl:grid-cols-[minmax(23rem,1fr)_minmax(23rem,1fr)_minmax(27rem,.8fr)]">
        <div className="min-w-0">
          <EasyWorkflowBuilder
            documentTypes={data.documentTypes}
            onCancel={() => {
              setBuilderStatus("all");
              setSelectedRuleId(chooseDefaultRule(rows)?.id || null);
            }}
            onOpenGuidedBuilder={() => openCreateRuleModal("guided")}
            onSaveDraft={(row) => void updateRuleStatus(row, "draft")}
            onSaveRule={(row) => void updateRuleStatus(row, "active")}
            onSelectRuleStatus={handleSelectRuleStatus}
            onSelectScope={handleSelectScope}
            selectedRule={selectedRule}
            selectedStatus={builderStatus}
            unitTypes={data.unitTypes}
          />
        </div>
        <div className="min-w-0">
          <WorkflowCanvas selectedRule={selectedRule} />
        </div>
        <div className="min-w-0" ref={inspectorRef} tabIndex={-1}>
          <WorkflowRuleInspector
            onCloneRule={openCloneRuleModal}
            onDisableRule={(row) => void updateRuleStatus(row, "inactive")}
            onEditRule={openEditRuleModal}
            onPreviewRule={openPreviewModal}
            selectedRule={selectedRule}
          />
        </div>
      </section>

      <section className="min-w-0 space-y-4">
        <WorkflowRuleDirectory
          documentTypes={data.documentTypes}
          onCloneRule={openCloneRuleModal}
          onEditRule={openEditRuleModal}
          onOpenRuleActions={openActionsModal}
          onSelectRule={setSelectedRuleId}
          onViewRule={viewRule}
          rows={rows}
          selectedRuleId={selectedRuleId}
          unitTypes={data.unitTypes}
        />
        <div className="grid min-w-0 gap-4 lg:grid-cols-2 xl:grid-cols-3">
          <WorkflowRuleTemplates onUseTemplate={applyTemplate} />
          <WorkflowRuleHelp />
          <WorkflowConflictQueue onViewAll={() => setActiveModal("conflicts")} rows={conflictQueue} />
        </div>
      </section>

      <AdminModal
        footer={(
          <>
            <Button disabled={busy} onClick={closeModal}>{t("admin.workflowRules.builder.cancel")}</Button>
            <Button disabled={busy} icon="serial" onClick={() => void saveWorkflow("draft")}>{t("admin.workflowRules.builder.saveDraft")}</Button>
            <Button disabled={busy} icon="export" onClick={() => void saveWorkflow()} variant="primary">{t("admin.workflowRules.builder.saveRule")}</Button>
          </>
        )}
        onClose={closeModal}
        open={activeModal === "builder"}
        size="lg"
        title={builderTitle}
      >
        <form className="space-y-4" onSubmit={(event) => void handleWorkflowSubmit(event)}>
          {formError ? <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm font-semibold text-red-700">{formError}</div> : null}
          <section className="rounded-lg border border-slate-200 bg-slate-50/60 p-3">
            <h3 className="text-sm font-bold text-slate-950">{t("admin.workflowRules.form.routeScope")}</h3>
            <div className="mt-3 grid gap-3 md:grid-cols-2">
              <label className={labelClassName}>
                {t("admin.workflowRules.builder.documentType")}
                <select className={fieldClassName} onChange={(event) => updateWorkflowForm({ create_serial_rule: serialNeeded(event.target.value, data), document_type_id: event.target.value })} value={workflowForm.document_type_id}>
                  <option value="">{t("admin.workflowRules.form.noOptions")}</option>
                  {data.documentTypes.map((documentType) => (
                    <option key={documentType.id} value={documentType.id}>{documentType.name}</option>
                  ))}
                </select>
              </label>
              <label className={labelClassName}>
                {t("admin.workflowRules.builder.originUnitType")}
                <select className={fieldClassName} onChange={(event) => updateWorkflowForm({ from_unit_type_id: event.target.value })} value={workflowForm.from_unit_type_id}>
                  <option value="">{t("common.any")}</option>
                  {data.unitTypes.map((unitType) => (
                    <option key={unitType.id} value={unitType.id}>{unitType.name}</option>
                  ))}
                </select>
              </label>
              <label className={labelClassName}>
                {t("admin.workflowRules.builder.fromPosition")}
                <select className={fieldClassName} onChange={(event) => updateWorkflowForm({ from_position_id: event.target.value })} value={workflowForm.from_position_id}>
                  <option value="">{t("common.any")}</option>
                  {positionOptions.map((position) => (
                    <option key={position.id} value={position.id}>{position.title}</option>
                  ))}
                </select>
              </label>
              <label className={labelClassName}>
                {t("admin.workflowRules.builder.toUnit")}
                <select className={fieldClassName} onChange={(event) => updateWorkflowForm({ to_unit_type_id: event.target.value })} value={workflowForm.to_unit_type_id}>
                  <option value="">{t("common.any")}</option>
                  {data.unitTypes.map((unitType) => (
                    <option key={unitType.id} value={unitType.id}>{unitType.name}</option>
                  ))}
                </select>
              </label>
              <label className={labelClassName}>
                {t("admin.workflowRules.builder.toPosition")}
                <select className={fieldClassName} onChange={(event) => updateWorkflowForm({ to_position_id: event.target.value })} value={workflowForm.to_position_id}>
                  <option value="">{t("common.any")}</option>
                  {positionOptions.map((position) => (
                    <option key={position.id} value={position.id}>{position.title}</option>
                  ))}
                </select>
              </label>
              <label className={labelClassName}>
                {t("admin.workflowRules.builder.action")}
                <input className={fieldClassName} maxLength={80} onChange={(event) => updateWorkflowForm({ action: event.target.value })} value={workflowForm.action} />
              </label>
            </div>
          </section>

          <section className="rounded-lg border border-slate-200 bg-white p-3">
            <h3 className="text-sm font-bold text-slate-950">{t("admin.workflowRules.form.governance")}</h3>
            <div className="mt-3 grid gap-3 md:grid-cols-4">
              <label className={labelClassName}>
                {t("admin.workflowRules.form.allowed")}
                <select className={fieldClassName} onChange={(event) => updateWorkflowForm({ allowed: asAllowed(event.target.value) })} value={workflowForm.allowed}>
                  {allowedOptions.map((value) => (
                    <option key={value} value={value}>{labelForOption(value)}</option>
                  ))}
                </select>
              </label>
              <label className={labelClassName}>
                {t("admin.workflowRules.builder.ruleStatus")}
                <select className={fieldClassName} onChange={(event) => updateWorkflowForm({ status: asStatus(event.target.value) })} value={workflowForm.status}>
                  {statusOptions.map((value) => (
                    <option key={value} value={value}>{t(`admin.workflowRules.status.${value}`)}</option>
                  ))}
                </select>
              </label>
              <label className={labelClassName}>
                {t("admin.workflowRules.form.priority")}
                <input className={fieldClassName} min={0} onChange={(event) => updateWorkflowForm({ priority: event.target.value })} type="number" value={workflowForm.priority} />
              </label>
              <label className={labelClassName}>
                {t("admin.workflowRules.form.effectiveFrom")}
                <input className={fieldClassName} onChange={(event) => updateWorkflowForm({ effective_from: event.target.value })} type="datetime-local" value={workflowForm.effective_from} />
              </label>
              <label className={labelClassName}>
                {t("admin.workflowRules.form.effectiveUntil")}
                <input className={fieldClassName} onChange={(event) => updateWorkflowForm({ effective_until: event.target.value })} type="datetime-local" value={workflowForm.effective_until} />
              </label>
              <label className="md:col-span-3">
                <span className={labelClassName}>{t("admin.workflowRules.form.notes")}</span>
                <textarea className={`${fieldClassName} min-h-20`} onChange={(event) => updateWorkflowForm({ notes: event.target.value })} value={workflowForm.notes} />
              </label>
            </div>
            <div className="mt-3 grid gap-2 md:grid-cols-2">
              {([
                ["prior_review_required", t("admin.workflowRules.form.priorReviewRequired")],
                ["prior_signature_required", t("admin.workflowRules.form.priorSignatureRequired")],
                ["is_external_target", t("admin.workflowRules.form.externalTarget")],
                ["is_multi_recipient", t("admin.workflowRules.form.multiRecipient")]
              ] as Array<[keyof WorkflowRuleForm, string]>).map(([key, label]) => (
                <label className="flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-semibold text-slate-700" key={String(key)}>
                  <input
                    checked={Boolean(workflowForm[key])}
                    className={checkboxClassName}
                    onChange={(event) => updateWorkflowForm({ [key]: event.target.checked } as Partial<WorkflowRuleForm>)}
                    type="checkbox"
                  />
                  {label}
                </label>
              ))}
            </div>
          </section>

          <section className="rounded-lg border border-slate-200 bg-slate-50/60 p-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h3 className="text-sm font-bold text-slate-950">{t("admin.workflowRules.builder.signatureChain")}</h3>
              <label className="flex items-center gap-2 text-sm font-semibold text-slate-700">
                <input checked={workflowForm.create_signature_chain} className={checkboxClassName} onChange={(event) => updateWorkflowForm({ create_signature_chain: event.target.checked })} type="checkbox" />
                {t("admin.workflowRules.form.createSignatureChain")}
              </label>
            </div>
            <div className="mt-3 grid gap-3 md:grid-cols-2">
              <label className={labelClassName}>
                {t("admin.workflowRules.form.requiredUnitScope")}
                <select className={fieldClassName} onChange={(event) => updateWorkflowForm({ required_unit_scope: event.target.value })} value={workflowForm.required_unit_scope}>
                  <option value="origin_unit">Origin unit</option>
                  <option value="target_unit">Target unit</option>
                  <option value="same_unit">Same unit</option>
                  <option value="any_unit">Any unit</option>
                </select>
              </label>
              <label className={labelClassName}>
                {t("admin.workflowRules.form.signatureStatus")}
                <select className={fieldClassName} onChange={(event) => updateWorkflowForm({ signature_status: asStatus(event.target.value) })} value={workflowForm.signature_status}>
                  {statusOptions.map((value) => (
                    <option key={value} value={value}>{t(`admin.workflowRules.status.${value}`)}</option>
                  ))}
                </select>
              </label>
            </div>
            <div className="mt-3 space-y-2">
              {workflowForm.signature_position_ids.map((positionId, index) => (
                <div className="flex gap-2" key={`${index}-${positionId}`}>
                  <select className={fieldClassName} onChange={(event) => updateSigner(index, event.target.value)} value={positionId}>
                    <option value="">{t("admin.workflowRules.form.noOptions")}</option>
                    {positionOptions.map((position) => (
                      <option key={position.id} value={position.id}>{index + 1}. {position.title}</option>
                    ))}
                  </select>
                  <Button disabled={workflowForm.signature_position_ids.length <= 1} onClick={() => removeSigner(index)}>{t("admin.workflowRules.form.removeSigner")}</Button>
                </div>
              ))}
              <Button icon="plus" onClick={addSigner}>{t("admin.workflowRules.form.addSigner")}</Button>
            </div>
          </section>

          <section className="rounded-lg border border-slate-200 bg-white p-3">
            <h3 className="text-sm font-bold text-slate-950">{t("admin.workflowRules.builder.visibilitySerial")}</h3>
            <div className="mt-3 grid gap-2 md:grid-cols-2">
              <label className="flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-semibold text-slate-700">
                <input checked={workflowForm.create_visibility_rule} className={checkboxClassName} onChange={(event) => updateWorkflowForm({ create_visibility_rule: event.target.checked })} type="checkbox" />
                {t("admin.workflowRules.form.createVisibilityRule")}
              </label>
              <label className="flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-semibold text-slate-700">
                <input checked={workflowForm.create_serial_rule} className={checkboxClassName} onChange={(event) => updateWorkflowForm({ create_serial_rule: event.target.checked })} type="checkbox" />
                {t("admin.workflowRules.form.createSerialRule")}
              </label>
              <label className={labelClassName}>
                {t("admin.workflowRules.builder.visibilityPolicy")}
                <select className={fieldClassName} onChange={(event) => updateWorkflowForm({ visibility_policy: event.target.value })} value={workflowForm.visibility_policy}>
                  <option value="show_all">Show all</option>
                  <option value="metadata_only">Metadata only</option>
                  <option value="hide_child_signatures">Hide child signatures</option>
                  <option value="restricted">Restricted</option>
                </select>
              </label>
              <div className="space-y-2">
                <label className="flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-semibold text-slate-700">
                  <input checked={workflowForm.show_child_signatures} className={checkboxClassName} onChange={(event) => updateWorkflowForm({ show_child_signatures: event.target.checked })} type="checkbox" />
                  {t("admin.workflowRules.form.showChildSignatures")}
                </label>
                <label className="flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-semibold text-slate-700">
                  <input checked={workflowForm.show_parent_signatures} className={checkboxClassName} onChange={(event) => updateWorkflowForm({ show_parent_signatures: event.target.checked })} type="checkbox" />
                  {t("admin.workflowRules.form.showParentSignatures")}
                </label>
              </div>
            </div>
          </section>
        </form>
      </AdminModal>

      <AdminModal onClose={closeModal} open={activeModal === "templates"} size="lg" title={t("admin.workflowRules.templates.title")}>
        <WorkflowRuleTemplates onUseTemplate={applyTemplate} />
      </AdminModal>

      <AdminModal
        footer={<Button onClick={closeModal}>{t("admin.workflowRules.builder.cancel")}</Button>}
        onClose={closeModal}
        open={activeModal === "preview"}
        size="lg"
        title={modalRule?.ruleName || t("admin.workflowRules.form.previewTitle")}
      >
        {modalRule ? (
          <div className="space-y-4">
            <div className="grid gap-3 md:grid-cols-3">
              <SummaryTile label={t("admin.workflowRules.inspector.appliesTo")} value={modalRule.documentTypeLabel} />
              <SummaryTile label={t("admin.workflowRules.inspector.finalizesAt")} value={modalRule.finalSignatory} />
              <SummaryTile label={t("admin.workflowRules.inspector.serialTrigger")} value={modalRule.serialTrigger} />
            </div>
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
              <p className="text-sm font-bold text-slate-950">{t("admin.workflowRules.canvas.title")}</p>
              <div className="mt-3 space-y-2">
                {modalRule.canvasSteps.map((step) => (
                  <div className="flex items-center justify-between gap-3 rounded-lg bg-white px-3 py-2 text-sm" key={step.id}>
                    <div className="min-w-0">
                      <p className="truncate font-bold text-slate-900">{step.title}</p>
                      <p className="truncate text-xs text-slate-500">{step.subtitle}</p>
                    </div>
                    <StatusBadge>{step.tone}</StatusBadge>
                  </div>
                ))}
              </div>
            </div>
          </div>
        ) : null}
      </AdminModal>

      <AdminModal
        footer={(
          <>
            <Button onClick={closeModal}>{t("admin.workflowRules.builder.cancel")}</Button>
            <Button disabled={busy} onClick={archiveRule} variant="danger">{t("admin.workflowRules.form.archiveRule")}</Button>
          </>
        )}
        onClose={closeModal}
        open={activeModal === "archive"}
        title={t("admin.workflowRules.form.archiveTitle")}
      >
        {formError ? <div className="mb-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm font-semibold text-red-700">{formError}</div> : null}
        <p className="text-sm leading-6 text-slate-700">
          {t("admin.workflowRules.form.archiveDescription", { name: modalRule?.ruleName || "" })}
        </p>
      </AdminModal>

      <AdminModal
        footer={<Button onClick={closeModal}>{t("admin.workflowRules.builder.cancel")}</Button>}
        onClose={closeModal}
        open={activeModal === "actions"}
        title={t("admin.workflowRules.form.actionsTitle")}
      >
        {formError ? <div className="mb-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm font-semibold text-red-700">{formError}</div> : null}
        {modalRule ? (
          <div className="grid gap-2 sm:grid-cols-2">
            <Button icon="view" onClick={() => { viewRule(modalRule.id); closeModal(); }}>{t("admin.workflowRules.directory.view")}</Button>
            <Button icon="edit" onClick={() => openEditRuleModal(modalRule)}>{t("admin.workflowRules.directory.edit")}</Button>
            <Button icon="template" onClick={() => openCloneRuleModal(modalRule)}>{t("admin.workflowRules.directory.clone")}</Button>
            <Button icon="view" onClick={() => openPreviewModal(modalRule)}>{t("admin.workflowRules.inspector.previewResult")}</Button>
            <Button icon="activity" onClick={() => void updateRuleStatus(modalRule, "active")}>{t("admin.workflowRules.form.activateRule")}</Button>
            <Button icon="serial" onClick={() => void updateRuleStatus(modalRule, "draft")}>{t("admin.workflowRules.form.setDraft")}</Button>
            <Button icon="pause" onClick={() => void updateRuleStatus(modalRule, "inactive")}>{t("admin.workflowRules.inspector.disableRule")}</Button>
            <Button onClick={() => openArchiveModal(modalRule)} variant="danger">{t("admin.workflowRules.form.archiveRule")}</Button>
          </div>
        ) : null}
      </AdminModal>

      <AdminModal
        footer={<Button onClick={closeModal}>{t("admin.workflowRules.builder.cancel")}</Button>}
        onClose={closeModal}
        open={activeModal === "conflicts"}
        size="lg"
        title={t("admin.workflowRules.conflicts.title")}
      >
        {conflictQueue.length ? (
          <div className="space-y-2">
            {conflictQueue.map((conflict) => {
              const ruleId = conflictRuleId(conflict);
              return (
                <button
                  className="flex w-full items-center justify-between gap-3 rounded-lg border border-slate-200 bg-white px-3 py-2 text-start text-sm hover:bg-slate-50"
                  key={conflict.id}
                  onClick={() => {
                    if (ruleId) {
                      viewRule(ruleId);
                      closeModal();
                    }
                  }}
                  type="button"
                >
                  <span className="min-w-0">
                    <span className="block truncate font-bold text-slate-900">{conflict.ruleName}</span>
                    <span className="force-ltr block text-xs text-slate-500">{conflict.date}</span>
                  </span>
                  <StatusBadge>{conflict.severity}</StatusBadge>
                </button>
              );
            })}
          </div>
        ) : (
          <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-sm font-semibold text-emerald-800">
            {t("admin.workflowRules.conflicts.empty")}
          </div>
        )}
      </AdminModal>
    </div>
  );
}

function SummaryTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white px-3 py-2">
      <p className="text-xs font-bold uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-1 min-w-0 break-words text-sm font-semibold text-slate-900">{value}</p>
    </div>
  );
}
