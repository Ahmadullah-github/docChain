import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { adminApi, templateApi } from "../../../api";
import type { DocumentTemplate, DocumentTemplateBinding, DocumentType, EntityId } from "../../../api";
import { Button, DataTable, PanelCard, SearchInput, SelectFilter, StatusBadge } from "../../../components/ui";

type TemplateScope = "visible" | "mine" | "published" | "submitted";

async function safe<T>(promise: Promise<T>, fallback: T) {
  try {
    return await promise;
  } catch {
    return fallback;
  }
}

export function AdminTemplateLibraryPage() {
  const navigate = useNavigate();
  const [scope, setScope] = useState<TemplateScope>("visible");
  const [query, setQuery] = useState("");
  const [templates, setTemplates] = useState<DocumentTemplate[]>([]);
  const [documentTypes, setDocumentTypes] = useState<DocumentType[]>([]);
  const [bindings, setBindings] = useState<DocumentTemplateBinding[]>([]);
  const [selectedDocumentTypeId, setSelectedDocumentTypeId] = useState("all");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function refresh(nextScope = scope) {
    setError(null);
    const [templateRows, docs, bindingRows] = await Promise.all([
      safe(templateApi.list(nextScope), [] as DocumentTemplate[]),
      safe(adminApi.documentTypes.list(), [] as DocumentType[]),
      safe(templateApi.admin.listBindings(), [] as DocumentTemplateBinding[])
    ]);
    setTemplates(templateRows);
    setDocumentTypes(docs);
    setBindings(bindingRows);
  }

  useEffect(() => {
    void refresh(scope);
  }, [scope]);

  const activeDocumentTypes = useMemo(() => documentTypes.filter((documentType) => documentType.status === "active"), [documentTypes]);
  const sortedDocumentTypes = useMemo(() => [...documentTypes].sort((left, right) => {
    if (left.status === right.status) {
      return left.name.localeCompare(right.name);
    }
    return left.status === "active" ? -1 : 1;
  }), [documentTypes]);
  const selectedDocumentType = selectedDocumentTypeId === "all"
    ? null
    : documentTypes.find((documentType) => String(documentType.id) === selectedDocumentTypeId) || null;
  const activeBindings = bindings.filter((binding) => binding.status === "active");
  const selectedBindings = selectedDocumentType
    ? activeBindings.filter((binding) => binding.document_type_id === selectedDocumentType.id || binding.document_type_id == null)
    : [];

  const filteredTemplates = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    const scopeTemplates = selectedDocumentType
      ? selectedBindings
        .map((binding) => templates.find((template) => template.id === binding.template_id))
        .filter((template): template is DocumentTemplate => Boolean(template))
      : templates;

    if (!normalized) {
      return scopeTemplates;
    }

    return scopeTemplates.filter((template) => [
      template.name,
      template.description,
      template.status,
      template.ownerDisplayName
    ].filter(Boolean).some((value) => String(value).toLowerCase().includes(normalized)));
  }, [query, selectedBindings, selectedDocumentType, templates]);

  function canDeleteTemplate(template: DocumentTemplate) {
    return template.status !== "published" && !template.current_version_id;
  }

  async function handleClone(templateId: EntityId) {
    setBusy(true);
    setError(null);
    try {
      const cloned = await templateApi.clone(templateId);
      navigate(`/admin/templates/builder/${cloned.template.id}`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not clone template.");
    } finally {
      setBusy(false);
    }
  }

  async function handleDeleteTemplate(template: DocumentTemplate) {
    if (!canDeleteTemplate(template)) {
      setError("Published templates cannot be deleted. Archive them instead.");
      return;
    }

    const confirmed = window.confirm(`Delete "${template.name}"? This cannot be undone.`);
    if (!confirmed) {
      return;
    }

    setBusy(true);
    setError(null);
    try {
      await templateApi.remove(template.id);
      setTemplates((rows) => rows.filter((row) => row.id !== template.id));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not delete template.");
    } finally {
      setBusy(false);
    }
  }

  function createTemplate(documentTypeId = selectedDocumentTypeId) {
    const suffix = documentTypeId === "all" ? "" : `?documentTypeId=${documentTypeId}`;
    navigate(`/admin/templates/builder/new${suffix}`);
  }

  function bindingCountForDocumentType(documentTypeId: EntityId) {
    return activeBindings.filter((binding) => binding.document_type_id === documentTypeId).length;
  }

  return (
    <div className="space-y-4">
      {error ? <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">{error}</div> : null}

      <PanelCard
        title="Document Types"
        actions={(
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge tone="blue">{`${documentTypes.length} total`}</StatusBadge>
            <StatusBadge tone="green">{`${activeDocumentTypes.length} active`}</StatusBadge>
          </div>
        )}
      >
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {sortedDocumentTypes.map((documentType) => {
            const selected = selectedDocumentTypeId === String(documentType.id);
            const bindingCount = bindingCountForDocumentType(documentType.id);
            return (
              <button
                className={`min-w-0 rounded-lg border p-4 text-start transition ${selected ? "border-[#061d49] bg-blue-50 ring-2 ring-[#061d49]/10" : "border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50"}`}
                key={documentType.id}
                onClick={() => setSelectedDocumentTypeId(String(documentType.id))}
                type="button"
              >
                <div className="flex min-w-0 items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-base font-black text-slate-950">{documentType.name}</p>
                    <p className="force-ltr mt-1 truncate text-start text-xs font-semibold text-slate-500">{documentType.code}</p>
                  </div>
                  <StatusBadge tone={documentType.status === "active" ? "green" : "slate"}>{documentType.status}</StatusBadge>
                </div>
                <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
                  <span className="text-xs font-bold text-slate-500">{bindingCount} published bindings</span>
                  <span className="rounded-md border border-slate-200 bg-white px-2 py-1 text-xs font-black text-[#061d49]">Select</span>
                </div>
              </button>
            );
          })}
        </div>
        {!documentTypes.length ? (
          <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 px-4 py-8 text-center">
            <p className="text-sm font-bold text-slate-700">No document types found.</p>
            <Button className="mt-3" icon="plus" onClick={() => navigate("/admin/document-types")} variant="primary">Create Document Type</Button>
          </div>
        ) : null}
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-slate-200 bg-slate-50 px-3 py-3">
          <div className="min-w-0">
            <p className="truncate text-sm font-black text-slate-950">{selectedDocumentType?.name || "All document types"}</p>
            <p className="mt-1 text-xs font-semibold text-slate-500">{filteredTemplates.length} templates shown</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button onClick={() => setSelectedDocumentTypeId("all")}>Show All</Button>
            <Button disabled={!selectedDocumentType && !documentTypes.length} icon="plus" onClick={() => createTemplate()} variant="primary">Create Template</Button>
          </div>
        </div>
      </PanelCard>

      <PanelCard
        title="Template Library"
        actions={(
          <div className="flex flex-wrap items-center gap-2">
            <SelectFilter className="h-9 w-48 rounded-md text-sm" onChange={(event) => setSelectedDocumentTypeId(event.target.value)} value={selectedDocumentTypeId}>
              <option value="all">All document types</option>
              {sortedDocumentTypes.map((documentType) => <option key={documentType.id} value={documentType.id}>{documentType.name}</option>)}
            </SelectFilter>
            <SelectFilter className="h-9 w-36 rounded-md text-sm" onChange={(event) => setScope(event.target.value as TemplateScope)} value={scope}>
              <option value="visible">Visible</option>
              <option value="mine">Mine</option>
              <option value="published">Published</option>
              <option value="submitted">Submitted</option>
            </SelectFilter>
            <Button className="min-h-9 px-3 py-1.5 text-xs" icon="plus" onClick={() => createTemplate()} variant="primary">Create</Button>
          </div>
        )}
      >
        <div className="mb-4 grid gap-3 lg:grid-cols-[minmax(0,1fr)_auto]">
          <SearchInput onChange={(event) => setQuery(event.target.value)} placeholder="Search templates..." value={query} />
          <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-600">
            {documentTypes.length} document types available
          </div>
        </div>
        <DataTable
          columns={[
            {
              key: "name",
              header: "Template",
              cell: (row) => (
                <div className="min-w-0">
                  <p className="font-bold text-slate-950">{row.name}</p>
                  <p className="mt-1 max-w-xl truncate text-xs text-slate-500">{row.description || "No description."}</p>
                </div>
              )
            },
            { key: "owner", header: "Owner", hideOnMobile: true, cell: (row) => row.ownerDisplayName || "Private creator" },
            { key: "status", header: "Status", cell: (row) => <StatusBadge>{row.status}</StatusBadge> },
            {
              key: "actions",
              header: "Actions",
              cell: (row) => (
                <div className="flex flex-wrap gap-2">
                  <Button className="min-h-8 px-2 py-1 text-xs" icon="edit" onClick={() => navigate(`/admin/templates/builder/${row.id}`)}>Edit</Button>
                  <Button className="min-h-8 px-2 py-1 text-xs" icon="view" onClick={() => navigate(`/admin/templates/publish/${row.id}`)}>Publish</Button>
                  <Button className="min-h-8 px-2 py-1 text-xs" disabled={busy} icon="export" onClick={() => void handleClone(row.id)}>Clone</Button>
                  <Button
                    className="min-h-8 px-2 py-1 text-xs"
                    disabled={busy || !canDeleteTemplate(row)}
                    icon="x"
                    onClick={() => void handleDeleteTemplate(row)}
                    title={canDeleteTemplate(row) ? "Delete template" : "Published templates must be archived instead."}
                    variant="danger"
                  >
                    Delete
                  </Button>
                </div>
              )
            }
          ]}
          emptyLabel="No templates found."
          getRowKey={(row) => row.id}
          rows={filteredTemplates}
        />
      </PanelCard>
    </div>
  );
}
