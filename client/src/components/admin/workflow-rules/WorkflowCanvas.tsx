import { useEffect, useMemo, useState } from "react";
import {
  Background,
  Controls,
  Handle,
  MiniMap,
  Position as FlowPosition,
  ReactFlow,
  ReactFlowProvider,
  useEdgesState,
  useNodesState,
  useReactFlow
} from "@xyflow/react";
import type { Edge, Node, NodeProps } from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import type { DocumentType, EntityId, JsonRecord, Position, UnitType } from "../../../api";
import type { RoutingRuleDesignerInput } from "../../../api/routing-rules";
import { useI18n } from "../../../i18n";
import { cx } from "../../../lib/classNames";
import { AdminModal } from "../AdminModal";
import { Button, Icon, IconButton, PanelCard, StatusBadge } from "../../ui";
import type { IconName } from "../../ui";
import type { WorkflowCanvasStep, WorkflowRuleRow, WorkflowStepTone } from "./types";

type WorkflowCanvasProps = {
  documentTypes: DocumentType[];
  onArchiveRule?: (row: WorkflowRuleRow) => Promise<void>;
  onDesignerSave?: (row: WorkflowRuleRow, input: RoutingRuleDesignerInput) => Promise<void>;
  positions: Position[];
  selectedRule: WorkflowRuleRow | null;
  unitTypes: UnitType[];
};

type WorkflowAllowed = "allowed" | "optional" | "denied" | "emergency_only";
type WorkflowStatus = "draft" | "active" | "inactive" | "archived";
type CanvasNodeKind = "dispatch" | "routing" | "serial" | "signature" | "start" | "visibility";

type DesignerRoutingRule = {
  action: string;
  allowed: WorkflowAllowed;
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
  status: WorkflowStatus;
  to_position_id: string;
  to_unit_type_id: string;
};

type DesignerSignatureRule = {
  can_be_hidden_later: boolean;
  can_finalize_document: boolean;
  id?: EntityId | null;
  is_parallel: boolean;
  is_required: boolean;
  localId: string;
  notes: string;
  required_position_id: string;
  required_unit_scope: string;
  signature_mode: string;
  status: WorkflowStatus;
  step_number: number;
};

type DesignerVisibilityRule = {
  allowed: string;
  conditions: JsonRecord;
  document_type_id: string;
  forwarding_unit_type_id: string;
  id?: EntityId | null;
  notes: string;
  priority: string;
  show_child_signatures: boolean;
  show_parent_signatures: boolean;
  status: string;
  visibility_policy: string;
};

type DesignerSerialRule = {
  code: string;
  format: string;
  id?: EntityId | null;
  is_default: boolean;
  name: string;
  notes: string;
  reset_policy: "yearly";
  scope: "global";
  sequence_padding: string;
  status: WorkflowStatus;
};

type DesignerArchiveState = {
  serialRuleIds: EntityId[];
  signatureRuleIds: EntityId[];
  visibilityRuleIds: EntityId[];
};

type WorkflowDesignerState = {
  archive: DesignerArchiveState;
  routingRule: DesignerRoutingRule;
  serialRule: DesignerSerialRule | null;
  signatureRules: DesignerSignatureRule[];
  visibilityRule: DesignerVisibilityRule | null;
};

type DesignerNodeData = {
  icon: IconName;
  issueCount?: number;
  kind: CanvasNodeKind;
  shared?: boolean;
  status?: string;
  subtitle: string;
  title: string;
  tone: WorkflowStepTone;
  [key: string]: unknown;
};

type DesignerNode = Node<DesignerNodeData, "workflowNode">;

const allowedOptions: WorkflowAllowed[] = ["allowed", "optional", "denied", "emergency_only"];
const statusOptions: WorkflowStatus[] = ["draft", "active", "inactive", "archived"];
const fieldClassName = "mt-1 block min-h-10 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-800 shadow-sm shadow-slate-900/5 outline-none transition focus:border-[#061d49] focus:ring-4 focus:ring-[#061d49]/10";
const checkboxClassName = "h-4 w-4 rounded border-slate-300 text-[#061d49] focus:ring-[#061d49]/20";

const stepToneClasses: Record<WorkflowStepTone, string> = {
  active: "border-blue-300 bg-blue-50 text-[#061d49]",
  final: "border-purple-300 bg-purple-50 text-purple-800",
  optional: "border-amber-300 bg-amber-50 text-amber-800",
  system: "border-emerald-300 bg-emerald-50 text-emerald-800",
  warning: "border-red-300 bg-red-50 text-red-700"
};

const nodeToneClasses: Record<WorkflowStepTone, string> = {
  active: "border-blue-300 bg-blue-50 text-[#061d49] shadow-blue-100",
  final: "border-purple-300 bg-purple-50 text-purple-800 shadow-purple-100",
  optional: "border-amber-300 bg-amber-50 text-amber-800 shadow-amber-100",
  system: "border-emerald-300 bg-emerald-50 text-emerald-800 shadow-emerald-100",
  warning: "border-red-300 bg-red-50 text-red-700 shadow-red-100"
};

const dotToneClasses: Record<WorkflowStepTone, string> = {
  active: "bg-blue-600",
  final: "bg-purple-600",
  optional: "bg-amber-500",
  system: "bg-emerald-600",
  warning: "bg-red-600"
};

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

function stringField(record: JsonRecord | null | undefined, key: string, fallback = "") {
  const value = record?.[key];
  return typeof value === "string" ? value : fallback;
}

function booleanField(record: JsonRecord | null | undefined, key: string) {
  const value = record?.[key];
  return value === true || value === 1 || value === "1" || value === "true";
}

function dateTimeInput(value: unknown) {
  return value ? String(value).replace(" ", "T").slice(0, 16) : "";
}

function asAllowed(value: unknown): WorkflowAllowed {
  return allowedOptions.includes(value as WorkflowAllowed) ? value as WorkflowAllowed : "allowed";
}

function asStatus(value: unknown): WorkflowStatus {
  return statusOptions.includes(value as WorkflowStatus) ? value as WorkflowStatus : "draft";
}

function optionLabel(value: string) {
  return value.replaceAll("_", " ").replace(/\b\w/g, (match) => match.toUpperCase());
}

function numericString(value: unknown, fallback = "100") {
  if (typeof value === "number" && Number.isFinite(value)) {
    return String(value);
  }
  if (typeof value === "string" && value.trim()) {
    return value;
  }
  return fallback;
}

function positionTitle(positions: Position[], positionId: string, fallback = "Configured signer") {
  return positions.find((position) => String(position.id) === positionId)?.title || fallback;
}

function unitTypeName(unitTypes: UnitType[], unitTypeId: string, fallback = "Any unit type") {
  return unitTypes.find((unitType) => String(unitType.id) === unitTypeId)?.name || fallback;
}

function documentTypeName(documentTypes: DocumentType[], documentTypeId: string, fallback = "Document type") {
  return documentTypes.find((documentType) => String(documentType.id) === documentTypeId)?.name || fallback;
}

function activeOrFirstPosition(positions: Position[]) {
  return positions.find((position) => position.status === "active" && position.is_signing_authority)
    || positions.find((position) => position.status === "active")
    || positions[0]
    || null;
}

function compactValue(value: string | null | undefined) {
  return value && value.trim() ? value : "-";
}

function designerStateFromRule(row: WorkflowRuleRow): WorkflowDesignerState {
  const rule = row.rule;
  const signatureRules = row.signatureRules
    .map<DesignerSignatureRule>((signatureRule, index) => ({
      can_be_hidden_later: booleanField(signatureRule, "can_be_hidden_later"),
      can_finalize_document: booleanField(signatureRule, "can_finalize_document") || index === row.signatureRules.length - 1,
      id: numberField(signatureRule, "id"),
      is_parallel: booleanField(signatureRule, "is_parallel"),
      is_required: !("is_required" in signatureRule) || booleanField(signatureRule, "is_required"),
      localId: `signature-${numberField(signatureRule, "id") || index + 1}`,
      notes: stringField(signatureRule, "notes"),
      required_position_id: numberField(signatureRule, "required_position_id") ? String(numberField(signatureRule, "required_position_id")) : "",
      required_unit_scope: stringField(signatureRule, "required_unit_scope", "origin_unit"),
      signature_mode: stringField(signatureRule, "signature_mode", "pin_signature_image"),
      status: asStatus(signatureRule.status),
      step_number: numberField(signatureRule, "step_number") || index + 1
    }))
    .sort((left, right) => left.step_number - right.step_number)
    .map((signatureRule, index, list) => ({
      ...signatureRule,
      can_finalize_document: signatureRule.can_finalize_document || index === list.length - 1,
      step_number: index + 1
    }));

  const visibilityRule = row.visibilityRule
    ? {
        allowed: stringField(row.visibilityRule, "allowed", "allowed"),
        conditions: typeof row.visibilityRule.conditions === "object" && row.visibilityRule.conditions ? row.visibilityRule.conditions as JsonRecord : {},
        document_type_id: numberField(row.visibilityRule, "document_type_id") ? String(numberField(row.visibilityRule, "document_type_id")) : "",
        forwarding_unit_type_id: numberField(row.visibilityRule, "forwarding_unit_type_id") ? String(numberField(row.visibilityRule, "forwarding_unit_type_id")) : "",
        id: numberField(row.visibilityRule, "id"),
        notes: stringField(row.visibilityRule, "notes"),
        priority: numericString(row.visibilityRule.priority),
        show_child_signatures: !("show_child_signatures" in row.visibilityRule) || booleanField(row.visibilityRule, "show_child_signatures"),
        show_parent_signatures: !("show_parent_signatures" in row.visibilityRule) || booleanField(row.visibilityRule, "show_parent_signatures"),
        status: stringField(row.visibilityRule, "status", "draft"),
        visibility_policy: stringField(row.visibilityRule, "visibility_policy", "show_all")
      }
    : null;

  const serialRule = row.serialRule
    ? {
        code: stringField(row.serialRule, "code", "workflow_serial"),
        format: stringField(row.serialRule, "format", "DOC-{YEAR}-{SEQUENCE}"),
        id: numberField(row.serialRule, "id"),
        is_default: booleanField(row.serialRule, "is_default"),
        name: stringField(row.serialRule, "name", "Workflow serial rule"),
        notes: stringField(row.serialRule, "notes"),
        reset_policy: "yearly" as const,
        scope: "global" as const,
        sequence_padding: numericString(row.serialRule.sequence_padding, "6"),
        status: asStatus(row.serialRule.status)
      }
    : null;

  return {
    archive: {
      serialRuleIds: [],
      signatureRuleIds: [],
      visibilityRuleIds: []
    },
    routingRule: {
      action: rule.action,
      allowed: asAllowed(rule.allowed),
      document_type_id: numberField(rule, "document_type_id") ? String(numberField(rule, "document_type_id")) : "",
      effective_from: dateTimeInput(rule.effective_from),
      effective_until: dateTimeInput(rule.effective_until),
      from_position_id: numberField(rule, "from_position_id") ? String(numberField(rule, "from_position_id")) : "",
      from_unit_type_id: numberField(rule, "from_unit_type_id") ? String(numberField(rule, "from_unit_type_id")) : "",
      is_external_target: booleanField(rule, "is_external_target"),
      is_multi_recipient: booleanField(rule, "is_multi_recipient"),
      notes: stringField(rule, "notes"),
      prior_review_required: booleanField(rule, "prior_review_required"),
      prior_signature_required: booleanField(rule, "prior_signature_required"),
      priority: numericString(rule.priority),
      status: asStatus(rule.status),
      to_position_id: numberField(rule, "to_position_id") ? String(numberField(rule, "to_position_id")) : "",
      to_unit_type_id: numberField(rule, "to_unit_type_id") ? String(numberField(rule, "to_unit_type_id")) : ""
    },
    serialRule,
    signatureRules,
    visibilityRule
  };
}

function validationMessages(state: WorkflowDesignerState, documentTypes: DocumentType[]) {
  const messages: string[] = [];
  const documentType = documentTypes.find((item) => String(item.id) === state.routingRule.document_type_id);
  if (!state.routingRule.document_type_id) {
    messages.push("Document type is required.");
  }
  if (!state.routingRule.action.trim()) {
    messages.push("Routing action is required.");
  }
  if (!state.signatureRules.length) {
    messages.push("Signature chain is missing.");
  }
  if (state.signatureRules.some((signatureRule) => !signatureRule.required_position_id)) {
    messages.push("Every signature step needs a signer position.");
  }
  if (state.signatureRules.length && !state.signatureRules.some((signatureRule) => signatureRule.can_finalize_document)) {
    messages.push("One signature step must finalize the document.");
  }
  if (!state.visibilityRule) {
    messages.push("Visibility rule is not configured.");
  }
  if (documentType?.requires_serial && !state.serialRule) {
    messages.push("This document type requires a serial rule.");
  }
  return messages;
}

function designerPayload(state: WorkflowDesignerState, statusOverride?: WorkflowStatus): RoutingRuleDesignerInput {
  const routeStatus = statusOverride || state.routingRule.status;
  const supportStatus = statusOverride || undefined;
  const documentTypeId = state.routingRule.document_type_id ? Number(state.routingRule.document_type_id) : null;
  const originUnitTypeId = state.routingRule.from_unit_type_id ? Number(state.routingRule.from_unit_type_id) : null;

  return {
    archive: state.archive,
    routingRule: {
      action: state.routingRule.action.trim(),
      allowed: state.routingRule.allowed,
      conditions: [],
      document_type_id: documentTypeId,
      effective_from: state.routingRule.effective_from || null,
      effective_until: state.routingRule.effective_until || null,
      from_position_id: state.routingRule.from_position_id ? Number(state.routingRule.from_position_id) : null,
      from_unit_type_id: originUnitTypeId,
      is_external_target: state.routingRule.is_external_target,
      is_multi_recipient: state.routingRule.is_multi_recipient,
      notes: state.routingRule.notes.trim() || null,
      prior_review_required: state.routingRule.prior_review_required,
      prior_signature_required: state.routingRule.prior_signature_required,
      priority: Number(state.routingRule.priority) || 100,
      status: routeStatus,
      to_position_id: state.routingRule.to_position_id ? Number(state.routingRule.to_position_id) : null,
      to_unit_type_id: state.routingRule.to_unit_type_id ? Number(state.routingRule.to_unit_type_id) : null
    },
    serialRule: state.serialRule
      ? {
          code: state.serialRule.code.trim(),
          format: state.serialRule.format.trim() || "DOC-{YEAR}-{SEQUENCE}",
          id: state.serialRule.id || null,
          is_default: state.serialRule.is_default,
          name: state.serialRule.name.trim(),
          notes: state.serialRule.notes.trim() || null,
          reset_policy: "yearly",
          scope: "global",
          sequence_padding: Number(state.serialRule.sequence_padding) || 6,
          status: supportStatus || state.serialRule.status
        }
      : null,
    signatureRules: state.signatureRules.map((signatureRule, index) => ({
      can_be_hidden_later: signatureRule.can_be_hidden_later,
      can_finalize_document: signatureRule.can_finalize_document,
      id: signatureRule.id || null,
      is_parallel: signatureRule.is_parallel,
      is_required: signatureRule.is_required,
      notes: signatureRule.notes.trim() || null,
      required_position_id: Number(signatureRule.required_position_id),
      required_unit_scope: signatureRule.required_unit_scope,
      signature_mode: signatureRule.signature_mode,
      status: supportStatus || signatureRule.status,
      step_number: index + 1
    })),
    visibilityRule: state.visibilityRule
      ? {
          allowed: state.visibilityRule.allowed,
          conditions: state.visibilityRule.conditions,
          document_type_id: state.visibilityRule.document_type_id ? Number(state.visibilityRule.document_type_id) : documentTypeId,
          forwarding_unit_type_id: state.visibilityRule.forwarding_unit_type_id ? Number(state.visibilityRule.forwarding_unit_type_id) : originUnitTypeId,
          id: state.visibilityRule.id || null,
          notes: state.visibilityRule.notes.trim() || null,
          priority: Number(state.visibilityRule.priority) || 100,
          show_child_signatures: state.visibilityRule.show_child_signatures,
          show_parent_signatures: state.visibilityRule.show_parent_signatures,
          status: supportStatus || state.visibilityRule.status,
          visibility_policy: state.visibilityRule.visibility_policy
        }
      : null
  };
}

function CanvasStep({ step }: { step: WorkflowCanvasStep }) {
  return (
    <div className="relative flex flex-col items-center">
      <article className={cx("flex w-full max-w-[19rem] items-center gap-3 rounded-lg border px-3 py-2.5 shadow-sm", stepToneClasses[step.tone])}>
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white/80">
          <Icon className="h-5 w-5" name={step.icon} />
        </span>
        <span className="min-w-0">
          <span className="block truncate text-sm font-bold leading-5">{step.title}</span>
          <span className="block max-w-[15rem] truncate text-xs leading-4 opacity-80">{step.subtitle}</span>
        </span>
      </article>
    </div>
  );
}

function WorkflowNode({ data, selected }: NodeProps<DesignerNode>) {
  return (
    <div className={cx(
      "relative w-56 rounded-xl border bg-white p-3 shadow-lg transition",
      nodeToneClasses[data.tone],
      selected && "ring-4 ring-[#061d49]/20"
    )}>
      {data.kind !== "start" ? (
        <Handle className="!h-3 !w-3 !border-2 !border-white !bg-[#061d49]" position={FlowPosition.Left} type="target" />
      ) : null}
      {data.kind !== "dispatch" ? (
        <Handle className="!h-3 !w-3 !border-2 !border-white !bg-[#061d49]" position={FlowPosition.Right} type="source" />
      ) : null}
      <div className="flex items-start gap-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-white/80 ring-1 ring-current/15">
          <Icon className="h-5 w-5" name={data.icon} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-bold leading-5">{data.title}</p>
          <p className="mt-0.5 line-clamp-2 text-xs leading-4 opacity-80">{data.subtitle}</p>
        </div>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        {data.status ? <StatusBadge>{data.status}</StatusBadge> : null}
        {data.shared ? <span className="rounded-full bg-white/80 px-2 py-1 text-[0.68rem] font-bold uppercase tracking-wide ring-1 ring-current/15">shared</span> : null}
        {data.issueCount ? <StatusBadge tone="amber">{String(data.issueCount)}</StatusBadge> : null}
      </div>
    </div>
  );
}

const nodeTypes = { workflowNode: WorkflowNode };

function buildGraph(
  state: WorkflowDesignerState,
  row: WorkflowRuleRow,
  documentTypes: DocumentType[],
  positions: Position[],
  unitTypes: UnitType[]
) {
  const issues = validationMessages(state, documentTypes);
  const nodes: DesignerNode[] = [
    {
      data: {
        icon: "document",
        kind: "start",
        status: "start",
        subtitle: documentTypeName(documentTypes, state.routingRule.document_type_id, row.documentTypeLabel),
        title: "Draft Created",
        tone: "system"
      },
      id: "start",
      position: { x: 0, y: 220 },
      type: "workflowNode"
    },
    {
      data: {
        icon: "workflow",
        issueCount: issues.filter((issue) => issue.includes("Routing") || issue.includes("Document")).length || undefined,
        kind: "routing",
        status: state.routingRule.status,
        subtitle: `${unitTypeName(unitTypes, state.routingRule.from_unit_type_id)} to ${unitTypeName(unitTypes, state.routingRule.to_unit_type_id)}`,
        title: state.routingRule.action || "Routing rule",
        tone: state.routingRule.allowed === "denied" ? "warning" : state.routingRule.allowed === "optional" ? "optional" : "active"
      },
      id: "routing",
      position: { x: 280, y: 220 },
      type: "workflowNode"
    }
  ];

  const signatureStartX = 560;
  for (const [index, signatureRule] of state.signatureRules.entries()) {
    nodes.push({
      data: {
        icon: signatureRule.can_finalize_document ? "shield" : "signature",
        issueCount: signatureRule.required_position_id ? undefined : 1,
        kind: "signature",
        shared: true,
        status: signatureRule.status,
        subtitle: `${signatureRule.required_unit_scope.replaceAll("_", " ")} / step ${index + 1}`,
        title: positionTitle(positions, signatureRule.required_position_id, "Select signer"),
        tone: signatureRule.required_position_id ? signatureRule.can_finalize_document ? "final" : "active" : "warning"
      },
      id: signatureRule.localId,
      position: { x: signatureStartX + index * 260, y: 80 },
      type: "workflowNode"
    });
  }

  const supportX = signatureStartX + Math.max(state.signatureRules.length - 1, 0) * 260;
  if (state.visibilityRule) {
    nodes.push({
      data: {
        icon: "view",
        kind: "visibility",
        shared: true,
        status: state.visibilityRule.status,
        subtitle: "Shared by document type and origin unit",
        title: optionLabel(state.visibilityRule.visibility_policy),
        tone: "system"
      },
      id: "visibility",
      position: { x: signatureStartX, y: 370 },
      type: "workflowNode"
    });
  }
  if (state.serialRule) {
    nodes.push({
      data: {
        icon: "serial",
        kind: "serial",
        shared: true,
        status: state.serialRule.status,
        subtitle: state.serialRule.format,
        title: state.serialRule.name,
        tone: "system"
      },
      id: "serial",
      position: { x: state.visibilityRule ? signatureStartX + 260 : signatureStartX, y: 370 },
      type: "workflowNode"
    });
  }

  const finalX = Math.max(900, supportX + 320, state.serialRule || state.visibilityRule ? signatureStartX + 600 : 0);
  nodes.push({
    data: {
      icon: "export",
      kind: "dispatch",
      status: "final",
      subtitle: state.serialRule ? "Dispatch after serial generation" : "Dispatch after approvals",
      title: "Dispatch",
      tone: issues.length ? "warning" : "active"
    },
    id: "dispatch",
    position: { x: finalX, y: 220 },
    type: "workflowNode"
  });

  const chain = [
    "start",
    "routing",
    ...state.signatureRules.map((signatureRule) => signatureRule.localId),
    ...(state.visibilityRule ? ["visibility"] : []),
    ...(state.serialRule ? ["serial"] : []),
    "dispatch"
  ];
  const edges: Edge[] = chain.slice(0, -1).map((source, index) => ({
    animated: source === "routing" && !state.signatureRules.length,
    id: `${source}-${chain[index + 1]}`,
    source,
    target: chain[index + 1],
    type: "smoothstep"
  }));

  return { edges, nodes };
}

function DesignerSelect({
  label,
  onChange,
  options,
  placeholder,
  value
}: {
  label: string;
  onChange: (value: string) => void;
  options: Array<{ label: string; value: string }>;
  placeholder?: string;
  value: string;
}) {
  return (
    <label className="text-sm font-semibold text-slate-700">
      {label}
      <select className={fieldClassName} onChange={(event) => onChange(event.target.value)} value={value}>
        {placeholder ? <option value="">{placeholder}</option> : null}
        {options.map((option) => (
          <option key={option.value} value={option.value}>{option.label}</option>
        ))}
      </select>
    </label>
  );
}

function DesignerInput({
  label,
  onChange,
  type = "text",
  value
}: {
  label: string;
  onChange: (value: string) => void;
  type?: string;
  value: string;
}) {
  return (
    <label className="text-sm font-semibold text-slate-700">
      {label}
      <input className={fieldClassName} onChange={(event) => onChange(event.target.value)} type={type} value={value} />
    </label>
  );
}

function DesignerCheckbox({ checked, label, onChange }: { checked: boolean; label: string; onChange: (value: boolean) => void }) {
  return (
    <label className="flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-semibold text-slate-700">
      <input checked={checked} className={checkboxClassName} onChange={(event) => onChange(event.target.checked)} type="checkbox" />
      {label}
    </label>
  );
}

function SelectedNodeDrawer({
  documentTypes,
  nodeId,
  onCollapse,
  onRemoveSignature,
  positions,
  setState,
  state,
  unitTypes
}: {
  documentTypes: DocumentType[];
  nodeId: string | null;
  onCollapse: () => void;
  onRemoveSignature: (localId: string) => void;
  positions: Position[];
  setState: (updater: (current: WorkflowDesignerState) => WorkflowDesignerState) => void;
  state: WorkflowDesignerState;
  unitTypes: UnitType[];
}) {
  const selectedSignature = state.signatureRules.find((signatureRule) => signatureRule.localId === nodeId) || null;
  const positionOptions = positions.map((position) => ({ label: position.title, value: String(position.id) }));
  const unitTypeOptions = unitTypes.map((unitType) => ({ label: unitType.name, value: String(unitType.id) }));
  const documentTypeOptions = documentTypes.map((documentType) => ({ label: documentType.name, value: String(documentType.id) }));
  const statusSelectOptions = statusOptions.map((status) => ({ label: optionLabel(status), value: status }));
  const allowedSelectOptions = allowedOptions.map((allowed) => ({ label: optionLabel(allowed), value: allowed }));

  function patchRouting(patch: Partial<DesignerRoutingRule>) {
    setState((current) => ({ ...current, routingRule: { ...current.routingRule, ...patch } }));
  }

  function patchSignature(patch: Partial<DesignerSignatureRule>) {
    if (!selectedSignature) {
      return;
    }
    setState((current) => ({
      ...current,
      signatureRules: current.signatureRules.map((signatureRule) => signatureRule.localId === selectedSignature.localId ? { ...signatureRule, ...patch } : signatureRule)
    }));
  }

  function patchVisibility(patch: Partial<DesignerVisibilityRule>) {
    setState((current) => current.visibilityRule ? { ...current, visibilityRule: { ...current.visibilityRule, ...patch } } : current);
  }

  function patchSerial(patch: Partial<DesignerSerialRule>) {
    setState((current) => current.serialRule ? { ...current, serialRule: { ...current.serialRule, ...patch } } : current);
  }

  return (
    <aside className="absolute bottom-4 end-4 top-20 z-20 flex w-[min(26rem,calc(100%-2rem))] flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-2xl shadow-slate-900/15">
      <header className="flex items-start justify-between gap-3 border-b border-slate-200 px-4 py-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-bold text-slate-950">Properties</p>
          <p className="text-xs text-slate-500">Changes are local until Save.</p>
        </div>
        <IconButton className="h-8 w-8 border-transparent" icon="x" label="Collapse properties" onClick={onCollapse} />
      </header>
      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-4">
        {nodeId === "routing" ? (
          <>
            <DesignerSelect label="Document type" onChange={(value) => patchRouting({ document_type_id: value })} options={documentTypeOptions} placeholder="Select document type" value={state.routingRule.document_type_id} />
            <DesignerSelect label="Origin unit type" onChange={(value) => patchRouting({ from_unit_type_id: value })} options={unitTypeOptions} placeholder="Any origin" value={state.routingRule.from_unit_type_id} />
            <DesignerSelect label="From position" onChange={(value) => patchRouting({ from_position_id: value })} options={positionOptions} placeholder="Any sender" value={state.routingRule.from_position_id} />
            <DesignerSelect label="Target unit type" onChange={(value) => patchRouting({ to_unit_type_id: value })} options={unitTypeOptions} placeholder="Any target" value={state.routingRule.to_unit_type_id} />
            <DesignerSelect label="Target position" onChange={(value) => patchRouting({ to_position_id: value })} options={positionOptions} placeholder="Any receiver" value={state.routingRule.to_position_id} />
            <DesignerInput label="Action" onChange={(value) => patchRouting({ action: value })} value={state.routingRule.action} />
            <DesignerSelect label="Allowed behavior" onChange={(value) => patchRouting({ allowed: asAllowed(value) })} options={allowedSelectOptions} value={state.routingRule.allowed} />
            <DesignerSelect label="Status" onChange={(value) => patchRouting({ status: asStatus(value) })} options={statusSelectOptions} value={state.routingRule.status} />
            <DesignerInput label="Priority" onChange={(value) => patchRouting({ priority: value })} type="number" value={state.routingRule.priority} />
            <div className="grid gap-2">
              <DesignerCheckbox checked={state.routingRule.prior_review_required} label="Prior review required" onChange={(value) => patchRouting({ prior_review_required: value })} />
              <DesignerCheckbox checked={state.routingRule.prior_signature_required} label="Prior signature required" onChange={(value) => patchRouting({ prior_signature_required: value })} />
              <DesignerCheckbox checked={state.routingRule.is_external_target} label="External target" onChange={(value) => patchRouting({ is_external_target: value })} />
              <DesignerCheckbox checked={state.routingRule.is_multi_recipient} label="Multiple recipients" onChange={(value) => patchRouting({ is_multi_recipient: value })} />
            </div>
          </>
        ) : null}

        {selectedSignature ? (
          <>
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs font-semibold leading-5 text-amber-800">
              Signature rules are shared by document type and origin unit. Saving this step can affect other routes with the same scope.
            </div>
            <DesignerSelect label="Signer position" onChange={(value) => patchSignature({ required_position_id: value })} options={positionOptions} placeholder="Select signer" value={selectedSignature.required_position_id} />
            <DesignerSelect
              label="Unit scope"
              onChange={(value) => patchSignature({ required_unit_scope: value })}
              options={[
                { label: "Origin unit", value: "origin_unit" },
                { label: "Target unit", value: "target_unit" },
                { label: "Same unit", value: "same_unit" },
                { label: "Any unit", value: "any_unit" }
              ]}
              value={selectedSignature.required_unit_scope}
            />
            <DesignerSelect label="Status" onChange={(value) => patchSignature({ status: asStatus(value) })} options={statusSelectOptions} value={selectedSignature.status} />
            <DesignerCheckbox checked={selectedSignature.is_required} label="Required signature" onChange={(value) => patchSignature({ is_required: value })} />
            <DesignerCheckbox checked={selectedSignature.can_finalize_document} label="Can finalize document" onChange={(value) => patchSignature({ can_finalize_document: value })} />
            <DesignerCheckbox checked={selectedSignature.can_be_hidden_later} label="Can be hidden later" onChange={(value) => patchSignature({ can_be_hidden_later: value })} />
            <Button onClick={() => onRemoveSignature(selectedSignature.localId)} variant="danger">Remove signature step</Button>
          </>
        ) : null}

        {nodeId === "visibility" && state.visibilityRule ? (
          <>
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs font-semibold leading-5 text-amber-800">
              Visibility rules are shared by document type and forwarding unit type.
            </div>
            <DesignerSelect
              label="Visibility policy"
              onChange={(value) => patchVisibility({ visibility_policy: value })}
              options={[
                { label: "Show all", value: "show_all" },
                { label: "Metadata only", value: "metadata_only" },
                { label: "Hide child signatures", value: "hide_child_signatures" },
                { label: "Restricted", value: "restricted" }
              ]}
              value={state.visibilityRule.visibility_policy}
            />
            <DesignerSelect label="Status" onChange={(value) => patchVisibility({ status: value })} options={statusSelectOptions} value={state.visibilityRule.status} />
            <DesignerInput label="Priority" onChange={(value) => patchVisibility({ priority: value })} type="number" value={state.visibilityRule.priority} />
            <DesignerCheckbox checked={state.visibilityRule.show_child_signatures} label="Show child signatures" onChange={(value) => patchVisibility({ show_child_signatures: value })} />
            <DesignerCheckbox checked={state.visibilityRule.show_parent_signatures} label="Show parent signatures" onChange={(value) => patchVisibility({ show_parent_signatures: value })} />
          </>
        ) : null}

        {nodeId === "serial" && state.serialRule ? (
          <>
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs font-semibold leading-5 text-amber-800">
              Serial rules are global. Saving this node can affect all document types using the default serial flow.
            </div>
            <DesignerInput label="Code" onChange={(value) => patchSerial({ code: value })} value={state.serialRule.code} />
            <DesignerInput label="Name" onChange={(value) => patchSerial({ name: value })} value={state.serialRule.name} />
            <DesignerInput label="Format" onChange={(value) => patchSerial({ format: value })} value={state.serialRule.format} />
            <DesignerInput label="Padding" onChange={(value) => patchSerial({ sequence_padding: value })} type="number" value={state.serialRule.sequence_padding} />
            <DesignerSelect label="Status" onChange={(value) => patchSerial({ status: asStatus(value) })} options={statusSelectOptions} value={state.serialRule.status} />
            <DesignerCheckbox checked={state.serialRule.is_default} label="Default serial rule" onChange={(value) => patchSerial({ is_default: value })} />
          </>
        ) : null}

        {!nodeId || nodeId === "start" || nodeId === "dispatch" ? (
          <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm leading-6 text-slate-600">
            Select the routing, signature, visibility, or serial node to edit workflow details.
          </div>
        ) : null}
      </div>
    </aside>
  );
}

function FullscreenDesigner({
  documentTypes,
  onArchiveRule,
  onDesignerSave,
  onRequestClose,
  positions,
  selectedRule,
  unitTypes
}: {
  documentTypes: DocumentType[];
  onArchiveRule?: WorkflowCanvasProps["onArchiveRule"];
  onDesignerSave?: WorkflowCanvasProps["onDesignerSave"];
  onRequestClose: () => void;
  positions: Position[];
  selectedRule: WorkflowRuleRow;
  unitTypes: UnitType[];
}) {
  const [designerState, setDesignerState] = useState<WorkflowDesignerState>(() => designerStateFromRule(selectedRule));
  const [nodes, setNodes, onNodesChange] = useNodesState<DesignerNode>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>("routing");
  const [drawerOpen, setDrawerOpen] = useState(true);
  const [showValidation, setShowValidation] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const reactFlow = useReactFlow();

  const issues = useMemo(() => validationMessages(designerState, documentTypes), [designerState, documentTypes]);

  useEffect(() => {
    setDesignerState(designerStateFromRule(selectedRule));
    setSelectedNodeId("routing");
    setDrawerOpen(true);
    setError(null);
    setNotice(null);
  }, [selectedRule]);

  useEffect(() => {
    const graph = buildGraph(designerState, selectedRule, documentTypes, positions, unitTypes);
    setNodes((currentNodes) => {
      const previousPositions = new Map(currentNodes.map((node) => [node.id, node.position]));
      return graph.nodes.map((node) => ({
        ...node,
        position: previousPositions.get(node.id) || node.position,
        selected: node.id === selectedNodeId
      }));
    });
    setEdges(graph.edges);
  }, [designerState, documentTypes, positions, selectedNodeId, selectedRule, setEdges, setNodes, unitTypes]);

  function resetLayout() {
    const graph = buildGraph(designerState, selectedRule, documentTypes, positions, unitTypes);
    setNodes(graph.nodes);
    setEdges(graph.edges);
    window.requestAnimationFrame(() => reactFlow.fitView({ padding: 0.2 }));
  }

  function addSignatureStep() {
    const signer = activeOrFirstPosition(positions);
    setDesignerState((current) => {
      const signatureRules = current.signatureRules.map((signatureRule) => ({ ...signatureRule, can_finalize_document: false }));
      signatureRules.push({
        can_be_hidden_later: false,
        can_finalize_document: true,
        is_parallel: false,
        is_required: true,
        localId: `signature-new-${Date.now()}`,
        notes: "",
        required_position_id: signer ? String(signer.id) : "",
        required_unit_scope: "origin_unit",
        signature_mode: "pin_signature_image",
        status: current.routingRule.status === "active" ? "active" : "draft",
        step_number: signatureRules.length + 1
      });
      return { ...current, signatureRules };
    });
    setDrawerOpen(true);
  }

  function removeSignatureStep(localId: string) {
    setDesignerState((current) => {
      const removed = current.signatureRules.find((signatureRule) => signatureRule.localId === localId);
      const remaining = current.signatureRules
        .filter((signatureRule) => signatureRule.localId !== localId)
        .map((signatureRule, index, list) => ({
          ...signatureRule,
          can_finalize_document: index === list.length - 1 ? true : signatureRule.can_finalize_document,
          step_number: index + 1
        }));
      return {
        ...current,
        archive: removed?.id
          ? { ...current.archive, signatureRuleIds: Array.from(new Set([...current.archive.signatureRuleIds, removed.id])) }
          : current.archive,
        signatureRules: remaining
      };
    });
    setSelectedNodeId("routing");
  }

  function toggleVisibilityRule() {
    setDesignerState((current) => {
      if (current.visibilityRule) {
        return {
          ...current,
          archive: current.visibilityRule.id
            ? { ...current.archive, visibilityRuleIds: Array.from(new Set([...current.archive.visibilityRuleIds, current.visibilityRule.id])) }
            : current.archive,
          visibilityRule: null
        };
      }
      return {
        ...current,
        visibilityRule: {
          allowed: current.routingRule.allowed,
          conditions: {},
          document_type_id: current.routingRule.document_type_id,
          forwarding_unit_type_id: current.routingRule.from_unit_type_id,
          notes: current.routingRule.notes,
          priority: current.routingRule.priority,
          show_child_signatures: true,
          show_parent_signatures: true,
          status: current.routingRule.status === "active" ? "active" : "draft",
          visibility_policy: "show_all"
        }
      };
    });
    setSelectedNodeId("visibility");
    setDrawerOpen(true);
  }

  function toggleSerialRule() {
    setDesignerState((current) => {
      if (current.serialRule) {
        return {
          ...current,
          archive: current.serialRule.id
            ? { ...current.archive, serialRuleIds: Array.from(new Set([...current.archive.serialRuleIds, current.serialRule.id])) }
            : current.archive,
          serialRule: null
        };
      }
      const documentType = documentTypes.find((item) => String(item.id) === current.routingRule.document_type_id);
      const codePart = (documentType?.code || selectedRule.documentTypeCode || "WF").replace(/[^a-z0-9_-]/gi, "").slice(0, 28).toUpperCase() || "WF";
      return {
        ...current,
        serialRule: {
          code: `WF-${codePart}-${Date.now().toString(36).toUpperCase()}`,
          format: `${codePart}-{YEAR}-{SEQUENCE}`,
          is_default: false,
          name: `${documentType?.name || selectedRule.documentTypeLabel} serial rule`,
          notes: current.routingRule.notes,
          reset_policy: "yearly",
          scope: "global",
          sequence_padding: "6",
          status: current.routingRule.status === "active" ? "active" : "draft"
        }
      };
    });
    setSelectedNodeId("serial");
    setDrawerOpen(true);
  }

  async function save(statusOverride?: WorkflowStatus) {
    if (!onDesignerSave || busy) {
      return;
    }
    const nextIssues = validationMessages(designerState, documentTypes);
    if (nextIssues.length && statusOverride === "active") {
      setShowValidation(true);
      setError("Resolve validation issues before activating this workflow.");
      return;
    }

    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      await onDesignerSave(selectedRule, designerPayload(designerState, statusOverride));
      setNotice(statusOverride ? `Workflow saved as ${statusOverride}.` : "Workflow saved.");
    } catch (errorValue) {
      setError(errorValue instanceof Error ? errorValue.message : "Workflow save failed.");
    } finally {
      setBusy(false);
    }
  }

  async function archiveRule() {
    if (!onArchiveRule || busy) {
      return;
    }
    const confirmed = window.confirm(`Archive ${selectedRule.ruleName}?`);
    if (!confirmed) {
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await onArchiveRule(selectedRule);
      onRequestClose();
    } catch (errorValue) {
      setError(errorValue instanceof Error ? errorValue.message : "Archive failed.");
      setBusy(false);
    }
  }

  return (
    <div className="relative h-full min-h-[32rem] overflow-hidden bg-slate-50">
      <div className="absolute start-4 top-4 z-20 flex max-w-[calc(100%-2rem)] flex-wrap items-center gap-2 rounded-xl border border-slate-200 bg-white/95 p-2 shadow-lg shadow-slate-900/10 backdrop-blur">
        <Button disabled={busy || !onDesignerSave} icon="export" onClick={() => void save()} variant="primary">Save</Button>
        <Button disabled={busy || !onDesignerSave} icon="serial" onClick={() => void save("draft")}>Save Draft</Button>
        <Button disabled={busy || !onDesignerSave} icon="activity" onClick={() => void save("active")}>Activate</Button>
        <Button disabled={busy || !onDesignerSave} icon="pause" onClick={() => void save("inactive")}>Disable</Button>
        <Button disabled={busy || !onArchiveRule} onClick={() => void archiveRule()} variant="danger">Archive</Button>
        <Button disabled={busy} icon="plus" onClick={addSignatureStep}>Add Signature</Button>
        <Button disabled={busy} icon="view" onClick={toggleVisibilityRule}>{designerState.visibilityRule ? "Remove Visibility" : "Add Visibility"}</Button>
        <Button disabled={busy} icon="serial" onClick={toggleSerialRule}>{designerState.serialRule ? "Remove Serial" : "Add Serial"}</Button>
        <Button icon="shield" onClick={() => setShowValidation((value) => !value)}>Validate</Button>
        <IconButton className="h-10 w-10" icon="fullscreen" label="Fit view" onClick={() => reactFlow.fitView({ padding: 0.2 })} />
        <IconButton className="h-10 w-10" icon="zoomIn" label="Zoom in" onClick={() => reactFlow.zoomIn()} />
        <IconButton className="h-10 w-10" icon="zoomOut" label="Zoom out" onClick={() => reactFlow.zoomOut()} />
        <Button icon="reset" onClick={resetLayout}>Reset Layout</Button>
        <Button onClick={onRequestClose}>Close</Button>
      </div>

      {(error || notice || showValidation) ? (
        <div className="absolute start-4 top-20 z-20 w-[min(36rem,calc(100%-2rem))] space-y-2">
          {error ? <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm font-semibold text-red-700">{error}</div> : null}
          {notice ? <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-semibold text-emerald-700">{notice}</div> : null}
          {showValidation ? (
            <div className={cx("rounded-lg border px-3 py-2 text-sm font-semibold", issues.length ? "border-amber-200 bg-amber-50 text-amber-800" : "border-emerald-200 bg-emerald-50 text-emerald-800")}>
              {issues.length ? issues.map((issue) => <p key={issue}>{issue}</p>) : <p>No validation issues detected.</p>}
            </div>
          ) : null}
        </div>
      ) : null}

      <ReactFlow
        edges={edges}
        fitView
        maxZoom={1.5}
        minZoom={0.25}
        nodeTypes={nodeTypes}
        nodes={nodes}
        nodesConnectable={false}
        onEdgesChange={onEdgesChange}
        onNodeClick={(_event, node) => {
          setSelectedNodeId(node.id);
          setDrawerOpen(true);
        }}
        onNodesChange={onNodesChange}
      >
        <Background />
        <Controls position="bottom-left" />
        <MiniMap pannable position="bottom-right" zoomable />
      </ReactFlow>

      {drawerOpen ? (
        <SelectedNodeDrawer
          documentTypes={documentTypes}
          nodeId={selectedNodeId}
          onCollapse={() => setDrawerOpen(false)}
          onRemoveSignature={removeSignatureStep}
          positions={positions}
          setState={setDesignerState}
          state={designerState}
          unitTypes={unitTypes}
        />
      ) : (
        <button
          className="absolute bottom-4 end-4 z-20 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-bold text-[#061d49] shadow-lg"
          onClick={() => setDrawerOpen(true)}
          type="button"
        >
          Properties
        </button>
      )}
    </div>
  );
}

export function WorkflowCanvas({
  documentTypes,
  onArchiveRule,
  onDesignerSave,
  positions,
  selectedRule,
  unitTypes
}: WorkflowCanvasProps) {
  const { t } = useI18n();
  const [expanded, setExpanded] = useState(false);

  function CompactCanvasBody() {
    if (!selectedRule) {
      return (
        <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
          {t("admin.workflowRules.canvas.empty")}
        </div>
      );
    }

    return (
      <div className="grid min-h-[24rem] gap-4 lg:grid-cols-[minmax(0,1fr)_8rem]">
        <div className="max-h-[34rem] overflow-auto rounded-xl bg-[radial-gradient(circle_at_top,#eff6ff,transparent_38%),linear-gradient(180deg,#fff,#f8fafc)] p-4">
          <div className="flex min-w-[18rem] flex-col items-center">
            {selectedRule.canvasSteps.map((step, index) => (
              <div className="flex w-full flex-col items-center" key={step.id}>
                <CanvasStep step={step} />
                {index < selectedRule.canvasSteps.length - 1 ? (
                  <div className="h-4 w-px bg-[#061d49]/30" />
                ) : null}
              </div>
            ))}
          </div>
        </div>
        <aside className="self-end rounded-lg border border-dashed border-slate-300 bg-white p-3 text-xs text-slate-600">
          <p className="mb-3 font-bold text-slate-950">{t("admin.workflowRules.canvas.legend")}</p>
          {([
            ["active", t("admin.workflowRules.canvas.activeStep")],
            ["optional", t("admin.workflowRules.canvas.optionalStep")],
            ["final", t("admin.workflowRules.canvas.finalStep")],
            ["system", t("admin.workflowRules.canvas.systemStep")],
            ["warning", t("admin.workflowRules.canvas.warning")]
          ] as Array<[WorkflowStepTone, string]>).map(([tone, label]) => (
            <div className="mt-2 flex items-center gap-2" key={tone}>
              <span className={cx("h-2.5 w-2.5 rounded-full", dotToneClasses[tone])} />
              <span>{label}</span>
            </div>
          ))}
        </aside>
      </div>
    );
  }

  return (
    <>
      <PanelCard
        actions={(
          <div className="flex items-center gap-1">
            <IconButton className="h-8 w-8" disabled={!selectedRule} icon="fullscreen" label={t("admin.workflowRules.canvas.expand")} onClick={() => setExpanded(true)} />
            <IconButton className="h-8 w-8" disabled={!selectedRule} icon="zoomIn" label={t("admin.workflowRules.canvas.zoomIn")} onClick={() => setExpanded(true)} />
            <IconButton className="h-8 w-8" disabled={!selectedRule} icon="zoomOut" label={t("admin.workflowRules.canvas.zoomOut")} onClick={() => setExpanded(true)} />
          </div>
        )}
        className="h-full"
        title={t("admin.workflowRules.canvas.title")}
      >
        <CompactCanvasBody />
      </PanelCard>
      <AdminModal
        bodyClassName="p-0 overflow-hidden"
        description={selectedRule ? "Interactive workflow builder. Drag nodes for this session, select a node to edit, then save explicitly." : undefined}
        onClose={() => setExpanded(false)}
        open={expanded}
        size="fullscreen"
        title={selectedRule?.ruleName || t("admin.workflowRules.canvas.title")}
      >
        {selectedRule ? (
          <ReactFlowProvider>
            <FullscreenDesigner
              documentTypes={documentTypes}
              onArchiveRule={onArchiveRule}
              onDesignerSave={onDesignerSave}
              onRequestClose={() => setExpanded(false)}
              positions={positions}
              selectedRule={selectedRule}
              unitTypes={unitTypes}
            />
          </ReactFlowProvider>
        ) : (
          <div className="p-4">{t("admin.workflowRules.canvas.empty")}</div>
        )}
      </AdminModal>
    </>
  );
}
