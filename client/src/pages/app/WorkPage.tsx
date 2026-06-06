import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { workspaceApi } from "../../api";
import type { WorkItemTypeFilter, WorkspaceSummary, WorkspaceWorkItem } from "../../api";
import { DocumentThumbnail, DocumentWorkflowRoute } from "../../components/app";
import { Button, MetricCard, PanelCard, StatusBadge } from "../../components/ui";
import { formatDateTime } from "./appPageUtils";

type WorkTab = {
  filter: WorkItemTypeFilter;
  label: string;
};

const tabs: WorkTab[] = [
  { filter: "all", label: "All work" },
  { filter: "tasks", label: "My tasks" },
  { filter: "unit", label: "Unit queue" },
  { filter: "signatures", label: "Signatures" },
  { filter: "activity", label: "Activity" }
];

function itemTitle(item: WorkspaceWorkItem) {
  if (item.itemType === "signature") {
    return `${item.documentSubject || "Document"} · ${item.title}`;
  }
  if (item.itemType === "task") {
    return item.documentSubject ? `${item.documentSubject} · ${item.title}` : item.title;
  }
  if (item.itemType === "unit_document") {
    return item.documentSubject ? `${item.documentSubject} · ${item.title}` : item.title;
  }
  return item.title;
}

function booleanValue(value: unknown) {
  return value === true || value === 1 || value === "1" || value === "true";
}

function requestActionLabel(action?: string | null) {
  if (!action) {
    return "Request";
  }
  if (action === "information") {
    return "Information";
  }
  return action.replaceAll("_", " ").replace(/\b\w/g, (match) => match.toUpperCase());
}

function requestActionTone(action?: string | null): "green" | "amber" | "red" | "blue" | "slate" {
  if (action === "sign") return "green";
  if (action === "edit") return "amber";
  if (action === "forward") return "blue";
  return "slate";
}

function permissionLabels(item: WorkspaceWorkItem) {
  return [
    booleanValue(item.canReview) ? "Review" : "",
    booleanValue(item.canEdit) ? "Edit" : "",
    booleanValue(item.canSign) ? "Sign" : "",
    booleanValue(item.canForward) ? "Forward" : "",
    booleanValue(item.canFinalize) ? "Finalize" : "",
    booleanValue(item.canArchive) ? "Archive" : ""
  ].filter(Boolean);
}

function LoadingWorkCards() {
  return (
    <div className="space-y-3">
      {Array.from({ length: 4 }).map((_, index) => (
        <div className="grid animate-pulse gap-4 rounded-lg border border-slate-200 bg-white p-3 md:grid-cols-[6rem_minmax(0,1fr)_auto]" key={index}>
          <span className="aspect-[210/297] rounded-md bg-slate-100" />
          <span className="space-y-3 py-1">
            <span className="block h-5 w-1/2 rounded bg-slate-100" />
            <span className="block h-3 w-3/4 rounded bg-slate-100" />
            <span className="block h-8 w-full rounded bg-slate-100" />
          </span>
          <span className="hidden h-10 w-24 rounded bg-slate-100 md:block" />
        </div>
      ))}
    </div>
  );
}

function WorkItemCard({ item }: { item: WorkspaceWorkItem }) {
  const summary = item.workflowSummary || null;
  const href = item.documentId ? `/app/documents/${item.documentId}` : "/app/work";
  const action = item.requiredAction || summary?.activeAction || null;

  return (
    <article className="rounded-lg border border-slate-200 bg-white p-3 shadow-[0_1px_2px_rgba(15,23,42,0.06)]">
      <div className="grid gap-4 md:grid-cols-[6rem_minmax(0,1fr)_auto]">
        <Link className="block w-24 max-w-full md:w-auto" to={href}>
          <DocumentThumbnail subject={item.documentSubject || item.title} thumbnailUrl={summary?.thumbnailUrl} />
        </Link>
        <div className="min-w-0">
          <div className="flex min-w-0 flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <Link className="block truncate text-base font-black text-slate-950 hover:underline" to={href}>
                {itemTitle(item)}
              </Link>
              <p className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-sm text-slate-500">
                <span>{item.documentTypeName || item.itemType.replaceAll("_", " ")}</span>
                <span className="force-ltr">{item.officialSerial || item.internalReference || ""}</span>
              </p>
            </div>
            {action ? <StatusBadge tone={requestActionTone(action)}>{requestActionLabel(action)}</StatusBadge> : item.status ? <StatusBadge>{item.status}</StatusBadge> : null}
          </div>

          {permissionLabels(item).length ? (
            <div className="mt-3 flex flex-wrap gap-1">
              {permissionLabels(item).map((permission) => (
                <span className="rounded-md bg-slate-100 px-2 py-0.5 text-[11px] font-bold text-slate-600" key={permission}>{permission}</span>
              ))}
            </div>
          ) : null}

          <div className="mt-3 grid gap-3 text-sm sm:grid-cols-2 xl:grid-cols-4">
            <div className="min-w-0">
              <p className="text-xs font-bold text-slate-400">Holder</p>
              <p className="mt-1 truncate font-semibold text-slate-800">{item.holderUnitName || "Workspace"}</p>
            </div>
            <div className="min-w-0">
              <p className="text-xs font-bold text-slate-400">Priority</p>
              <p className="mt-1 truncate font-semibold text-slate-800">{item.priorityName || "-"}</p>
            </div>
            <div className="min-w-0">
              <p className="text-xs font-bold text-slate-400">Due</p>
              <p className="mt-1 truncate font-semibold text-slate-800">{item.dueAt ? formatDateTime(item.dueAt) : "-"}</p>
            </div>
            <div className="min-w-0">
              <p className="text-xs font-bold text-slate-400">Updated</p>
              <p className="mt-1 truncate font-semibold text-slate-800">{formatDateTime(item.createdAt)}</p>
            </div>
          </div>

          <div className="mt-4 border-t border-slate-200 pt-3">
            <DocumentWorkflowRoute summary={summary} />
          </div>
        </div>
        <div className="flex items-start justify-end">
          <Link to={href}>
            <Button icon="view">Open</Button>
          </Link>
        </div>
      </div>
    </article>
  );
}

export function WorkPage() {
  const [summary, setSummary] = useState<WorkspaceSummary | null>(null);
  const [items, setItems] = useState<WorkspaceWorkItem[]>([]);
  const [tab, setTab] = useState<WorkItemTypeFilter>("all");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    setError(null);
    Promise.all([
      workspaceApi.summary().then(setSummary),
      workspaceApi.workItems({ limit: 40, type: tab }).then(setItems)
    ])
      .catch(() => setError("Workspace is temporarily unavailable."))
      .finally(() => setLoading(false));
  }, [tab]);

  const metrics = useMemo(() => [
    { icon: "audit" as const, label: "My tasks", value: summary?.myTasks || 0 },
    { icon: "document" as const, label: "Unit queue", value: summary?.unitQueue || 0 },
    { icon: "signature" as const, label: "Signatures", value: summary?.signatureQueue || 0 },
    { icon: "bell" as const, label: "Unread", value: summary?.unreadNotifications || 0 }
  ], [summary]);

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-sm font-bold uppercase tracking-wide text-[#0b5c74]">Staff workspace</p>
          <h1 className="mt-1 text-2xl font-bold text-slate-950">Work inbox</h1>
          <p className="mt-1 max-w-2xl text-sm leading-6 text-slate-600">
            Documents, tasks, signatures, and recent movement for the active assignment.
          </p>
        </div>
        <Link to="/app/documents/new">
          <Button icon="plus" variant="primary">New document</Button>
        </Link>
      </div>

      <div className="grid gap-3 md:grid-cols-4">
        {metrics.map((metric) => (
          <MetricCard icon={metric.icon} key={metric.label} label={metric.label} value={metric.value} />
        ))}
      </div>

      <PanelCard
        bodyClassName="space-y-4"
        title="Inbox"
        actions={(
          <div className="flex flex-wrap gap-1 rounded-lg bg-slate-100 p-1">
            {tabs.map((item) => (
              <button
                className={`rounded-md px-3 py-1.5 text-sm font-semibold transition ${tab === item.filter ? "bg-white text-[#061d49] shadow-sm" : "text-slate-600 hover:bg-white/70"}`}
                key={item.filter}
                onClick={() => setTab(item.filter)}
                type="button"
              >
                {item.label}
              </button>
            ))}
          </div>
        )}
      >
        {loading ? (
          <LoadingWorkCards />
        ) : error ? (
          <div className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
        ) : !items.length ? (
          <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 px-4 py-8 text-center text-sm text-slate-500">No work items found for this tab.</div>
        ) : (
          <div className="space-y-3">
            {items.map((item) => <WorkItemCard item={item} key={`${item.itemType}-${item.id}`} />)}
          </div>
        )}
      </PanelCard>
    </section>
  );
}
