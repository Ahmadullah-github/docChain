import { useEffect, useState } from "react";
import { templateApi } from "../../../api";
import type { DocumentTemplateBinding, DocumentTemplateVersion, EntityId } from "../../../api";
import { useAuth } from "../../../app/AuthContext";
import { Button, DataTable, PanelCard, StatusBadge } from "../../../components/ui";

async function safe<T>(promise: Promise<T>, fallback: T) {
  try {
    return await promise;
  } catch {
    return fallback;
  }
}

export function AdminTemplateAdminPage() {
  const auth = useAuth();
  const [reviewQueue, setReviewQueue] = useState<DocumentTemplateVersion[]>([]);
  const [bindings, setBindings] = useState<DocumentTemplateBinding[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function refresh() {
    if (!auth.isAdmin) {
      return;
    }
    setError(null);
    const [queueRows, bindingRows] = await Promise.all([
      safe(templateApi.admin.reviewQueue(), [] as DocumentTemplateVersion[]),
      safe(templateApi.admin.listBindings(), [] as DocumentTemplateBinding[])
    ]);
    setReviewQueue(queueRows);
    setBindings(bindingRows);
  }

  useEffect(() => {
    void refresh();
  }, [auth.isAdmin]);

  async function approveVersion(version: DocumentTemplateVersion) {
    setBusy(true);
    setError(null);
    try {
      await templateApi.admin.approve(version.template_id, version.id);
      await refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not approve template.");
    } finally {
      setBusy(false);
    }
  }

  async function rejectVersion(version: DocumentTemplateVersion) {
    const note = window.prompt("Reason for rejection");
    if (!note) {
      return;
    }

    setBusy(true);
    setError(null);
    try {
      await templateApi.admin.reject(version.template_id, version.id, note);
      await refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not reject template.");
    } finally {
      setBusy(false);
    }
  }

  async function updateBindingStatus(bindingId: EntityId, status: "active" | "inactive") {
    setBusy(true);
    setError(null);
    try {
      await templateApi.admin.updateBindingStatus(bindingId, status);
      await refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not update binding.");
    } finally {
      setBusy(false);
    }
  }

  if (!auth.isAdmin) {
    return (
      <PanelCard title="Admin Queues">
        <p className="text-sm text-slate-600">Only administrators can manage template review queues and bindings.</p>
      </PanelCard>
    );
  }

  return (
    <div className="space-y-4">
      {error ? <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">{error}</div> : null}

      <PanelCard title="Approval Queue">
        <DataTable
          columns={[
            { key: "template", header: "Template", cell: (row) => row.templateName || `Template #${row.template_id}` },
            { key: "version", header: "Version", cell: (row) => `v${row.version_number}` },
            { key: "status", header: "Status", cell: (row) => <StatusBadge>{row.status}</StatusBadge> },
            {
              key: "actions",
              header: "Actions",
              cell: (row) => (
                <div className="flex gap-2">
                  <Button className="min-h-8 px-2 py-1 text-xs" disabled={busy} onClick={() => void approveVersion(row)} variant="primary">Approve</Button>
                  <Button className="min-h-8 px-2 py-1 text-xs" disabled={busy} onClick={() => void rejectVersion(row)} variant="danger">Reject</Button>
                </div>
              )
            }
          ]}
          emptyLabel="No submitted templates."
          getRowKey={(row) => row.id}
          rows={reviewQueue}
        />
      </PanelCard>

      <PanelCard title="Active Bindings">
        <DataTable
          columns={[
            { key: "type", header: "Document Type", cell: (row) => row.documentTypeName || "All" },
            { key: "locale", header: "Locale", cell: (row) => row.locale },
            { key: "variant", header: "Variant", cell: (row) => row.variant },
            { key: "template", header: "Template", cell: (row) => row.templateName || row.template_id },
            { key: "status", header: "Status", cell: (row) => <StatusBadge>{row.status}</StatusBadge> },
            {
              key: "actions",
              header: "Actions",
              cell: (row) => (
                <Button
                  className="min-h-8 px-2 py-1 text-xs"
                  disabled={busy}
                  onClick={() => void updateBindingStatus(row.id, row.status === "active" ? "inactive" : "active")}
                >
                  {row.status === "active" ? "Deactivate" : "Activate"}
                </Button>
              )
            }
          ]}
          emptyLabel="No template bindings configured."
          getRowKey={(row) => row.id}
          rows={bindings}
        />
      </PanelCard>
    </div>
  );
}
