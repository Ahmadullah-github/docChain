import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { workspaceApi } from "../../api";
import type { WorkItemTypeFilter, WorkspaceSummary, WorkspaceWorkItem } from "../../api";
import { Button, DataTable, MetricCard, PanelCard, StatusBadge } from "../../components/ui";
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
    booleanValue(item.canEdit) ? "Edit" : "",
    booleanValue(item.canSign) ? "Sign" : "",
    booleanValue(item.canForward) ? "Forward" : "",
    booleanValue(item.canFinalize) ? "Finalize" : "",
    booleanValue(item.canArchive) ? "Archive" : ""
  ].filter(Boolean);
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
          <div className="py-10 text-center text-sm text-slate-500">Loading work items...</div>
        ) : error ? (
          <div className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
        ) : (
          <DataTable
            columns={[
              {
                key: "item",
                header: "Item",
                cell: (item) => (
                  <div className="min-w-0">
                    <Link className="block truncate font-bold text-slate-950 hover:underline" to={item.documentId ? `/app/documents/${item.documentId}` : "/app/work"}>
                      {itemTitle(item)}
                    </Link>
                    <p className="mt-0.5 truncate text-xs text-slate-500">
                      {item.documentTypeName || item.itemType.replaceAll("_", " ")} · {item.holderUnitName || "Workspace"}
                    </p>
                    {permissionLabels(item).length ? (
                      <div className="mt-2 flex flex-wrap gap-1">
                        {permissionLabels(item).map((permission) => (
                          <span className="rounded-md bg-slate-100 px-2 py-0.5 text-[11px] font-bold text-slate-600" key={permission}>{permission}</span>
                        ))}
                      </div>
                    ) : null}
                  </div>
                )
              },
              {
                key: "request",
                header: "Request",
                cell: (item) => item.requiredAction ? <StatusBadge tone={requestActionTone(item.requiredAction)}>{requestActionLabel(item.requiredAction)}</StatusBadge> : item.status ? <StatusBadge>{item.status}</StatusBadge> : "-"
              },
              {
                key: "priority",
                header: "Priority",
                hideOnMobile: true,
                cell: (item) => item.priorityName || "-"
              },
              {
                key: "due",
                header: "Due",
                hideOnMobile: true,
                cell: (item) => item.dueAt ? formatDateTime(item.dueAt) : "-"
              },
              {
                key: "updated",
                header: "Updated",
                hideOnMobile: true,
                cell: (item) => formatDateTime(item.createdAt)
              }
            ]}
            emptyLabel="No work items found for this tab."
            getRowKey={(item) => `${item.itemType}-${item.id}`}
            rows={items}
          />
        )}
      </PanelCard>
    </section>
  );
}
