import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import { Link, useParams } from "react-router-dom";
import {
  collaborationApi,
  documentApi,
  signatureApi,
  templateApi,
  transmissionApi,
  workspaceApi
} from "../../api";
import type {
  DocumentDetail,
  DocumentRequestAction,
  DocumentRequestPermissions,
  DocumentSendAction,
  DocumentSendOptions,
  DocumentSendTarget,
  DocumentTask,
  EntityId,
  JsonRecord,
  SignaturePlacement,
  SignaturePrintOptions,
  SignatureProfile,
  SigningSession,
  WorkspaceReference
} from "../../api";
import { useAuth } from "../../app/AuthContext";
import { FullscreenDocumentPreview } from "../../components/app/FullscreenDocumentPreview";
import { Button, DataTable, Icon, PanelCard, StatusBadge } from "../../components/ui";
import type { IconName } from "../../components/ui";
import { cx } from "../../lib/classNames";
import { downloadBlob, openBlobInNewWindow } from "../../lib/downloads";
import { previewHtmlForFrame } from "../../lib/previewFrame";
import { formatDateTime, numberField, statusLabel, textField } from "./appPageUtils";

type SupportTab = "dispatch" | "attachments" | "comments" | "history";

type DraftRecipient = {
  due_at: string;
  localId: string;
  note: string;
  permissions: DocumentRequestPermissions;
  required_action: DocumentRequestAction;
  requires_comment: boolean;
  target: DocumentSendTarget;
};

const requestActions: DocumentRequestAction[] = ["review", "edit", "sign", "forward", "information"];
const endorsementCommentMaxLength = 300;
const pageWidthMm = 210;
const pageHeightMm = 297;
const minSignatureWidthMm = 20;
const minSignatureHeightMm = 10;

type SigningTarget = {
  task?: DocumentTask;
  type: "self" | "task";
};

const supportTabs: Array<{ id: SupportTab; label: string }> = [
  { id: "dispatch", label: "Transmissions" },
  { id: "attachments", label: "Attachments" },
  { id: "comments", label: "Comments" },
  { id: "history", label: "History" }
];

function transmissionRecipientLabel(recipient: JsonRecord) {
  const label = textField(recipient, "recipient_label", "");
  if (label) {
    return label;
  }

  const targetId = numberField(recipient, "to_assignment_id")
    || numberField(recipient, "to_unit_id")
    || numberField(recipient, "external_organization_id")
    || numberField(recipient, "external_recipient_id");
  const type = statusLabel(textField(recipient, "recipient_type", "recipient"));
  return targetId ? `${type} #${targetId}` : type;
}

function targetLabel(target: DocumentSendTarget) {
  if (target.type === "unit_position") {
    return `${target.positionTitle || "Position"} - ${target.unitName}`;
  }
  return target.unitName;
}

function fileSizeLabel(value: unknown) {
  const size = Number(value);
  if (!Number.isFinite(size) || size <= 0) {
    return "-";
  }
  if (size >= 1024 * 1024) {
    return `${(size / (1024 * 1024)).toFixed(1)} MB`;
  }
  return `${Math.max(1, Math.round(size / 1024))} KB`;
}

function EmptyPreview({ action, children, icon = "view" }: { action?: ReactNode; children: ReactNode; icon?: IconName }) {
  return (
    <div className="grid min-h-[34rem] place-items-center rounded-lg border border-dashed border-slate-300 bg-slate-50 px-4 py-8 text-center">
      <div className="max-w-sm">
        <span className="mx-auto grid h-12 w-12 place-items-center rounded-lg bg-white text-[#061d49] shadow-sm ring-1 ring-slate-200">
          <Icon className="h-6 w-6" name={icon} />
        </span>
        <div className="mt-3 text-sm leading-6 text-slate-600">{children}</div>
        {action ? <div className="mt-4 flex justify-center">{action}</div> : null}
      </div>
    </div>
  );
}

function booleanValue(value: unknown) {
  return value === true || value === 1 || value === "1" || value === "true";
}

function requestActionLabel(action: string | null | undefined) {
  if (!action) {
    return "Request";
  }
  if (action === "information") {
    return "Information";
  }
  return statusLabel(action);
}

function requestActionTone(action: string | null | undefined): "green" | "amber" | "red" | "blue" | "slate" {
  if (action === "sign") return "green";
  if (action === "edit") return "amber";
  if (action === "forward") return "blue";
  if (action === "review") return "slate";
  return "slate";
}

function taskAction(task: DocumentTask) {
  return task.required_action || task.task_type as DocumentRequestAction;
}

function activeAssignment(auth: ReturnType<typeof useAuth>) {
  return auth.assignments.find((assignment) => assignment.id === auth.activeAssignmentId) || null;
}

function taskMatchesActiveAssignment(task: DocumentTask, auth: ReturnType<typeof useAuth>) {
  const active = activeAssignment(auth);
  if (!active || task.status !== "open") {
    return false;
  }
  const assignedAssignmentId = numberField(task as unknown as JsonRecord, "assigned_assignment_id");
  const assignedUnitId = numberField(task as unknown as JsonRecord, "assigned_unit_id");
  const assignedPositionId = numberField(task as unknown as JsonRecord, "assigned_position_id");
  return assignedAssignmentId === active.id
    || Boolean(assignedUnitId === active.unitId && (!assignedPositionId || assignedPositionId === active.positionId));
}

function taskCan(task: DocumentTask, permission: keyof DocumentRequestPermissions) {
  return booleanValue(task[permission]);
}

function taskRequiresComment(task: DocumentTask) {
  return booleanValue(task.requires_comment);
}

function taskTargetLabel(task: DocumentTask) {
  const position = task.assignedPositionTitle || textField(task as unknown as JsonRecord, "assignedPositionTitle", "");
  const unit = task.assignedUnitName || textField(task as unknown as JsonRecord, "assignedUnitName", "");
  if (position && unit) {
    return `${position} - ${unit}`;
  }
  return position || unit || "Assigned request";
}

function defaultPermissionSet(): DocumentRequestPermissions {
  return {
    can_archive: false,
    can_edit: false,
    can_finalize: false,
    can_forward: false,
    can_review: false,
    can_sign: false
  };
}

function fallbackPermissionsForAction(action: DocumentRequestAction): DocumentRequestPermissions {
  const permissions = defaultPermissionSet();
  if (action === "review") {
    return { ...permissions, can_edit: true, can_forward: true, can_review: true };
  }
  if (action === "edit") {
    return { ...permissions, can_edit: true, can_forward: true };
  }
  if (action === "sign") {
    return { ...permissions, can_sign: true };
  }
  if (action === "forward") {
    return { ...permissions, can_forward: true };
  }
  return permissions;
}

function SendRequestsBuilder({
  documentId,
  documentSubject,
  onClose,
  onSent
}: {
  documentId: EntityId;
  documentSubject: string;
  onClose: () => void;
  onSent: (message: string) => void;
}) {
  const [query, setQuery] = useState("");
  const [options, setOptions] = useState<DocumentSendOptions | null>(null);
  const [selectedAction, setSelectedAction] = useState<DocumentRequestAction>("review");
  const [showVacant, setShowVacant] = useState(false);
  const [sharedNote, setSharedNote] = useState("");
  const [sharedDueAt, setSharedDueAt] = useState("");
  const [recipients, setRecipients] = useState<DraftRecipient[]>([]);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const actions = useMemo<DocumentSendAction[]>(() => (
    options?.actions?.length
      ? options.actions
      : requestActions.map((action) => ({
          action,
          defaultPermissions: fallbackPermissionsForAction(action),
          disabledReason: null,
          label: requestActionLabel(action)
        }))
  ), [options]);

  const selectedActionConfig = actions.find((action) => action.action === selectedAction) || actions[0] || null;
  const availableTargets = useMemo(() => (
    (options?.targets || []).filter((target) => showVacant || target.type !== "unit_position" || target.hasActiveHolder)
  ), [options, showVacant]);
  const activePositionTargets = availableTargets.filter((target) => target.type === "unit_position" && target.hasActiveHolder);
  const vacantPositionTargets = availableTargets.filter((target) => target.type === "unit_position" && !target.hasActiveHolder);
  const unitTargets = availableTargets.filter((target) => target.type === "unit");
  const selectedTargetIds = new Set(recipients.map((recipient) => recipient.target.id));
  const targetLimitReached = recipients.length >= 25;
  const canSubmit = Boolean(recipients.length && !submitting && !selectedActionConfig?.disabledReason);

  useEffect(() => {
    let alive = true;
    const timeout = window.setTimeout(() => {
      setLoading(true);
      documentApi.sendOptions(documentId, { limit: 75, q: query.trim() || undefined })
        .then((result) => {
          if (!alive) {
            return;
          }
          setOptions(result);
          const nextActions: DocumentSendAction[] = result.actions?.length
            ? result.actions
            : requestActions.map((action) => ({
                action,
                defaultPermissions: fallbackPermissionsForAction(action),
                disabledReason: null,
                label: requestActionLabel(action)
              }));
          setSelectedAction((current) => (
            nextActions.some((action) => action.action === current && !action.disabledReason)
              ? current
              : nextActions.find((action) => !action.disabledReason)?.action || "review"
          ));
        })
        .catch((caught) => {
          if (alive) {
            setError(caught instanceof Error ? caught.message : "Could not load send options.");
          }
        })
        .finally(() => {
          if (alive) {
            setLoading(false);
          }
        });
    }, 250);

    return () => {
      alive = false;
      window.clearTimeout(timeout);
    };
  }, [documentId, query]);

  function permissionDefaults(action: DocumentRequestAction) {
    return actions.find((item) => item.action === action)?.defaultPermissions || fallbackPermissionsForAction(action);
  }

  function addRecipient(target: DocumentSendTarget) {
    if (selectedTargetIds.has(target.id) || selectedActionConfig?.disabledReason || targetLimitReached) {
      return;
    }
    setRecipients((current) => [
      ...current,
      {
        due_at: sharedDueAt,
        localId: `${target.id}-${Date.now()}-${current.length}`,
        note: "",
        permissions: permissionDefaults(selectedAction),
        required_action: selectedAction,
        requires_comment: selectedAction === "sign" || selectedAction === "review",
        target
      }
    ]);
  }

  function updateRecipient(localId: string, patch: Partial<DraftRecipient>) {
    setRecipients((current) => current.map((recipient) => (
      recipient.localId === localId ? { ...recipient, ...patch } : recipient
    )));
  }

  function updateRecipientAction(recipient: DraftRecipient, action: DocumentRequestAction) {
    updateRecipient(recipient.localId, {
      permissions: permissionDefaults(action),
      required_action: action,
      requires_comment: action === "sign" || action === "review"
    });
  }

  function updateRecipientPermission(
    recipient: DraftRecipient,
    permission: "can_edit" | "can_forward" | "can_review" | "can_sign",
    checked: boolean
  ) {
    const permissions = { ...recipient.permissions, [permission]: checked };
    if (permission === "can_review" && checked) {
      permissions.can_edit = true;
    }
    if (permission === "can_edit" && !checked) {
      permissions.can_review = false;
    }
    updateRecipient(recipient.localId, { permissions });
  }

  function removeRecipient(localId: string) {
    setRecipients((current) => current.filter((recipient) => recipient.localId !== localId));
  }

  function applySharedFields() {
    setRecipients((current) => current.map((recipient) => ({
      ...recipient,
      due_at: sharedDueAt || recipient.due_at,
      note: sharedNote || recipient.note
    })));
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!recipients.length) {
      setError("Choose at least one receiver.");
      return;
    }
    if (selectedActionConfig?.disabledReason) {
      setError(selectedActionConfig.disabledReason);
      return;
    }

    setSubmitting(true);
    setError(null);
    try {
      await documentApi.send(documentId, {
        note: sharedNote.trim() || null,
        recipients: recipients.map((recipient) => ({
          ...recipient.permissions,
          due_at: recipient.due_at || sharedDueAt || null,
          note: recipient.note.trim() || sharedNote.trim() || null,
          required_action: recipient.required_action,
          requires_comment: recipient.requires_comment,
          to_position_id: recipient.target.type === "unit_position" ? recipient.target.positionId || null : null,
          to_unit_id: recipient.target.unitId
        }))
      });
      onSent(`Created ${recipients.length} request${recipients.length === 1 ? "" : "s"}.`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not create requests.");
    } finally {
      setSubmitting(false);
    }
  }

  function renderTargetCard(target: DocumentSendTarget) {
    const selected = selectedTargetIds.has(target.id);
    const vacant = target.type === "unit_position" && !target.hasActiveHolder;
    return (
      <button
        className={cx(
          "rounded-lg border px-3 py-2.5 text-start transition disabled:cursor-not-allowed disabled:opacity-60",
          selected ? "border-[#061d49] bg-[#061d49]/5 ring-2 ring-[#061d49]/10" : "border-slate-200 bg-white hover:border-[#061d49]/30",
          vacant && "border-amber-200 bg-amber-50/60"
        )}
        disabled={selected || selectedActionConfig?.disabledReason !== null && Boolean(selectedActionConfig?.disabledReason) || targetLimitReached}
        key={target.id}
        onClick={() => addRecipient(target)}
        type="button"
      >
        <span className="block truncate text-sm font-bold text-slate-950">{target.type === "unit_position" ? target.positionTitle : target.unitName}</span>
        <span className="mt-1 block text-sm text-slate-600">
          {target.type === "unit_position" ? `${target.unitName} / ${target.unitTypeName}` : target.unitTypeName}
        </span>
        {target.type === "unit_position" ? (
          <span className={cx("mt-2 inline-flex rounded-md px-2 py-1 text-xs font-bold", target.hasActiveHolder ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-800")}>
            {target.hasActiveHolder ? `Person: ${target.holderSummary || "Active holder"}` : "No active person assigned"}
          </span>
        ) : (
          <span className="mt-2 inline-flex rounded-md bg-slate-100 px-2 py-1 text-xs font-bold text-slate-600">Unit queue</span>
        )}
      </button>
    );
  }

  function renderTargetGroup(label: string, targets: DocumentSendTarget[]) {
    if (!targets.length) {
      return null;
    }
    return (
      <div>
        <p className="text-xs font-black uppercase tracking-wide text-slate-500">{label}</p>
        <div className="mt-2 grid gap-2">{targets.map((target) => renderTargetCard(target))}</div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/55 p-4">
      <div className="flex max-h-[92vh] w-full max-w-6xl flex-col overflow-hidden rounded-xl bg-white shadow-2xl">
        <header className="flex items-start justify-between gap-4 border-b border-slate-200 px-5 py-4">
          <div className="min-w-0">
            <h2 className="text-xl font-black text-slate-950">Send requests</h2>
            <p className="mt-1 truncate text-sm text-slate-500">{documentSubject}</p>
          </div>
          <Button icon="x" onClick={onClose}>Close</Button>
        </header>

        <form className="min-h-0 overflow-y-auto p-5" onSubmit={submit}>
          {loading && !options ? <div className="py-10 text-center text-sm text-slate-500">Loading send options...</div> : null}

          {options ? (
            <div className="grid min-h-0 gap-4 lg:grid-cols-[minmax(18rem,0.9fr)_minmax(0,1.35fr)]">
              <section className="space-y-4">
                <div className="grid gap-3 rounded-lg border border-slate-200 bg-slate-50 p-3">
                  <label className="block text-sm font-bold text-slate-700">
                    Default primary request
                    <select
                      className="mt-2 min-h-11 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm outline-none focus:border-[#061d49] focus:ring-4 focus:ring-[#061d49]/10"
                      onChange={(event) => setSelectedAction(event.target.value as DocumentRequestAction)}
                      value={selectedAction}
                    >
                      {actions.map((action) => (
                        <option disabled={Boolean(action.disabledReason)} key={action.action} value={action.action}>{action.label}</option>
                      ))}
                    </select>
                  </label>
                  <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1">
                    <label className="block text-sm font-bold text-slate-700">
                      Shared due date
                      <input className="mt-2 min-h-11 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm outline-none focus:border-[#061d49] focus:ring-4 focus:ring-[#061d49]/10" onChange={(event) => setSharedDueAt(event.target.value)} type="datetime-local" value={sharedDueAt} />
                    </label>
                    <label className="block text-sm font-bold text-slate-700">
                      Shared note
                      <textarea className="mt-2 min-h-20 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-[#061d49] focus:ring-4 focus:ring-[#061d49]/10" onChange={(event) => setSharedNote(event.target.value)} value={sharedNote} />
                    </label>
                  </div>
                  {recipients.length ? <Button className="w-full" onClick={applySharedFields}>Apply shared fields</Button> : null}
                </div>

                <div className="space-y-3">
                  <div className="flex flex-wrap items-end gap-3">
                    <label className="min-w-0 flex-1 text-sm font-bold text-slate-700">
                      Receiver search
                      <input
                        className="mt-2 min-h-11 w-full rounded-lg border border-slate-200 px-3 text-sm outline-none focus:border-[#061d49] focus:ring-4 focus:ring-[#061d49]/10"
                        onChange={(event) => setQuery(event.target.value)}
                        placeholder="Search by unit or position..."
                        value={query}
                      />
                    </label>
                    <label className="flex min-h-11 items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 text-sm font-bold text-slate-700">
                      <input checked={showVacant} onChange={(event) => setShowVacant(event.target.checked)} type="checkbox" />
                      Vacant
                    </label>
                  </div>
                  {loading ? <p className="text-sm text-slate-500">Updating receivers...</p> : null}
                  {!availableTargets.length ? (
                    <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">No receivers match this search.</div>
                  ) : null}
                  {renderTargetGroup("Positions", activePositionTargets)}
                  {renderTargetGroup("Units", unitTargets)}
                  {renderTargetGroup("Vacant positions", vacantPositionTargets)}
                </div>
              </section>

              <section className="min-w-0 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <h3 className="text-lg font-bold text-slate-950">Requests</h3>
                    <p className="mt-0.5 text-sm text-slate-500">{recipients.length ? `${recipients.length} receiver${recipients.length === 1 ? "" : "s"} selected` : "No receivers selected"}</p>
                  </div>
                  {targetLimitReached ? <span className="rounded-full bg-amber-50 px-3 py-1 text-xs font-bold text-amber-700">Limit reached</span> : null}
                </div>

                {recipients.length ? (
                  <div className="space-y-3">
                    {recipients.map((recipient) => (
                      <div className="rounded-lg border border-slate-200 bg-white p-3" key={recipient.localId}>
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="truncate text-sm font-black text-slate-950">{targetLabel(recipient.target)}</p>
                            <p className="mt-1 text-xs text-slate-500">
                              {recipient.target.type === "unit_position" ? recipient.target.holderSummary || "Position queue" : "Unit queue"}
                            </p>
                          </div>
                          <Button icon="x" onClick={() => removeRecipient(recipient.localId)} variant="ghost">Remove</Button>
                        </div>

                        <div className="mt-3 grid gap-3 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
                          <label className="block text-sm font-bold text-slate-700">
                            Primary request
                            <select
                              className="mt-2 min-h-11 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm outline-none focus:border-[#061d49] focus:ring-4 focus:ring-[#061d49]/10"
                              onChange={(event) => updateRecipientAction(recipient, event.target.value as DocumentRequestAction)}
                              value={recipient.required_action}
                            >
                              {actions.map((action) => (
                                <option disabled={Boolean(action.disabledReason)} key={action.action} value={action.action}>{action.label}</option>
                              ))}
                            </select>
                          </label>
                          <label className="block text-sm font-bold text-slate-700">
                            Due date
                            <input className="mt-2 min-h-11 w-full rounded-lg border border-slate-200 px-3 text-sm outline-none focus:border-[#061d49] focus:ring-4 focus:ring-[#061d49]/10" onChange={(event) => updateRecipient(recipient.localId, { due_at: event.target.value })} type="datetime-local" value={recipient.due_at} />
                          </label>
                        </div>

                        <div className="mt-3 rounded-lg border border-slate-200 bg-slate-50 p-3">
                          <p className="text-xs font-black uppercase tracking-wide text-slate-500">Allowed actions</p>
                          <div className="mt-2 grid gap-2 sm:grid-cols-2">
                            {([
                              ["can_review", "Review / approve"],
                              ["can_edit", "Edit"],
                              ["can_sign", "Sign"],
                              ["can_forward", "Forward"]
                            ] as const).map(([permission, label]) => (
                              <label className="flex min-h-10 items-center gap-2 rounded-md bg-white px-3 text-sm font-bold text-slate-700 ring-1 ring-slate-200" key={permission}>
                                <input
                                  checked={Boolean(recipient.permissions[permission])}
                                  onChange={(event) => updateRecipientPermission(recipient, permission, event.target.checked)}
                                  type="checkbox"
                                />
                                {label}
                              </label>
                            ))}
                          </div>
                        </div>

                        <label className="mt-3 block text-sm font-bold text-slate-700">
                          Note
                          <textarea className="mt-2 min-h-20 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-[#061d49] focus:ring-4 focus:ring-[#061d49]/10" onChange={(event) => updateRecipient(recipient.localId, { note: event.target.value })} value={recipient.note} />
                        </label>

                        <label className="mt-3 flex min-h-10 items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 text-sm font-bold text-slate-700">
                          <input checked={recipient.requires_comment} onChange={(event) => updateRecipient(recipient.localId, { requires_comment: event.target.checked })} type="checkbox" />
                          Require response comment
                        </label>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="grid min-h-80 place-items-center rounded-lg border border-dashed border-slate-300 bg-slate-50 p-6 text-center">
                    <div className="max-w-sm">
                      <Icon className="mx-auto h-8 w-8 text-[#061d49]" name="users" />
                      <p className="mt-3 text-sm leading-6 text-slate-600">Search and add receivers to build the request list.</p>
                    </div>
                  </div>
                )}
              </section>
            </div>
          ) : null}

          {error ? <div className="mt-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm font-semibold text-red-700">{error}</div> : null}

          <footer className="mt-6 flex flex-wrap items-center justify-between gap-2 border-t border-slate-200 pt-4">
            <div className="text-sm font-semibold text-slate-500">
              {recipients.length ? `${recipients.length} request${recipients.length === 1 ? "" : "s"} ready` : "No requests ready"}
            </div>
            <div className="flex flex-wrap gap-2">
              <Button disabled={submitting} onClick={onClose}>Cancel</Button>
              <Button disabled={!canSubmit} icon="export" type="submit" variant="primary">
                {submitting ? "Sending..." : "Send requests"}
              </Button>
            </div>
          </footer>
        </form>
      </div>
    </div>
  );
}

function OfficialDocumentPreview({
  html,
  onFullscreen,
  onDownloadPdf,
  onOpenPdf,
  onRefresh,
  pdfActionBusy,
  previewError,
  previewLoading,
  previewUpdatedAt
}: {
  html: string;
  onFullscreen: () => void;
  onDownloadPdf: () => void;
  onOpenPdf: () => void;
  onRefresh: () => void;
  pdfActionBusy: "download" | "open" | null;
  previewError: string | null;
  previewLoading: boolean;
  previewUpdatedAt: string | null;
}) {
  const previewStatusText = previewLoading
    ? "Rendering preview..."
    : previewUpdatedAt
      ? `Updated ${previewUpdatedAt}`
      : html
        ? "Preview ready"
        : "No preview";

  return (
    <PanelCard
      actions={(
        <div className="flex flex-wrap gap-2">
          <Button disabled={previewLoading} icon="reset" onClick={onRefresh}>Refresh</Button>
          <Button disabled={!html} icon="fullscreen" onClick={onFullscreen}>Fullscreen</Button>
          <Button disabled={Boolean(pdfActionBusy)} icon="view" onClick={onOpenPdf}>
            {pdfActionBusy === "open" ? "Opening..." : "Open PDF"}
          </Button>
          <Button disabled={Boolean(pdfActionBusy)} icon="export" onClick={onDownloadPdf}>
            {pdfActionBusy === "download" ? "Preparing..." : "Download"}
          </Button>
        </div>
      )}
      bodyClassName="space-y-3"
      title="Official document preview"
    >
      <div className="flex flex-wrap items-center justify-between gap-2 text-sm font-semibold text-slate-500">
        <span>{previewStatusText}</span>
        <span>{pdfActionBusy ? "preparing pdf" : "pdf on demand"}</span>
      </div>
      {previewError ? (
        <EmptyPreview action={<Button icon="reset" onClick={onRefresh}>Try again</Button>} icon="x">
          {previewError}
        </EmptyPreview>
      ) : html ? (
        <iframe
          className="h-[calc(100vh-18rem)] min-h-[42rem] w-full rounded-lg border border-slate-200 bg-white"
          srcDoc={previewHtmlForFrame(html)}
          title="Official document preview"
        />
      ) : (
        <EmptyPreview action={<Button disabled={previewLoading} icon="reset" onClick={onRefresh}>Refresh</Button>}>
          The official document preview will appear here.
        </EmptyPreview>
      )}
    </PanelCard>
  );
}

function clampNumber(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function normalizePlacement(value: SignaturePlacement): SignaturePlacement {
  const width = clampNumber(value.render_width, minSignatureWidthMm, pageWidthMm);
  const height = clampNumber(value.render_height, minSignatureHeightMm, pageHeightMm);
  return {
    render_page: Math.max(1, Math.round(value.render_page || 1)),
    render_width: width,
    render_height: height,
    render_x: clampNumber(value.render_x, 0, pageWidthMm - width),
    render_y: clampNumber(value.render_y, 0, pageHeightMm - height)
  };
}

function formatPlacementNumber(value: number, precision = 0) {
  if (!Number.isFinite(value)) {
    return "";
  }
  if (precision <= 0) {
    return String(Math.round(value));
  }
  return value.toFixed(precision).replace(/\.0$/, "");
}

function PlacementNumberInput({
  integer = false,
  label,
  max,
  min,
  onCommit,
  precision = 0,
  step = 1,
  unit,
  value
}: {
  integer?: boolean;
  label: string;
  max: number;
  min: number;
  onCommit: (value: number) => void;
  precision?: number;
  step?: number;
  unit?: string;
  value: number;
}) {
  const [draft, setDraft] = useState(formatPlacementNumber(value, precision));
  const [focused, setFocused] = useState(false);
  const normalizedMax = Math.max(min, max);

  useEffect(() => {
    if (!focused) {
      setDraft(formatPlacementNumber(value, precision));
    }
  }, [focused, precision, value]);

  const normalizeInputValue = (next: number) => {
    const clamped = clampNumber(next, min, normalizedMax);
    return integer ? Math.round(clamped) : clamped;
  };

  const commitDraft = (raw: string) => {
    const parsed = Number(raw);
    const next = raw.trim() && Number.isFinite(parsed)
      ? normalizeInputValue(parsed)
      : normalizeInputValue(value);
    onCommit(next);
    setDraft(formatPlacementNumber(next, precision));
  };

  const nudgeValue = (direction: -1 | 1) => {
    const next = normalizeInputValue(value + (step * direction));
    onCommit(next);
    setDraft(formatPlacementNumber(next, precision));
  };

  return (
    <div className="min-w-0 rounded-lg border border-slate-200 bg-white p-2 shadow-sm shadow-slate-900/[0.03]">
      <div className="mb-1 flex items-center justify-between gap-2">
        <span className="text-xs font-black uppercase tracking-wide text-slate-500">{label}</span>
        {unit ? <span className="text-[11px] font-bold text-slate-400">{unit}</span> : null}
      </div>
      <div className="flex min-h-10 items-center gap-1 rounded-md bg-slate-50 px-1 ring-1 ring-slate-100 focus-within:bg-white focus-within:ring-[#061d49]/25">
        <button
          aria-label={`Decrease ${label}`}
          className="grid h-8 w-8 shrink-0 place-items-center rounded-md border border-slate-200 bg-white text-sm font-black text-[#061d49] shadow-sm transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-40"
          disabled={value <= min}
          onClick={() => nudgeValue(-1)}
          type="button"
        >
          -
        </button>
        <input
          className="min-w-0 flex-1 border-0 bg-transparent px-1 text-center text-sm font-black text-slate-900 outline-none"
          inputMode="decimal"
          max={normalizedMax}
          min={min}
          onBlur={(event) => {
            setFocused(false);
            commitDraft(event.currentTarget.value);
          }}
          onChange={(event) => {
            const raw = event.currentTarget.value;
            setDraft(raw);
            const parsed = Number(raw);
            if (!raw.trim() || !Number.isFinite(parsed)) {
              return;
            }
            const next = normalizeInputValue(parsed);
            onCommit(next);
            if (next !== parsed) {
              setDraft(formatPlacementNumber(next, precision));
            }
          }}
          onFocus={() => setFocused(true)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              commitDraft(event.currentTarget.value);
              event.currentTarget.blur();
            }
          }}
          step={step}
          type="number"
          value={draft}
        />
        <button
          aria-label={`Increase ${label}`}
          className="grid h-8 w-8 shrink-0 place-items-center rounded-md border border-slate-200 bg-white text-sm font-black text-[#061d49] shadow-sm transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-40"
          disabled={value >= normalizedMax}
          onClick={() => nudgeValue(1)}
          type="button"
        >
          +
        </button>
      </div>
    </div>
  );
}

function SignaturePlacementFrame({
  comment,
  html,
  onPageCount,
  onPlacementChange,
  placement,
  printOptions,
  signatureImage,
  signer
}: {
  comment: string;
  html: string;
  onPageCount: (count: number) => void;
  onPlacementChange: (placement: SignaturePlacement) => void;
  placement: SignaturePlacement;
  printOptions: SignaturePrintOptions;
  signatureImage: string;
  signer?: SigningSession["signer"];
}) {
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const placementRef = useRef(placement);
  const onPageCountRef = useRef(onPageCount);
  const onPlacementChangeRef = useRef(onPlacementChange);
  const [frameReady, setFrameReady] = useState(0);

  useEffect(() => {
    placementRef.current = placement;
    const doc = iframeRef.current?.contentDocument;
    const overlay = doc?.querySelector<HTMLElement>(".dc-sign-placement-ui");
    if (overlay) {
      overlay.style.left = `${placement.render_x}mm`;
      overlay.style.top = `${placement.render_y}mm`;
      overlay.style.width = `${placement.render_width}mm`;
      overlay.style.height = `${placement.render_height}mm`;
    }
  }, [placement]);

  useEffect(() => {
    onPlacementChangeRef.current = onPlacementChange;
  }, [onPlacementChange]);

  useEffect(() => {
    onPageCountRef.current = onPageCount;
  }, [onPageCount]);

  useEffect(() => {
    const doc = iframeRef.current?.contentDocument;
    const win = iframeRef.current?.contentWindow;
    if (!doc || !win || !signatureImage) {
      return undefined;
    }

    const pages = Array.from(doc.querySelectorAll<HTMLElement>(".dc-page, .dc-word-page"));
    onPageCountRef.current(Math.max(1, pages.length));
    doc.querySelectorAll(".dc-sign-placement-ui").forEach((item) => item.remove());
    const pageIndex = clampNumber(placementRef.current.render_page - 1, 0, Math.max(0, pages.length - 1));
    const page = pages[pageIndex];
    if (!page) {
      return undefined;
    }
    if (win.getComputedStyle(page).position === "static") {
      page.style.position = "relative";
    }

    const overlay = doc.createElement("div");
    overlay.className = "dc-sign-placement-ui";
    overlay.style.cssText = [
      "position:absolute",
      "z-index:50",
      "box-sizing:border-box",
      "display:flex",
      "flex-direction:column",
      "align-items:center",
      "justify-content:flex-end",
      "border:1.5px solid #059669",
      "box-shadow:0 0 0 2px rgba(5,150,105,.12)",
      "background:rgba(236,253,245,.34)",
      "cursor:move",
      "overflow:hidden",
      "color:#064e3b",
      "font:600 8px/1.15 Arial,sans-serif",
      "text-align:center",
      "touch-action:none",
      "user-select:none"
    ].join(";");

    const image = doc.createElement("img");
    image.alt = "";
    image.src = signatureImage;
    image.style.cssText = "max-width:100%;min-height:0;max-height:100%;object-fit:contain;flex:1 1 auto;pointer-events:none;";
    overlay.appendChild(image);

    const metaParts = [
      printOptions.show_name_position ? signer?.name || "" : "",
      printOptions.show_name_position ? [signer?.position, signer?.unit].filter(Boolean).join(" - ") : "",
      printOptions.show_date ? new Date().toLocaleDateString() : "",
      printOptions.show_comment && comment ? comment : ""
    ].filter(Boolean);
    if (metaParts.length) {
      const meta = doc.createElement("div");
      meta.style.cssText = "flex:0 0 auto;max-width:100%;overflow:hidden;pointer-events:none;";
      metaParts.forEach((part) => {
        const line = doc.createElement("div");
        line.style.cssText = "max-width:100%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;";
        line.textContent = part;
        meta.appendChild(line);
      });
      overlay.appendChild(meta);
    }

    const handle = doc.createElement("span");
    handle.title = "Resize signature";
    handle.style.cssText = [
      "position:absolute",
      "right:-1px",
      "bottom:-1px",
      "width:16px",
      "height:16px",
      "border:2px solid #ffffff",
      "background:#059669",
      "box-shadow:0 1px 4px rgba(15,23,42,.22)",
      "cursor:nwse-resize",
      "touch-action:none"
    ].join(";");
    overlay.appendChild(handle);
    page.appendChild(overlay);

    const applyPlacement = (next: SignaturePlacement) => {
      const normalized = normalizePlacement(next);
      placementRef.current = normalized;
      overlay.style.left = `${normalized.render_x}mm`;
      overlay.style.top = `${normalized.render_y}mm`;
      overlay.style.width = `${normalized.render_width}mm`;
      overlay.style.height = `${normalized.render_height}mm`;
      onPlacementChangeRef.current(normalized);
    };

    applyPlacement(placementRef.current);
    let drag:
      | {
          mode: "move" | "resize";
          offsetX: number;
          offsetY: number;
          pointerId: number;
          start: SignaturePlacement;
        }
      | null = null;

    const pointInPageMm = (clientX: number, clientY: number) => {
      const rect = page.getBoundingClientRect();
      return {
        x: ((clientX - rect.left) / Math.max(1, rect.width)) * pageWidthMm,
        y: ((clientY - rect.top) / Math.max(1, rect.height)) * pageHeightMm
      };
    };

    const startDrag = (target: EventTarget | null, clientX: number, clientY: number, pointerId: number) => {
      const point = pointInPageMm(clientX, clientY);
      const current = placementRef.current;
      const mode = target === handle ? "resize" : "move";
      drag = {
        mode,
        offsetX: mode === "resize" ? current.render_width - (point.x - current.render_x) : point.x - current.render_x,
        offsetY: mode === "resize" ? current.render_height - (point.y - current.render_y) : point.y - current.render_y,
        pointerId,
        start: current
      };
      try {
        overlay.setPointerCapture(pointerId);
      } catch {
        // The iframe document listeners below keep dragging alive if pointer capture is unavailable.
      }
      overlay.style.cursor = target === handle ? "nwse-resize" : "grabbing";
      doc.body.style.userSelect = "none";
      doc.body.style.cursor = overlay.style.cursor;
    };

    const moveDrag = (clientX: number, clientY: number) => {
      if (!drag) {
        return;
      }
      const point = pointInPageMm(clientX, clientY);
      if (drag.mode === "move") {
        applyPlacement({
          ...drag.start,
          render_x: point.x - drag.offsetX,
          render_y: point.y - drag.offsetY
        });
      } else {
        applyPlacement({
          ...drag.start,
          render_width: point.x - drag.start.render_x + drag.offsetX,
          render_height: point.y - drag.start.render_y + drag.offsetY
        });
      }
    };

    const onPointerDown = (event: PointerEvent) => {
      event.preventDefault();
      event.stopPropagation();
      startDrag(event.target, event.clientX, event.clientY, event.pointerId);
    };

    const onPointerMove = (event: PointerEvent) => {
      if (!drag) {
        return;
      }
      if (event.pointerId !== drag.pointerId) {
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      moveDrag(event.clientX, event.clientY);
    };

    const endDrag = (event: PointerEvent) => {
      if (!drag) {
        return;
      }
      if (event.pointerId !== drag.pointerId) {
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      try {
        if (overlay.hasPointerCapture(event.pointerId)) {
          overlay.releasePointerCapture(event.pointerId);
        }
      } catch {
        // Nothing to release when pointer capture was not granted.
      }
      overlay.style.cursor = "move";
      doc.body.style.userSelect = "";
      doc.body.style.cursor = "";
      drag = null;
    };

    overlay.addEventListener("pointerdown", onPointerDown);
    overlay.addEventListener("pointermove", onPointerMove);
    overlay.addEventListener("pointerup", endDrag);
    overlay.addEventListener("pointercancel", endDrag);
    doc.addEventListener("pointermove", onPointerMove);
    doc.addEventListener("pointerup", endDrag);
    doc.addEventListener("pointercancel", endDrag);
    win.addEventListener("pointermove", onPointerMove);
    win.addEventListener("pointerup", endDrag);
    win.addEventListener("pointercancel", endDrag);

    return () => {
      overlay.removeEventListener("pointerdown", onPointerDown);
      overlay.removeEventListener("pointermove", onPointerMove);
      overlay.removeEventListener("pointerup", endDrag);
      overlay.removeEventListener("pointercancel", endDrag);
      doc.removeEventListener("pointermove", onPointerMove);
      doc.removeEventListener("pointerup", endDrag);
      doc.removeEventListener("pointercancel", endDrag);
      win.removeEventListener("pointermove", onPointerMove);
      win.removeEventListener("pointerup", endDrag);
      win.removeEventListener("pointercancel", endDrag);
      doc.body.style.userSelect = "";
      doc.body.style.cursor = "";
      overlay.remove();
    };
  }, [comment, frameReady, html, placement.render_page, printOptions, signatureImage, signer]);

  return (
    <iframe
      className="h-[min(72vh,52rem)] min-h-[32rem] w-full rounded-lg border border-slate-200 bg-white"
      onLoad={() => setFrameReady((current) => current + 1)}
      ref={iframeRef}
      srcDoc={previewHtmlForFrame(html)}
      title="Signature placement preview"
    />
  );
}

function SigningModal({
  documentId,
  expectedDocumentHash,
  expectedDocumentVersion,
  onClose,
  onSigned,
  previewHtml,
  signatureProfile,
  subject,
  target
}: {
  documentId: EntityId;
  expectedDocumentHash?: string;
  expectedDocumentVersion?: number;
  onClose: () => void;
  onSigned: () => Promise<void>;
  previewHtml: string;
  signatureProfile: SignatureProfile | null;
  subject: string;
  target: SigningTarget;
}) {
  const [pin, setPin] = useState("");
  const [responseNote, setResponseNote] = useState("");
  const [session, setSession] = useState<SigningSession | null>(null);
  const [placement, setPlacement] = useState<SignaturePlacement>({
    render_page: 1,
    render_x: 128,
    render_y: 226,
    render_width: 46,
    render_height: 18
  });
  const [pageCount, setPageCount] = useState(1);
  const [printOptions, setPrintOptions] = useState<SignaturePrintOptions>({
    show_comment: false,
    show_date: false,
    show_name_position: true
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const requiresComment = target.task ? taskRequiresComment(target.task) : false;

  async function unlockSignature(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const note = responseNote.trim();
    if (!pin.trim()) {
      setError("Enter your signature PIN.");
      return;
    }
    if (requiresComment && !note) {
      setError("Enter the required comment before signing.");
      return;
    }
    if (note.length > endorsementCommentMaxLength) {
      setError(`Comment must be ${endorsementCommentMaxLength} characters or fewer.`);
      return;
    }

    setBusy(true);
    setError(null);
    try {
      const input = {
        expected_document_hash: expectedDocumentHash,
        expected_document_version_number: expectedDocumentVersion,
        pin: pin.trim(),
        response_note: note || null
      };
      const nextSession = target.type === "task" && target.task
        ? await signatureApi.createTaskSigningSession(documentId, target.task.id, input)
        : await signatureApi.createSigningSession(documentId, input);
      setSession(nextSession);
      setPlacement(normalizePlacement(nextSession.placement));
      setPrintOptions(nextSession.print_options);
      setPin("");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not unlock signature.");
    } finally {
      setBusy(false);
    }
  }

  async function submitSignature() {
    if (!session) {
      return;
    }
    const note = responseNote.trim();
    if (requiresComment && !note) {
      setError("Enter the required comment before signing.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const payload = {
        ...normalizePlacement(placement),
        placement_token: session.placement_token,
        print_options: printOptions,
        response_note: note || null
      };
      if (target.type === "task" && target.task) {
        await signatureApi.signTask(documentId, target.task.id, payload);
      } else {
        await signatureApi.signDocument(documentId, payload);
      }
      await onSigned();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not sign this document.");
    } finally {
      setBusy(false);
    }
  }

  const title = target.type === "task" && target.task ? `Sign request - ${taskTargetLabel(target.task)}` : "Sign document";
  const stage = session ? "place" : "unlock";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-3">
      <div className="flex max-h-[96vh] w-full max-w-7xl flex-col overflow-hidden rounded-xl bg-white shadow-2xl">
        <header className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-200 px-5 py-4">
          <div className="min-w-0">
            <h2 className="text-lg font-black text-slate-950">{title}</h2>
            <p className="mt-1 truncate text-sm text-slate-500">{subject}</p>
          </div>
          <Button disabled={busy} icon="x" onClick={onClose}>Close</Button>
        </header>

        {error ? <div className="mx-5 mt-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">{error}</div> : null}

        <div className="min-h-0 flex-1 overflow-auto p-5">
          {stage === "unlock" ? (
            <form className="mx-auto grid max-w-xl gap-4" onSubmit={unlockSignature}>
              {!signatureProfile ? (
                <p className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-800">
                  <Link className="underline" to="/app/signature-profile">Enroll a signature profile</Link> before signing.
                </p>
              ) : null}
              <label className="block text-sm font-bold text-slate-700">
                Signature PIN
                <input
                  className="mt-2 min-h-11 w-full rounded-lg border border-slate-200 px-3 text-sm outline-none focus:border-[#061d49] focus:ring-4 focus:ring-[#061d49]/10"
                  onChange={(event) => setPin(event.target.value)}
                  type="password"
                  value={pin}
                />
              </label>
              <label className="block text-sm font-bold text-slate-700">
                Comment {requiresComment ? <span className="text-red-700">*</span> : null}
                <textarea
                  className="mt-2 min-h-28 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-[#061d49] focus:ring-4 focus:ring-[#061d49]/10"
                  maxLength={endorsementCommentMaxLength}
                  onChange={(event) => setResponseNote(event.target.value)}
                  value={responseNote}
                />
                <span className="mt-1 block text-xs text-slate-500">{responseNote.length}/{endorsementCommentMaxLength}</span>
              </label>
              <Button disabled={busy || !signatureProfile} type="submit" variant="primary">{busy ? "Unlocking..." : "Unlock signature"}</Button>
            </form>
          ) : session ? (
            <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_20rem]">
              <SignaturePlacementFrame
                comment={responseNote.trim()}
                html={previewHtml}
                onPageCount={(count) => {
                  setPageCount(count);
                  setPlacement((current) => (
                    current.render_page <= count
                      ? current
                      : normalizePlacement({ ...current, render_page: count })
                  ));
                }}
                onPlacementChange={setPlacement}
                placement={placement}
                printOptions={printOptions}
                signatureImage={session.signature_image.data_url}
                signer={session.signer}
              />
              <aside className="space-y-3">
                <section className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                  <div className="mb-3 flex items-center justify-between gap-2">
                    <h3 className="text-sm font-black text-slate-950">Placement</h3>
                    <span className="rounded-md bg-white px-2 py-1 text-[11px] font-bold text-slate-500 ring-1 ring-slate-200">A4 mm</span>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <PlacementNumberInput
                      integer
                      label="Page"
                      max={pageCount}
                      min={1}
                      onCommit={(value) => setPlacement((current) => normalizePlacement({ ...current, render_page: value }))}
                      value={placement.render_page}
                    />
                    <PlacementNumberInput
                      label="Width"
                      max={pageWidthMm}
                      min={minSignatureWidthMm}
                      onCommit={(value) => setPlacement((current) => normalizePlacement({ ...current, render_width: value }))}
                      unit="mm"
                      value={placement.render_width}
                    />
                    <PlacementNumberInput
                      label="Height"
                      max={pageHeightMm}
                      min={minSignatureHeightMm}
                      onCommit={(value) => setPlacement((current) => normalizePlacement({ ...current, render_height: value }))}
                      unit="mm"
                      value={placement.render_height}
                    />
                    <PlacementNumberInput
                      label="X"
                      max={pageWidthMm - placement.render_width}
                      min={0}
                      onCommit={(value) => setPlacement((current) => normalizePlacement({ ...current, render_x: value }))}
                      precision={1}
                      step={0.5}
                      unit="mm"
                      value={placement.render_x}
                    />
                    <PlacementNumberInput
                      label="Y"
                      max={pageHeightMm - placement.render_height}
                      min={0}
                      onCommit={(value) => setPlacement((current) => normalizePlacement({ ...current, render_y: value }))}
                      precision={1}
                      step={0.5}
                      unit="mm"
                      value={placement.render_y}
                    />
                  </div>
                </section>

                <section className="rounded-lg border border-slate-200 bg-white p-3">
                  <h3 className="mb-3 text-sm font-black text-slate-950">Printed details</h3>
                  <div className="grid gap-2 text-sm font-semibold text-slate-700">
                    <label className="flex min-h-10 items-center gap-2 rounded-md bg-slate-50 px-3 ring-1 ring-slate-100">
                      <input checked={printOptions.show_name_position} onChange={(event) => setPrintOptions((current) => ({ ...current, show_name_position: event.target.checked }))} type="checkbox" />
                      Name / position
                    </label>
                    <label className="flex min-h-10 items-center gap-2 rounded-md bg-slate-50 px-3 ring-1 ring-slate-100">
                      <input checked={printOptions.show_date} onChange={(event) => setPrintOptions((current) => ({ ...current, show_date: event.target.checked }))} type="checkbox" />
                      Date
                    </label>
                    <label className="flex min-h-10 items-center gap-2 rounded-md bg-slate-50 px-3 ring-1 ring-slate-100">
                      <input checked={printOptions.show_comment} disabled={!responseNote.trim()} onChange={(event) => setPrintOptions((current) => ({ ...current, show_comment: event.target.checked }))} type="checkbox" />
                      Comment
                    </label>
                  </div>
                </section>

                <section className="grid grid-cols-3 gap-2 rounded-lg border border-slate-200 bg-[#061d49] p-3 text-white">
                  <div>
                    <p className="text-[10px] font-black uppercase tracking-wide text-white/55">X</p>
                    <p className="mt-1 text-sm font-black">{placement.render_x.toFixed(1)}</p>
                  </div>
                  <div>
                    <p className="text-[10px] font-black uppercase tracking-wide text-white/55">Y</p>
                    <p className="mt-1 text-sm font-black">{placement.render_y.toFixed(1)}</p>
                  </div>
                  <div>
                    <p className="text-[10px] font-black uppercase tracking-wide text-white/55">Size</p>
                    <p className="mt-1 text-sm font-black">{Math.round(placement.render_width)}x{Math.round(placement.render_height)}</p>
                  </div>
                </section>
              </aside>
            </div>
          ) : null}
        </div>

        <footer className="flex flex-wrap justify-end gap-2 border-t border-slate-200 px-5 py-4">
          <Button disabled={busy} onClick={onClose}>Cancel</Button>
          {session ? <Button disabled={busy} icon="signature" onClick={() => void submitSignature()} variant="primary">{busy ? "Signing..." : "Sign"}</Button> : null}
        </footer>
      </div>
    </div>
  );
}

function DocumentActionPanel({
  canArchive,
  canEdit,
  canFinalize,
  canSend,
  canSelfSign,
  activePositionAlreadySigned,
  documentId,
  documentStatus,
  myOpenTasks,
  officialSerial,
  onArchive,
  onCompleteTask,
  onFinalize,
  onOpenSend,
  onOpenSelfSign,
  onSignTask,
  openTasks,
  signatureProfile,
  signing,
  tasks
}: {
  canArchive: boolean;
  canEdit: boolean;
  canFinalize: boolean;
  canSend: boolean;
  canSelfSign: boolean;
  activePositionAlreadySigned: boolean;
  documentId: EntityId;
  documentStatus: string;
  myOpenTasks: DocumentTask[];
  officialSerial: string;
  onArchive: () => void;
  onCompleteTask: (task: DocumentTask) => void;
  onFinalize: () => void;
  onOpenSend: () => void;
  onOpenSelfSign: () => void;
  onSignTask: (task: DocumentTask) => void;
  openTasks: DocumentTask[];
  signatureProfile: SignatureProfile | null;
  signing: boolean;
  tasks: DocumentTask[];
}) {
  const signableTasks = activePositionAlreadySigned ? [] : myOpenTasks.filter((task) => taskAction(task) === "sign" || taskCan(task, "can_sign"));
  const primarySignTask = signableTasks[0] || null;
  const canShowSignAction = Boolean(primarySignTask || canSelfSign);
  const completedTaskCount = tasks.filter((task) => task.status === "completed").length;
  const measuredTaskCount = openTasks.length + completedTaskCount;
  const progressPercent = measuredTaskCount ? Math.round((completedTaskCount / measuredTaskCount) * 100) : 0;
  const primaryTask = activePositionAlreadySigned
    ? "This active position has already signed this document."
    : primarySignTask
    ? "This document is waiting for your signature."
    : myOpenTasks.length
      ? `Your request: ${requestActionLabel(taskAction(myOpenTasks[0]))}.`
      : documentStatus === "draft"
        ? "This draft is ready to edit or send."
        : openTasks.length
          ? `${openTasks.length} open request${openTasks.length === 1 ? "" : "s"} on this document.`
          : "No open requests on this document.";

  return (
    <aside className="space-y-4 xl:sticky xl:top-24">
      <PanelCard bodyClassName="space-y-4" title="Current task">
        <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
          <p className="text-sm leading-6 text-slate-700">{primaryTask}</p>
        </div>

        {canShowSignAction ? (
          <div className="space-y-3 rounded-lg border border-emerald-200 bg-emerald-50 p-3" id="signature-duty">
            <div>
              <p className="text-base font-bold text-emerald-950">Ready for your signature</p>
              {!signatureProfile ? (
                <p className="mt-1 text-sm leading-6 text-emerald-800">
                  <Link className="font-bold underline" to="/app/signature-profile">Enroll a signature profile</Link> before signing.
                </p>
              ) : null}
            </div>
            <div className="grid gap-2">
              <p className="text-sm font-bold text-emerald-900">
                {primarySignTask ? taskTargetLabel(primarySignTask) : "Your active position can sign this document."}
              </p>
              <Button
                disabled={!signatureProfile || signing}
                icon="signature"
                onClick={() => primarySignTask ? onSignTask(primarySignTask) : onOpenSelfSign()}
                variant="primary"
              >
                Place signature
              </Button>
            </div>
          </div>
        ) : null}

        <div className="rounded-lg border border-slate-200 p-3">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-sm font-bold text-slate-950">Open requests</p>
              <p className="mt-1 text-xs text-slate-500">{openTasks.length ? `${openTasks.length} active` : "No active requests"}</p>
            </div>
            {measuredTaskCount ? <span className="text-sm font-black text-[#061d49]">{progressPercent}%</span> : null}
          </div>
          {measuredTaskCount ? (
            <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-100">
              <div className="h-full rounded-full bg-[#061d49]" style={{ width: `${progressPercent}%` }} />
            </div>
          ) : null}
        </div>

        {openTasks.length ? (
          <div className="space-y-2">
            {openTasks.slice(0, 5).map((task) => {
              const mine = myOpenTasks.some((item) => item.id === task.id);
              const canApproveReview = taskCan(task, "can_review");
              const canCompleteManually = taskAction(task) !== "sign" && taskAction(task) !== "information" && !canApproveReview;
              const showTaskActions = mine && (
                canApproveReview
                || canCompleteManually
                || taskCan(task, "can_edit")
                || taskCan(task, "can_forward")
              );
              return (
                <div className={cx("rounded-lg border p-3", mine ? "border-[#061d49]/20 bg-[#061d49]/5" : "border-slate-200 bg-white")} key={task.id}>
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-bold text-slate-950">{taskTargetLabel(task)}</p>
                      <p className="mt-1 text-xs text-slate-500">{task.description || task.title}</p>
                    </div>
                    <StatusBadge tone={requestActionTone(taskAction(task))}>{requestActionLabel(taskAction(task))}</StatusBadge>
                  </div>
                  {showTaskActions ? (
                    <div className="mt-3 flex flex-wrap gap-2">
                      {taskCan(task, "can_edit") ? (
                        <Link to={`/app/documents/${documentId}/edit`}>
                          <Button icon="edit">Edit</Button>
                        </Link>
                      ) : null}
                      {taskCan(task, "can_forward") ? <Button icon="export" onClick={onOpenSend}>Forward</Button> : null}
                      {canApproveReview ? <Button icon="shield" onClick={() => onCompleteTask(task)} variant="primary">Approve review</Button> : null}
                      {canCompleteManually ? <Button onClick={() => onCompleteTask(task)}>Complete</Button> : null}
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
        ) : null}

        <div className="grid gap-2">
          {canSend ? <Button className="min-h-12 w-full" icon="export" onClick={onOpenSend} variant="primary">Send requests</Button> : null}
          {canEdit ? (
            <Link to={`/app/documents/${documentId}/edit`}>
              <Button className="min-h-12 w-full" icon="edit">Edit document</Button>
            </Link>
          ) : null}
          {canFinalize ? <Button className="min-h-12 w-full" icon="shield" onClick={onFinalize}>Finalize</Button> : null}
          {canArchive ? <Button className="min-h-12 w-full" icon="audit" onClick={onArchive} variant="danger">Archive</Button> : null}
          <div className="grid grid-cols-2 gap-2 text-sm">
            <div className="rounded-lg border border-slate-200 p-3">
              <p className="text-xs font-black uppercase tracking-wide text-slate-500">Serial</p>
              <p className="mt-1 truncate font-bold text-slate-950">{officialSerial || "Not assigned"}</p>
            </div>
            <div className="rounded-lg border border-slate-200 p-3">
              <p className="text-xs font-black uppercase tracking-wide text-slate-500">Status</p>
              <div className="mt-1"><StatusBadge>{documentStatus}</StatusBadge></div>
            </div>
          </div>
        </div>
      </PanelCard>
    </aside>
  );
}

export function DocumentDetailPage() {
  const params = useParams();
  const auth = useAuth();
  const documentId = Number(params.documentId);
  const [detail, setDetail] = useState<DocumentDetail | null>(null);
  const [reference, setReference] = useState<WorkspaceReference | null>(null);
  const [comments, setComments] = useState<JsonRecord[]>([]);
  const [signatureProfile, setSignatureProfile] = useState<SignatureProfile | null>(null);
  const [transmissions, setTransmissions] = useState<JsonRecord[]>([]);
  const [transmissionRecipientRows, setTransmissionRecipientRows] = useState<JsonRecord[]>([]);
  const [activeSupportTab, setActiveSupportTab] = useState<SupportTab>("dispatch");
  const [commentBody, setCommentBody] = useState("");
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [previewHtml, setPreviewHtml] = useState("");
  const [pdfActionBusy, setPdfActionBusy] = useState<"download" | "open" | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [previewUpdatedAt, setPreviewUpdatedAt] = useState<string | null>(null);
  const [sendWizardOpen, setSendWizardOpen] = useState(false);
  const [activityOpen, setActivityOpen] = useState(false);
  const [lifecycleBusy, setLifecycleBusy] = useState(false);
  const [signingTarget, setSigningTarget] = useState<SigningTarget | null>(null);
  const [completionTask, setCompletionTask] = useState<DocumentTask | null>(null);
  const [completionNote, setCompletionNote] = useState("");
  const [archiveModalOpen, setArchiveModalOpen] = useState(false);
  const [archiveReason, setArchiveReason] = useState("");
  const [notice, setNotice] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const informationSeenTaskIdsRef = useRef<Set<string>>(new Set());

  const documentRecord = detail?.document || null;
  const documentStatus = textField(documentRecord, "status", "draft");
  const documentTypeId = numberField(documentRecord, "document_type_id");
  const documentWritePermission = reference?.documentWritePermissions.find((permission) => permission.documentTypeId === documentTypeId) || null;
  const active = activeAssignment(auth);
  const isCreator = Boolean(active && numberField(documentRecord || {}, "creator_assignment_id") === active.id);
  const openTasks = useMemo(() => detail?.tasks.filter((task) => task.status === "open") || [], [detail]);
  const myOpenTasks = useMemo(() => openTasks.filter((task) => taskMatchesActiveAssignment(task, auth)), [auth, openTasks]);
  const activePositionAlreadySigned = useMemo(() => Boolean(active && detail?.signatureEvents.some((event) => (
    String(event.status || "completed") === "completed"
      && numberField(event, "signerPositionId") === active.positionId
  ))), [active, detail]);
  const assignedSignTasks = useMemo(() => myOpenTasks.filter((task) => taskAction(task) === "sign" || taskCan(task, "can_sign")), [myOpenTasks]);
  const editTask = myOpenTasks.find((task) => taskCan(task, "can_edit")) || null;
  const finalTerminalStatus = ["archived", "closed", "finalized", "serial_assigned"].includes(documentStatus);
  const closedOrArchived = ["archived", "closed"].includes(documentStatus);
  const canEdit = Boolean(!finalTerminalStatus && (auth.isAdmin || editTask || (isCreator && documentStatus === "draft" && documentWritePermission)));
  const canSend = Boolean(!closedOrArchived && (auth.isAdmin || isCreator || myOpenTasks.some((task) => taskCan(task, "can_forward")) || (documentStatus === "draft" && documentWritePermission)));
  const canFinalize = Boolean(!finalTerminalStatus && (auth.isAdmin || isCreator || myOpenTasks.some((task) => taskCan(task, "can_finalize"))));
  const canArchive = Boolean(!closedOrArchived && (auth.isAdmin || isCreator || myOpenTasks.some((task) => taskCan(task, "can_archive"))));
  const canSelfSign = Boolean(!activePositionAlreadySigned && !assignedSignTasks.length && !finalTerminalStatus && active && (auth.isAdmin || booleanValue(active.isSigningAuthority)));
  const officialSerial = textField(documentRecord, "official_serial", "") || textField(documentRecord, "officialSerial", "");
  const latestVersion = detail?.versions[0] || null;
  const expectedDocumentHash = typeof documentRecord?.current_content_hash === "string" ? documentRecord.current_content_hash : undefined;
  const expectedDocumentVersion = Number(documentRecord?.current_version_number || latestVersion?.version_number || 0) || undefined;

  async function renderOfficialHtmlPreview() {
    setPreviewLoading(true);
    setPreviewError(null);
    try {
      const rendered = await templateApi.render(documentId, {
        locale: "all",
        output: "html",
        variant: "official"
      });
      if (!rendered.html) {
        setPreviewHtml("");
        setPreviewError("No official template is available for this document type.");
        return;
      }
      setPreviewHtml(rendered.html);
      setPreviewUpdatedAt(new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }));
    } catch (caught) {
      setPreviewHtml("");
      setPreviewError(caught instanceof Error ? caught.message : "Could not render official preview.");
    } finally {
      setPreviewLoading(false);
    }
  }

  async function renderOfficialPdf(action: "download" | "open") {
    const pdfWindow = action === "open" ? window.open("about:blank", "_blank") : null;
    if (pdfWindow) {
      pdfWindow.opener = null;
    }
    setPdfActionBusy(action);
    setError(null);
    try {
      const rendered = await templateApi.renderPdf(documentId, {
        download: action === "download",
        locale: "all",
        variant: "official"
      });
      if (action === "download") {
        downloadBlob(rendered.blob, rendered.filename || `document-${documentId}.pdf`);
      } else {
        openBlobInNewWindow(rendered.blob, pdfWindow);
      }
    } catch (caught) {
      pdfWindow?.close();
      setError(caught instanceof Error ? caught.message : "Could not prepare official PDF.");
    } finally {
      setPdfActionBusy(null);
    }
  }

  async function openOfficialPdf() {
    await renderOfficialPdf("open");
  }

  async function downloadOfficialPdf() {
    await renderOfficialPdf("download");
  }

  async function load(_options?: { regeneratePreview?: boolean }) {
    setLoading(true);
    setError(null);
    try {
      const [detailResult, commentsResult, profileResult, referenceResult, transmissionResult] = await Promise.all([
        documentApi.get(documentId),
        collaborationApi.listComments(documentId).catch(() => []),
        signatureApi.getProfile().catch(() => null),
        workspaceApi.reference().catch(() => null),
        transmissionApi.listForDocument(documentId).catch(() => ({ transmissions: [], recipients: [] }))
      ]);

      setDetail(detailResult);
      setComments(commentsResult);
      setSignatureProfile(profileResult);
      setReference(referenceResult);
      setTransmissions(transmissionResult.transmissions);
      setTransmissionRecipientRows(transmissionResult.recipients);
      await renderOfficialHtmlPreview();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not load document.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (documentId) {
      void load();
    }
  }, [documentId]);

  useEffect(() => {
    if (!documentId) {
      return undefined;
    }
    const informationTasks = myOpenTasks.filter((task) => taskAction(task) === "information");
    const pendingTasks = informationTasks.filter((task) => {
      const key = String(task.id);
      if (informationSeenTaskIdsRef.current.has(key)) {
        return false;
      }
      informationSeenTaskIdsRef.current.add(key);
      return true;
    });
    if (!pendingTasks.length) {
      return undefined;
    }

    let alive = true;
    void Promise.all(pendingTasks.map((task) => (
      documentApi.markTaskSeen(documentId, task.id).catch((caught) => {
        informationSeenTaskIdsRef.current.delete(String(task.id));
        throw caught;
      })
    )))
      .then(() => {
        if (alive) {
          void load();
        }
      })
      .catch((caught) => {
        if (alive) {
          setError(caught instanceof Error ? caught.message : "Could not mark information request as seen.");
        }
      });

    return () => {
      alive = false;
    };
  }, [documentId, myOpenTasks]);

  function recipientsForTransmission(transmissionId: EntityId) {
    return transmissionRecipientRows.filter((recipient) => numberField(recipient, "transmission_id") === transmissionId);
  }

  function openFullscreenPreview() {
    if (previewHtml) {
      setPreviewOpen(true);
    }
  }

  async function addComment() {
    if (!commentBody.trim()) {
      return;
    }
    await collaborationApi.createComment(documentId, { body: commentBody.trim() });
    setCommentBody("");
    setComments(await collaborationApi.listComments(documentId));
  }

  async function uploadAttachment() {
    if (!uploadFile) {
      return;
    }
    await documentApi.uploadAttachment(documentId, { file: uploadFile });
    setUploadFile(null);
    await load();
  }

  async function finishSigning() {
    setSigningTarget(null);
    setNotice("Document signed.");
    await load({ regeneratePreview: true });
  }

  async function completeTask(task: DocumentTask, note: string, options: { openSendAfterComplete?: boolean } = {}) {
    const responseNote = note.trim();
    if (taskRequiresComment(task) && !responseNote) {
      setError("Enter the required response comment before completing this request.");
      return;
    }
    if (responseNote.length > endorsementCommentMaxLength) {
      setError(`Response comment must be ${endorsementCommentMaxLength} characters or fewer.`);
      return;
    }
    setLifecycleBusy(true);
    setError(null);
    try {
      await documentApi.completeTask(documentId, task.id, responseNote || null);
      setNotice(taskCan(task, "can_review") ? "Review approved." : "Request completed.");
      setCompletionTask(null);
      setCompletionNote("");
      await load();
      if (options.openSendAfterComplete) {
        setSendWizardOpen(true);
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not complete the request.");
    } finally {
      setLifecycleBusy(false);
    }
  }

  async function finalizeDocument() {
    setLifecycleBusy(true);
    setError(null);
    try {
      await documentApi.finalize(documentId);
      setNotice("Document finalized and official serial assigned.");
      await load({ regeneratePreview: true });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not finalize the document.");
    } finally {
      setLifecycleBusy(false);
    }
  }

  async function archiveDocument(reason: string) {
    setLifecycleBusy(true);
    setError(null);
    try {
      await documentApi.archive(documentId, { reason: reason.trim() || "Archived." });
      setNotice("Document archived.");
      setArchiveModalOpen(false);
      setArchiveReason("");
      await load({ regeneratePreview: true });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not archive the document.");
    } finally {
      setLifecycleBusy(false);
    }
  }

  function renderDispatchPanel() {
    return (
      <div className="space-y-4">
        <p className="text-sm text-slate-500">Official transmissions and dispatch records created from the Send flow appear here.</p>
        {transmissions.length ? transmissions.map((transmission) => {
          const transmissionId = numberField(transmission, "id");
          const recipients = recipientsForTransmission(transmissionId);
          return (
            <div className="rounded-lg border border-slate-200 p-3" key={transmissionId}>
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate text-sm font-bold text-slate-950">{statusLabel(textField(transmission, "transmission_type", "transmission"))}</p>
                  <p className="mt-1 text-xs text-slate-500">
                    {formatDateTime(textField(transmission, "sent_at", ""))} - {statusLabel(textField(transmission, "visibility_policy", "show_all"))}
                  </p>
                </div>
                <StatusBadge>{textField(transmission, "status", "sent")}</StatusBadge>
              </div>
              {textField(transmission, "message", "") ? (
                <p className="mt-2 whitespace-pre-wrap text-sm text-slate-600">{textField(transmission, "message", "")}</p>
              ) : null}
              <div className="mt-3 flex flex-wrap gap-2">
                {recipients.map((recipient) => (
                  <span className="inline-flex max-w-full items-center gap-2 rounded-md border border-slate-200 bg-slate-50 px-2 py-1 text-xs text-slate-700" key={numberField(recipient, "id")}>
                    <span className="min-w-0 truncate">{transmissionRecipientLabel(recipient)}</span>
                    <span className="shrink-0 font-semibold text-slate-500">{statusLabel(textField(recipient, "status", "sent"))}</span>
                  </span>
                ))}
              </div>
            </div>
          );
        }) : (
          <p className="text-sm text-slate-500">No transmissions.</p>
        )}
      </div>
    );
  }

  function renderAttachmentsPanel() {
    return (
      <div className="space-y-3">
        <label className="flex min-h-20 cursor-pointer flex-col items-center justify-center rounded-lg border border-dashed border-slate-300 bg-slate-50 px-3 py-4 text-center text-sm font-semibold text-[#061d49] transition hover:bg-white">
          <Icon className="mb-2 h-5 w-5" name="upload" />
          {uploadFile ? uploadFile.name : "Choose file"}
          <input className="sr-only" onChange={(event) => setUploadFile(event.target.files?.[0] || null)} type="file" />
        </label>
        <Button disabled={!uploadFile} onClick={() => void uploadAttachment()}>Upload attachment</Button>
        <div className="space-y-2">
          {detail?.attachments.length ? detail.attachments.map((attachment) => (
            <div className="rounded-lg border border-slate-200 p-3 text-sm" key={String(attachment.id)}>
              <p className="font-bold text-slate-900">{textField(attachment, "title", textField(attachment, "originalFilename", "Attachment"))}</p>
              <p className="mt-1 text-xs text-slate-500">{textField(attachment, "mimeType")} - {fileSizeLabel(attachment.byteSize)}</p>
            </div>
          )) : <p className="text-sm text-slate-500">No attachments.</p>}
        </div>
      </div>
    );
  }

  function renderCommentsPanel() {
    return (
      <div className="space-y-3">
        <textarea className="min-h-24 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-[#061d49] focus:ring-4 focus:ring-[#061d49]/10" onChange={(event) => setCommentBody(event.target.value)} placeholder="Write a comment..." value={commentBody} />
        <Button disabled={!commentBody.trim()} onClick={() => void addComment()} variant="primary">Add comment</Button>
        <div className="space-y-2">
          {comments.length ? comments.map((comment) => (
            <div className="rounded-lg bg-slate-50 p-3 text-sm" key={String(comment.id)}>
              <p className="whitespace-pre-wrap text-slate-700">{textField(comment, "body")}</p>
              <p className="mt-2 text-xs text-slate-400">{formatDateTime(textField(comment, "created_at", ""))}</p>
            </div>
          )) : <p className="text-sm text-slate-500">No comments yet.</p>}
        </div>
      </div>
    );
  }

  function renderHistoryPanel() {
    return (
      <DataTable
        columns={[
          { key: "action", header: "Action", cell: (row) => textField(row as JsonRecord, "action") },
          { key: "status", header: "Status", cell: (row) => `${textField(row as JsonRecord, "from_status", "-")} -> ${textField(row as JsonRecord, "to_status", "-")}` },
          { key: "note", header: "Note", hideOnMobile: true, cell: (row) => textField(row as JsonRecord, "note") },
          { key: "created", header: "Created", hideOnMobile: true, cell: (row) => formatDateTime(textField(row as JsonRecord, "created_at", "")) }
        ]}
        emptyLabel="No workflow events."
        getRowKey={(row) => numberField(row as JsonRecord, "id")}
        rows={detail?.workflowEvents || []}
      />
    );
  }

  function renderSupportTab() {
    if (activeSupportTab === "dispatch") {
      return renderDispatchPanel();
    }
    if (activeSupportTab === "attachments") {
      return renderAttachmentsPanel();
    }
    if (activeSupportTab === "comments") {
      return renderCommentsPanel();
    }
    return renderHistoryPanel();
  }

  if (loading) {
    return <div className="p-8 text-sm text-slate-600">Loading document...</div>;
  }

  if (error && !detail) {
    return <div className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>;
  }

  if (!detail || !documentRecord) {
    return null;
  }

  const subject = textField(documentRecord, "subject", "Untitled document");
  const primaryAction = documentStatus === "draft" && canEdit
      ? null
      : canSend
        ? { label: "Send requests", action: () => setSendWizardOpen(true) }
        : null;

  return (
    <section className="mx-auto max-w-[108rem] space-y-4">
      <div className="sticky top-0 z-20 rounded-lg border border-slate-200/80 bg-white px-4 py-3 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <Link className="text-sm font-bold text-[#061d49] hover:underline" to="/app/documents">Back to registry</Link>
            <div className="mt-1 flex min-w-0 flex-wrap items-center gap-2">
              <h1 className="truncate text-2xl font-bold text-slate-950">{subject}</h1>
              <StatusBadge>{documentStatus}</StatusBadge>
            </div>
            <p className="mt-1 text-sm text-slate-500">
              {textField(documentRecord, "internal_reference")} - {textField(documentRecord, "documentTypeName")} - {textField(documentRecord, "currentHolderUnitName")}
            </p>
          </div>
          <div className="flex flex-wrap items-center justify-end gap-2">
            {documentStatus === "draft" && canEdit ? (
              <Link to={`/app/documents/${documentId}/edit`}>
                <Button className="min-h-12" icon="edit" variant="primary">Edit document</Button>
              </Link>
            ) : primaryAction ? (
              <Button className="min-h-12" icon="export" onClick={primaryAction.action} variant="primary">{primaryAction.label}</Button>
            ) : null}
          </div>
        </div>
      </div>

      {error ? <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">{error}</div> : null}
      {notice ? <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-800">{notice}</div> : null}

      {previewOpen && previewHtml ? (
        <FullscreenDocumentPreview
          html={previewHtml}
          onClose={() => setPreviewOpen(false)}
          subtitle="Official preview"
          title={subject}
        />
      ) : null}

      {signingTarget ? (
        <SigningModal
          documentId={documentId}
          expectedDocumentHash={expectedDocumentHash}
          expectedDocumentVersion={expectedDocumentVersion}
          onClose={() => setSigningTarget(null)}
          onSigned={finishSigning}
          previewHtml={previewHtml}
          signatureProfile={signatureProfile}
          subject={subject}
          target={signingTarget}
        />
      ) : null}

      {sendWizardOpen ? (
        <SendRequestsBuilder
          documentId={documentId}
          documentSubject={subject}
          onClose={() => setSendWizardOpen(false)}
          onSent={(message) => {
            setNotice(message);
            setSendWizardOpen(false);
            void load({ regeneratePreview: true });
          }}
        />
      ) : null}

      {completionTask ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/55 p-4">
          <form
            className="w-full max-w-lg rounded-xl bg-white shadow-2xl"
            onSubmit={(event) => {
              event.preventDefault();
              void completeTask(completionTask, completionNote, {
                openSendAfterComplete: taskCan(completionTask, "can_review") && taskCan(completionTask, "can_forward")
              });
            }}
          >
            <header className="border-b border-slate-200 px-5 py-4">
              <h2 className="text-lg font-black text-slate-950">{taskCan(completionTask, "can_review") ? "Approve review" : "Complete request"}</h2>
              <p className="mt-1 text-sm text-slate-500">{taskTargetLabel(completionTask)}</p>
            </header>
            <div className="p-5">
              <label className="block text-sm font-bold text-slate-700">
                Completion comment {taskRequiresComment(completionTask) ? <span className="text-red-700">*</span> : null}
                <textarea className="mt-2 min-h-28 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-[#061d49] focus:ring-4 focus:ring-[#061d49]/10" maxLength={endorsementCommentMaxLength} onChange={(event) => setCompletionNote(event.target.value)} value={completionNote} />
                <span className="mt-1 block text-xs text-slate-500">{completionNote.length}/{endorsementCommentMaxLength}</span>
              </label>
            </div>
            <footer className="flex flex-wrap justify-end gap-2 border-t border-slate-200 px-5 py-4">
              <Button disabled={lifecycleBusy} onClick={() => setCompletionTask(null)}>Cancel</Button>
              <Button disabled={lifecycleBusy} type="submit" variant="primary">{lifecycleBusy ? "Saving..." : taskCan(completionTask, "can_review") ? "Approve" : "Complete"}</Button>
            </footer>
          </form>
        </div>
      ) : null}

      {archiveModalOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/55 p-4">
          <form
            className="w-full max-w-lg rounded-xl bg-white shadow-2xl"
            onSubmit={(event) => {
              event.preventDefault();
              void archiveDocument(archiveReason);
            }}
          >
            <header className="border-b border-slate-200 px-5 py-4">
              <h2 className="text-lg font-black text-slate-950">Archive document</h2>
              <p className="mt-1 text-sm text-slate-500">{subject}</p>
            </header>
            <div className="p-5">
              <label className="block text-sm font-bold text-slate-700">
                Archive reason
                <textarea className="mt-2 min-h-28 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-[#061d49] focus:ring-4 focus:ring-[#061d49]/10" onChange={(event) => setArchiveReason(event.target.value)} value={archiveReason} />
              </label>
              {!officialSerial ? (
                <p className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm font-semibold text-amber-800">
                  Archiving will assign the official serial before the document is stored.
                </p>
              ) : null}
            </div>
            <footer className="flex flex-wrap justify-end gap-2 border-t border-slate-200 px-5 py-4">
              <Button disabled={lifecycleBusy} onClick={() => setArchiveModalOpen(false)}>Cancel</Button>
              <Button disabled={lifecycleBusy} type="submit" variant="danger">{lifecycleBusy ? "Archiving..." : "Archive"}</Button>
            </footer>
          </form>
        </div>
      ) : null}

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_24rem] xl:items-start">
        <main className="min-w-0">
          <OfficialDocumentPreview
            html={previewHtml}
            onDownloadPdf={() => void downloadOfficialPdf()}
            onFullscreen={openFullscreenPreview}
            onOpenPdf={() => void openOfficialPdf()}
            onRefresh={() => void renderOfficialHtmlPreview()}
            pdfActionBusy={pdfActionBusy}
            previewError={previewError}
            previewLoading={previewLoading}
            previewUpdatedAt={previewUpdatedAt}
          />
        </main>

        <DocumentActionPanel
          canArchive={canArchive && !lifecycleBusy}
          canEdit={canEdit}
          canFinalize={canFinalize && !lifecycleBusy}
          canSend={canSend}
          canSelfSign={canSelfSign}
          activePositionAlreadySigned={activePositionAlreadySigned}
          documentId={documentId}
          documentStatus={documentStatus}
          myOpenTasks={myOpenTasks}
          officialSerial={officialSerial}
          onArchive={() => setArchiveModalOpen(true)}
          onCompleteTask={(task) => {
            setCompletionNote("");
            setCompletionTask(task);
          }}
          onFinalize={() => void finalizeDocument()}
          onOpenSend={() => setSendWizardOpen(true)}
          onOpenSelfSign={() => setSigningTarget({ type: "self" })}
          onSignTask={(task) => setSigningTarget({ task, type: "task" })}
          openTasks={openTasks}
          signatureProfile={signatureProfile}
          signing={Boolean(signingTarget)}
          tasks={detail.tasks}
        />
      </div>

      <PanelCard
        actions={<Button icon={activityOpen ? "chevronDown" : "activity"} onClick={() => setActivityOpen((current) => !current)}>{activityOpen ? "Hide" : "Open"}</Button>}
        bodyClassName={activityOpen ? "space-y-4" : "hidden"}
        title="Document activity"
      >
        <div className="flex flex-wrap gap-1 rounded-lg bg-slate-100 p-1">
          {supportTabs.map((tab) => (
            <button
              className={cx(
                "rounded-md px-3 py-2 text-sm font-bold transition",
                activeSupportTab === tab.id ? "bg-white text-[#061d49] shadow-sm" : "text-slate-600 hover:bg-white/70"
              )}
              key={tab.id}
              onClick={() => setActiveSupportTab(tab.id)}
              type="button"
            >
              {tab.label}
            </button>
          ))}
        </div>
        {renderSupportTab()}
      </PanelCard>
    </section>
  );
}
