import { useEffect, useMemo, useState } from "react";
import type { FormEvent, ReactNode } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { documentApi, savedSearchApi, templateApi, workspaceApi } from "../../api";
import type { DocumentListItem, DocumentRegistrySort, DocumentRegistryStats, DocumentScope, JsonRecord, WorkspaceReference } from "../../api";
import { AdminModal } from "../../components/admin";
import { DocumentThumbnail, DocumentWorkflowRoute } from "../../components/app";
import { Button, Icon, IconButton, SearchInput, SelectFilter, StatusBadge, Toolbar } from "../../components/ui";
import type { IconName } from "../../components/ui";
import { downloadBlob, openBlobInNewWindow } from "../../lib/downloads";
import { formatDateTime } from "./appPageUtils";

type ScopeOption = {
  description: string;
  icon: IconName;
  label: string;
  value: DocumentScope;
};

type RegistryTile = {
  description: string;
  icon: IconName;
  label: string;
  scope?: DocumentScope;
  status?: string;
  value: string;
};

type ActiveFilterChip = {
  label: string;
  onRemove: () => void;
};

const numberFormatter = new Intl.NumberFormat("en-US");
const statusOptions = ["", "draft", "under_edit", "under_review", "under_action", "pending_signatures", "partially_signed", "finalized", "serial_assigned", "dispatched", "closed", "archived"];

const scopeOptions: ScopeOption[] = [
  { description: "Everything you can open", icon: "document", label: "All accessible", value: "accessible" },
  { description: "Held by this unit", icon: "briefcase", label: "Current holder", value: "current_holder" },
  { description: "Assigned action items", icon: "audit", label: "My tasks", value: "my_tasks" },
  { description: "Waiting for signature", icon: "signature", label: "Signature queue", value: "signature_queue" },
  { description: "Drafted by your assignments", icon: "edit", label: "Created by me", value: "created_by_me" }
];

const registryTiles: RegistryTile[] = [
  { description: "Everything you can open", icon: "document", label: "All accessible", scope: "accessible", value: "accessible" },
  { description: "Assigned action items", icon: "audit", label: "My tasks", scope: "my_tasks", value: "my_tasks" },
  { description: "Waiting for signature", icon: "signature", label: "Signature queue", scope: "signature_queue", value: "signature_queue" },
  { description: "Drafted by your assignments", icon: "edit", label: "Created by me", scope: "created_by_me", value: "created_by_me" },
  { description: "Completed and archived", icon: "briefcase", label: "Archived", status: "archived", value: "archived" }
];

function parseScope(value: string | null): DocumentScope {
  return scopeOptions.some((option) => option.value === value) ? value as DocumentScope : "accessible";
}

function parseSort(value: string | null): DocumentRegistrySort {
  return ["updated_desc", "updated_asc", "document_date_desc", "priority_desc"].includes(value || "")
    ? value as DocumentRegistrySort
    : "updated_desc";
}

function formatCount(value?: number | null) {
  return numberFormatter.format(value || 0);
}

function formatDocumentDate(value?: string | null) {
  if (!value) {
    return "No date";
  }

  return String(value).replace("T", " ").slice(0, 10);
}

function booleanFlag(value: unknown) {
  return value === true || value === 1 || value === "1";
}

function optionLabel(value: string) {
  return value.replaceAll("_", " ");
}

function priorityTone(code?: string | null): "green" | "amber" | "red" | "blue" | "slate" {
  const normalized = String(code || "").toLowerCase();
  if (["urgent", "critical", "high"].some((item) => normalized.includes(item))) {
    return "red";
  }
  if (["medium", "normal"].some((item) => normalized.includes(item))) {
    return "blue";
  }
  if (["low", "routine"].some((item) => normalized.includes(item))) {
    return "slate";
  }
  return "amber";
}

function scopeLabel(value: DocumentScope) {
  return scopeOptions.find((option) => option.value === value)?.label || "All accessible";
}

function parseSavedFilters(item: JsonRecord) {
  if (typeof item.filters === "string") {
    return JSON.parse(item.filters) as JsonRecord;
  }

  return (item.filters || {}) as JsonRecord;
}

function LoadingRows() {
  return (
    <div className="space-y-3">
      {Array.from({ length: 4 }).map((_, index) => (
        <div className="grid animate-pulse gap-4 rounded-lg border border-slate-200 bg-white p-3 md:grid-cols-[7rem_minmax(0,1fr)_auto]" key={index}>
          <span className="aspect-[210/297] rounded-md bg-slate-100" />
          <span className="space-y-3 py-2">
            <span className="block h-5 w-2/5 rounded bg-slate-100" />
            <span className="block h-3 w-3/5 rounded bg-slate-100" />
            <span className="block h-9 w-full rounded bg-slate-100" />
            <span className="block h-8 w-11/12 rounded bg-slate-100" />
          </span>
          <span className="hidden w-36 space-y-2 md:block">
            <span className="block h-10 rounded bg-slate-100" />
            <span className="block h-10 rounded bg-slate-100" />
          </span>
        </div>
      ))}
    </div>
  );
}

function RegistryMessage({
  action,
  description,
  icon,
  title
}: {
  action?: ReactNode;
  description: ReactNode;
  icon: IconName;
  title: ReactNode;
}) {
  return (
    <div className="grid min-h-56 place-items-center rounded-lg border border-dashed border-slate-300 bg-slate-50 px-4 py-8 text-center">
      <div className="max-w-md">
        <span className="mx-auto grid h-12 w-12 place-items-center rounded-lg bg-white text-[#061d49] shadow-sm ring-1 ring-slate-200">
          <Icon className="h-6 w-6" name={icon} />
        </span>
        <h3 className="mt-3 text-base font-bold text-slate-950">{title}</h3>
        <p className="mt-1 text-sm leading-6 text-slate-600">{description}</p>
        {action ? <div className="mt-4 flex justify-center">{action}</div> : null}
      </div>
    </div>
  );
}

export function DocumentsPage() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [reference, setReference] = useState<WorkspaceReference | null>(null);
  const [savedSearches, setSavedSearches] = useState<JsonRecord[]>([]);
  const [documents, setDocuments] = useState<DocumentListItem[]>([]);
  const [stats, setStats] = useState<DocumentRegistryStats | null>(null);
  const [query, setQuery] = useState(searchParams.get("q") || "");
  const [status, setStatus] = useState(searchParams.get("status") || "");
  const [scope, setScope] = useState<DocumentScope>(() => parseScope(searchParams.get("scope")));
  const [documentTypeId, setDocumentTypeId] = useState(searchParams.get("document_type_id") || "");
  const [priorityId, setPriorityId] = useState(searchParams.get("priority_level_id") || "");
  const [holderUnitId, setHolderUnitId] = useState(searchParams.get("current_holder_unit_id") || "");
  const [sort, setSort] = useState<DocumentRegistrySort>(() => parseSort(searchParams.get("sort")));
  const [deleteDocument, setDeleteDocument] = useState<DocumentListItem | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [pdfBusyKey, setPdfBusyKey] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const currentFilters = useMemo(() => ({
    document_type_id: documentTypeId ? Number(documentTypeId) : undefined,
    current_holder_unit_id: holderUnitId ? Number(holderUnitId) : undefined,
    limit: 100,
    priority_level_id: priorityId ? Number(priorityId) : undefined,
    q: query.trim() || undefined,
    scope,
    sort,
    status: status || undefined
  }), [documentTypeId, holderUnitId, priorityId, query, scope, sort, status]);

  const statsFilters = useMemo(() => ({
    document_type_id: currentFilters.document_type_id,
    current_holder_unit_id: currentFilters.current_holder_unit_id,
    priority_level_id: currentFilters.priority_level_id,
    q: currentFilters.q,
    scope: currentFilters.scope,
    status: currentFilters.status
  }), [currentFilters]);

  const activeFilterChips: ActiveFilterChip[] = useMemo(() => {
    const chips: ActiveFilterChip[] = [];
    const selectedType = reference?.documentTypes.find((item) => String(item.id) === documentTypeId);
    const selectedPriority = reference?.priorityLevels.find((item) => String(item.id) === priorityId);
    const selectedHolder = reference?.units?.find((item) => String(item.id) === holderUnitId);

    if (query.trim()) {
      chips.push({ label: `Search: ${query.trim()}`, onRemove: () => setQuery("") });
    }
    if (scope !== "accessible") {
      chips.push({ label: scopeLabel(scope), onRemove: () => setScope("accessible") });
    }
    if (status) {
      chips.push({ label: `Status: ${optionLabel(status)}`, onRemove: () => setStatus("") });
    }
    if (selectedType || documentTypeId) {
      chips.push({ label: `Type: ${selectedType?.name || documentTypeId}`, onRemove: () => setDocumentTypeId("") });
    }
    if (selectedPriority || priorityId) {
      chips.push({ label: `Priority: ${selectedPriority?.name || priorityId}`, onRemove: () => setPriorityId("") });
    }
    if (selectedHolder || holderUnitId) {
      chips.push({ label: `Holder: ${selectedHolder?.name || holderUnitId}`, onRemove: () => setHolderUnitId("") });
    }

    return chips;
  }, [documentTypeId, holderUnitId, priorityId, query, reference, scope, status]);

  const statusCountMap = useMemo(() => new Map((stats?.statusCounts || []).map((item) => [item.status, item.count])), [stats]);
  const typeCountMap = useMemo(() => new Map((stats?.typeCounts || []).map((item) => [String(item.id), item.count])), [stats]);
  const priorityCountMap = useMemo(() => new Map((stats?.priorityCounts || []).map((item) => [String(item.id), item.count])), [stats]);
  const hasActiveFilters = activeFilterChips.length > 0;
  const matchingCount = stats?.total ?? documents.length;

  function labelWithCount(label: string, count?: number) {
    return stats ? `${label} (${formatCount(count || 0)})` : label;
  }

  function syncUrl() {
    const next = new URLSearchParams();
    if (query.trim()) next.set("q", query.trim());
    if (status) next.set("status", status);
    if (scope !== "accessible") next.set("scope", scope);
    if (documentTypeId) next.set("document_type_id", documentTypeId);
    if (priorityId) next.set("priority_level_id", priorityId);
    if (holderUnitId) next.set("current_holder_unit_id", holderUnitId);
    if (sort !== "updated_desc") next.set("sort", sort);
    setSearchParams(next, { replace: true });
  }

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const [referenceResult, documentsResult, statsResult, savedResult] = await Promise.all([
        workspaceApi.reference(),
        documentApi.list(currentFilters),
        documentApi.stats(statsFilters),
        savedSearchApi.list().catch(() => [])
      ]);
      setReference(referenceResult);
      setDocuments(documentsResult);
      setStats(statsResult);
      setSavedSearches(savedResult);
    } catch {
      setError("Could not load the document registry.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
    syncUrl();
  }, [currentFilters]);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void load();
    syncUrl();
  }

  function clearFilters() {
    setQuery("");
    setStatus("");
    setScope("accessible");
    setDocumentTypeId("");
    setPriorityId("");
    setHolderUnitId("");
    setSort("updated_desc");
  }

  async function saveSearch() {
    const name = query.trim() ? `Documents: ${query.trim()}` : "Document search";
    try {
      await savedSearchApi.create({ filters: currentFilters, name, search_type: "documents" });
      setSavedSearches(await savedSearchApi.list().catch(() => []));
    } catch {
      setError("Could not save this search.");
    }
  }

  function applySavedSearch(item: JsonRecord) {
    try {
      const filters = parseSavedFilters(item);
      setQuery(String(filters.q || ""));
      setStatus(String(filters.status || ""));
      setScope(parseScope(filters.scope ? String(filters.scope) : "accessible"));
      setDocumentTypeId(filters.document_type_id ? String(filters.document_type_id) : "");
      setPriorityId(filters.priority_level_id ? String(filters.priority_level_id) : "");
      setHolderUnitId(filters.current_holder_unit_id ? String(filters.current_holder_unit_id) : "");
      setSort(parseSort(filters.sort ? String(filters.sort) : "updated_desc"));
    } catch {
      setError("Could not apply this saved search.");
    }
  }

  async function openOfficialPdf(document: DocumentListItem, download: boolean) {
    const busyKey = `${document.id}:${download ? "download" : "open"}`;
    const pdfWindow = download ? null : window.open("about:blank", "_blank");
    if (pdfWindow) {
      pdfWindow.opener = null;
    }
    setPdfBusyKey(busyKey);
    setActionError(null);
    try {
      const rendered = await templateApi.renderPdf(document.id, {
        download,
        locale: "all",
        variant: "official"
      });
      if (download) {
        downloadBlob(rendered.blob, rendered.filename || `document-${document.id}.pdf`);
      } else {
        openBlobInNewWindow(rendered.blob, pdfWindow);
      }
    } catch (caught) {
      pdfWindow?.close();
      setActionError(caught instanceof Error ? caught.message : "Could not prepare the official PDF.");
    } finally {
      setPdfBusyKey(null);
    }
  }

  async function confirmDeleteDocument() {
    if (!deleteDocument) {
      return;
    }

    setDeleteBusy(true);
    setActionError(null);
    try {
      await documentApi.delete(deleteDocument.id);
      setDocuments((current) => current.filter((document) => document.id !== deleteDocument.id));
      setNotice(`Draft deleted: ${deleteDocument.subject}`);
      setDeleteDocument(null);
      await load();
    } catch (caught) {
      setActionError(caught instanceof Error ? caught.message : "Could not delete this draft.");
    } finally {
      setDeleteBusy(false);
    }
  }

  function renderDocumentActions(document: DocumentListItem) {
    const draft = document.status === "draft";
    const lockedPdf = ["finalized", "archived", "closed", "serial_assigned"].includes(document.status);
    const openBusy = pdfBusyKey === `${document.id}:open`;
    const downloadBusy = pdfBusyKey === `${document.id}:download`;

    return (
      <div className="flex min-w-0 flex-nowrap justify-end gap-1.5">
        <IconButton className="h-9 w-9" icon="view" label="View document" onClick={() => navigate(`/app/documents/${document.id}`)} title="View document" />
        {draft && booleanFlag(document.canDelete) ? (
          <IconButton className="h-9 w-9 border-red-200 bg-red-50 text-red-700 hover:border-red-300 hover:bg-red-100" icon="userX" label="Delete document" onClick={() => setDeleteDocument(document)} title="Delete document" />
        ) : null}
        {booleanFlag(document.canOpenPdf) ? (
          <IconButton
            className="h-9 w-9"
            disabled={Boolean(pdfBusyKey)}
            icon="document"
            label={openBusy ? "Opening PDF" : lockedPdf ? "Open PDF" : "Preview PDF"}
            onClick={() => void openOfficialPdf(document, false)}
            title={openBusy ? "Opening PDF" : lockedPdf ? "Open PDF" : "Preview PDF"}
          />
        ) : null}
        {booleanFlag(document.canDownloadPdf) ? (
          <IconButton
            className="h-9 w-9"
            disabled={Boolean(pdfBusyKey)}
            icon="export"
            label={downloadBusy ? "Downloading PDF" : "Download PDF"}
            onClick={() => void openOfficialPdf(document, true)}
            title={downloadBusy ? "Downloading PDF" : "Download PDF"}
          />
        ) : null}
      </div>
    );
  }

  function renderDocumentCard(document: DocumentListItem) {
    const documentDate = formatDocumentDate(document.documentDate || document.document_date);
    const summary = document.workflowSummary || null;

    return (
      <article className="rounded-lg border border-slate-200 bg-white p-3 shadow-[0_1px_2px_rgba(15,23,42,0.06)] transition hover:border-[#061d49]/25 hover:shadow-md" key={document.id}>
        <div className="grid gap-4 md:grid-cols-[7.25rem_minmax(0,1fr)_auto]">
          <Link className="block w-28 max-w-full md:w-auto" to={`/app/documents/${document.id}`}>
            <DocumentThumbnail subject={document.subject} thumbnailUrl={summary?.thumbnailUrl} />
          </Link>

          <div className="min-w-0 py-1">
            <div className="flex min-w-0 flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <Link className="block truncate text-lg font-black leading-7 text-slate-950 hover:underline" to={`/app/documents/${document.id}`}>
                  {document.subject}
                </Link>
                <p className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-sm text-slate-500">
                  <span className="force-ltr truncate">{document.officialSerial || document.internalReference}</span>
                  <span>{documentDate}</span>
                </p>
              </div>
              <StatusBadge>{document.status}</StatusBadge>
            </div>

            <div className="mt-3 grid gap-3 text-sm text-slate-600 sm:grid-cols-2 xl:grid-cols-4">
              <div className="min-w-0">
                <p className="text-xs font-bold text-slate-400">Type</p>
                <p className="mt-1 truncate font-semibold text-slate-800">{document.documentTypeName}</p>
              </div>
              <div className="min-w-0">
                <p className="text-xs font-bold text-slate-400">Current holder</p>
                <p className="mt-1 truncate font-semibold text-slate-800">{document.currentHolderUnitName}</p>
              </div>
              <div className="min-w-0">
                <p className="text-xs font-bold text-slate-400">Priority</p>
                <div className="mt-1">{document.priorityName ? <StatusBadge tone={priorityTone(document.priorityCode)}>{document.priorityName}</StatusBadge> : "-"}</div>
              </div>
              <div className="min-w-0">
                <p className="text-xs font-bold text-slate-400">Updated</p>
                <p className="mt-1 truncate font-semibold text-slate-800">{formatDateTime(document.updatedAt)}</p>
              </div>
            </div>

            <div className="mt-4 border-t border-slate-200 pt-3">
              <DocumentWorkflowRoute summary={summary} />
            </div>
          </div>

          <div className="flex items-start justify-end md:w-36">
            {renderDocumentActions(document)}
          </div>
        </div>
      </article>
    );
  }

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-sm font-bold uppercase tracking-wide text-[#0b5c74]">Document registry</p>
          <h1 className="mt-1 text-2xl font-bold text-slate-950">Documents</h1>
          <p className="mt-1 max-w-2xl text-sm leading-6 text-slate-600">
            Search, filter, and open documents available to your active assignment.
          </p>
        </div>
        <Link to="/app/documents/new">
          <Button icon="plus" variant="primary">New document</Button>
        </Link>
      </div>

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        {registryTiles.map((tile) => {
          const active = tile.status ? status === tile.status : scope === tile.scope && !status;
          const value = tile.status ? statusCountMap.get(tile.status) || 0 : stats?.scopeCounts[tile.scope || "accessible"] || 0;

          return (
            <button
              className={`flex min-h-[92px] min-w-0 items-center gap-3 rounded-lg border bg-white px-4 py-3 text-start shadow-[0_1px_2px_rgba(15,23,42,0.06)] transition hover:border-[#061d49]/40 hover:bg-slate-50 ${active ? "border-[#061d49] ring-4 ring-[#061d49]/10" : "border-slate-200/80"}`}
              key={tile.value}
              onClick={() => {
                setScope(tile.scope || "accessible");
                setStatus(tile.status || "");
              }}
              type="button"
            >
              <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-lg ${active ? "bg-[#061d49] text-white" : "bg-blue-50 text-[#061d49]"}`}>
                <Icon className="h-5 w-5" name={tile.icon} />
              </span>
              <span className="min-w-0">
                <span className="block text-sm font-semibold leading-5 text-slate-600">{tile.label}</span>
                <span className="mt-0.5 block text-2xl font-bold leading-none text-slate-950">{loading ? "-" : formatCount(value)}</span>
                <span className="mt-1 block truncate text-xs text-slate-500">{tile.description}</span>
              </span>
            </button>
          );
        })}
      </section>

      <section className="space-y-3 rounded-lg border border-slate-200 bg-white p-3 shadow-[0_1px_2px_rgba(15,23,42,0.06)]">
        <form onSubmit={handleSubmit}>
          <Toolbar className="items-stretch">
            <SearchInput
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Subject, serial, reference..."
              value={query}
              wrapperClassName="min-w-[18rem] flex-[1_1_24rem]"
            />
            <SelectFilter aria-label="Status" className="w-full sm:w-44" onChange={(event) => setStatus(event.target.value)} value={status}>
              {statusOptions.map((item) => (
                <option key={item || "all"} value={item}>
                  {item ? labelWithCount(optionLabel(item), statusCountMap.get(item)) : "Any status"}
                </option>
              ))}
            </SelectFilter>
            <SelectFilter aria-label="Document type" className="w-full sm:w-48" onChange={(event) => setDocumentTypeId(event.target.value)} value={documentTypeId}>
              <option value="">Any type</option>
              {reference?.documentTypes.map((item) => (
                <option key={item.id} value={item.id}>{labelWithCount(item.name, typeCountMap.get(String(item.id)))}</option>
              ))}
            </SelectFilter>
            <SelectFilter aria-label="Current holder" className="w-full sm:w-52" onChange={(event) => setHolderUnitId(event.target.value)} value={holderUnitId}>
              <option value="">Any holder</option>
              {reference?.units?.map((item) => (
                <option key={item.id} value={item.id}>{item.name}</option>
              ))}
            </SelectFilter>
            <SelectFilter aria-label="Priority" className="w-full sm:w-44" onChange={(event) => setPriorityId(event.target.value)} value={priorityId}>
              <option value="">Any priority</option>
              {reference?.priorityLevels.map((item) => (
                <option key={item.id} value={item.id}>{labelWithCount(item.name, priorityCountMap.get(String(item.id)))}</option>
              ))}
            </SelectFilter>
            <SelectFilter aria-label="Sort" className="w-full sm:w-48" onChange={(event) => setSort(event.target.value as DocumentRegistrySort)} value={sort}>
              <option value="updated_desc">Updated newest</option>
              <option value="updated_asc">Updated oldest</option>
              <option value="document_date_desc">Document date</option>
              <option value="priority_desc">Priority first</option>
            </SelectFilter>
            <Button icon="search" type="submit" variant="primary">Search</Button>
            <Button disabled={loading} icon="save" onClick={() => void saveSearch()} variant="secondary">Save</Button>
            {hasActiveFilters ? <Button icon="reset" onClick={clearFilters} variant="secondary">Reset</Button> : null}
          </Toolbar>
        </form>

        {activeFilterChips.length ? (
          <div className="flex flex-wrap gap-2">
            {activeFilterChips.map((chip) => (
              <button
                className="inline-flex min-h-8 max-w-full items-center gap-2 rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700 transition hover:bg-slate-200"
                key={chip.label}
                onClick={chip.onRemove}
                type="button"
              >
                <span className="truncate">{chip.label}</span>
                <Icon className="h-3.5 w-3.5 shrink-0" name="x" />
              </button>
            ))}
          </div>
        ) : (
          <p className="text-sm text-slate-500">Showing all documents available to your active assignment.</p>
        )}
      </section>

      {notice ? (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-800">{notice}</div>
      ) : null}
      {actionError ? (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">{actionError}</div>
      ) : null}

      <section className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-base font-black text-slate-950">Document results</h2>
          <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-bold text-slate-600">{loading ? "Loading" : `${formatCount(matchingCount)} matching`}</span>
        </div>
        {loading ? (
          <LoadingRows />
        ) : error ? (
          <RegistryMessage
            action={<Button icon="reset" onClick={() => void load()} variant="secondary">Retry</Button>}
            description={error}
            icon="x"
            title="Registry unavailable"
          />
        ) : documents.length ? (
          <div className="space-y-3">
            {documents.map((document) => renderDocumentCard(document))}
          </div>
        ) : hasActiveFilters ? (
          <RegistryMessage
            action={<Button icon="reset" onClick={clearFilters} variant="secondary">Clear filters</Button>}
            description="No documents match the current search, scope, or filter combination."
            icon="filter"
            title="No matching documents"
          />
        ) : (
          <RegistryMessage
            action={(
              <Link to="/app/documents/new">
                <Button icon="plus" variant="primary">Create document</Button>
              </Link>
            )}
            description="Create the first draft for your active assignment to begin the workflow."
            icon="document"
            title="No documents yet"
          />
        )}
      </section>

      <AdminModal
        description="This removes the draft from the registry. Finalized documents cannot be deleted."
        footer={(
          <>
            <Button disabled={deleteBusy} onClick={() => setDeleteDocument(null)}>Cancel</Button>
            <Button disabled={deleteBusy} icon="userX" onClick={() => void confirmDeleteDocument()} variant="danger">
              {deleteBusy ? "Deleting" : "Delete draft"}
            </Button>
          </>
        )}
        onClose={() => {
          if (!deleteBusy) {
            setDeleteDocument(null);
          }
        }}
        open={Boolean(deleteDocument)}
        title="Delete draft document"
      >
        <p className="text-sm leading-6 text-slate-700">
          Delete <span className="font-bold text-slate-950">{deleteDocument?.subject}</span>? This action only applies to draft documents and will remove the draft from document search and registry views.
        </p>
      </AdminModal>
    </section>
  );
}
