import { useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { Link, NavLink, Outlet, useLocation, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { adminApi, templateApi } from "../../api";
import type { DocumentTemplateDetail, DocumentTemplateVersion, DocumentType, EntityId, TemplateLayout } from "../../api";
import { useAuth } from "../../app/AuthContext";
import { AdminPageHeader } from "../../components/admin";
import { Button, Icon, PanelCard, StatusBadge } from "../../components/ui";
import { cx } from "../../lib/classNames";
import { WordTemplateDesigner } from "./templates/WordTemplateDesigner";
import {
  defaultTemplateNameForWordDocumentType,
  defaultWordTemplateLayout,
  documentTypeIdFromWordLayout,
  isWordTemplateLayout,
  stripInlineTablesFromWordLayout,
  withWordTemplateDocumentType
} from "./templates/wordTemplateModel";

function navClassName({ isActive }: { isActive: boolean }) {
  return cx(
    "inline-flex items-center rounded-lg px-3 py-2 text-sm font-semibold transition",
    isActive ? "bg-[#061d49] text-white shadow-sm" : "text-slate-600 hover:bg-slate-100 hover:text-slate-950"
  );
}

function WorkspaceShell({ children }: { children: ReactNode }) {
  return <div className="space-y-3">{children}</div>;
}

function TemplateWorkspaceHeader() {
  const auth = useAuth();

  return (
    <div className="space-y-3">
      <AdminPageHeader
        actions={(
          <>
            <Link className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg border border-[#061d49] bg-[#061d49] px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-[#082861]" to="/admin/templates/builder/new">
              <Icon className="h-4 w-4" name="plus" />
              New Template
            </Link>
            {auth.isAdmin ? (
              <Link className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-[#061d49] shadow-sm transition hover:bg-slate-50" to="/admin/templates/admin">
                <Icon className="h-4 w-4" name="settings" />
                Admin Queues
              </Link>
            ) : null}
          </>
        )}
        description="Create official university document templates with a Word-like A4 designer."
        title="Templates"
      />
      <nav className="flex flex-wrap gap-2 rounded-lg border border-slate-200 bg-white p-1.5">
        <NavLink className={navClassName} to="/admin/templates/library">Library</NavLink>
        <NavLink className={navClassName} to="/admin/templates/builder/new">Designer</NavLink>
        {auth.isAdmin ? <NavLink className={navClassName} to="/admin/templates/admin">Admin</NavLink> : null}
      </nav>
    </div>
  );
}

export function AdminTemplatesPage() {
  const location = useLocation();
  const isBuilderRoute = location.pathname.startsWith("/admin/templates/builder");

  return (
    <WorkspaceShell>
      {isBuilderRoute ? null : <TemplateWorkspaceHeader />}
      <Outlet />
    </WorkspaceShell>
  );
}

async function safe<T>(promise: Promise<T>, fallback: T) {
  try {
    return await promise;
  } catch {
    return fallback;
  }
}

function latestUsefulVersion(detail: DocumentTemplateDetail | null): DocumentTemplateVersion | null {
  if (!detail?.versions.length) {
    return null;
  }
  return detail.versions.find((version) => ["draft", "rejected"].includes(version.status))
    || detail.versions.find((version) => version.status === "submitted")
    || detail.versions.find((version) => version.id === detail.template.current_version_id)
    || detail.versions.find((version) => version.status === "active")
    || detail.versions[0]
    || null;
}

function layoutFromDetail(detail: DocumentTemplateDetail | null, fallback: TemplateLayout): TemplateLayout {
  return latestUsefulVersion(detail)?.layout_definition || fallback;
}

function documentTypeIdFromAnyLayout(layout?: TemplateLayout | null): EntityId | null {
  const wordId = documentTypeIdFromWordLayout(layout);
  if (wordId) {
    return wordId;
  }
  const value = layout?.meta?.documentTypeId || layout?.meta?.document_type_id;
  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric > 0 ? numeric as EntityId : null;
}

export function AdminTemplateBuilderPage() {
  const auth = useAuth();
  const { templateId } = useParams();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const isNew = templateId === "new";
  const documentTypeParam = searchParams.get("documentTypeId");
  const [detail, setDetail] = useState<DocumentTemplateDetail | null>(null);
  const [documentTypes, setDocumentTypes] = useState<DocumentType[]>([]);
  const [documentTypesLoaded, setDocumentTypesLoaded] = useState(false);
  const [selectedDocumentTypeId, setSelectedDocumentTypeId] = useState<EntityId | null>(null);
  const [name, setName] = useState("Official Document Template");
  const [description, setDescription] = useState("Reusable official document template.");
  const [layout, setLayout] = useState<TemplateLayout>(() => defaultWordTemplateLayout(null));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [designerNotice, setDesignerNotice] = useState<string | null>(null);

  const selectedDocumentType = useMemo(
    () => selectedDocumentTypeId ? documentTypes.find((documentType) => documentType.id === selectedDocumentTypeId) || null : null,
    [documentTypes, selectedDocumentTypeId]
  );
  const selectedVersion = latestUsefulVersion(detail);
  const isLegacyTemplate = detail && !isWordTemplateLayout(layout);
  const canEdit = Boolean((auth.isAdmin || isNew || !selectedVersion || ["draft", "rejected", "active"].includes(selectedVersion.status)) && selectedVersion?.status !== "submitted");

  useEffect(() => {
    let alive = true;
    safe(adminApi.documentTypes.list(), [] as DocumentType[])
      .then((rows) => {
        if (!alive) {
          return;
        }
        setDocumentTypes(rows);
        setDocumentTypesLoaded(true);
      });
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    if (isNew && documentTypeParam && !documentTypesLoaded) {
      return;
    }

    let alive = true;
    async function loadTemplate() {
      setBusy(true);
      setError(null);
      try {
        if (isNew || !templateId) {
          const documentTypeId = Number(documentTypeParam || 0);
          const nextDocumentType = documentTypes.find((item) => item.id === documentTypeId) || null;
          const nextLayout = defaultWordTemplateLayout(nextDocumentType);
          if (!alive) {
            return;
          }
          setDetail(null);
          setSelectedDocumentTypeId(nextDocumentType?.id || null);
          setName(defaultTemplateNameForWordDocumentType(nextDocumentType));
          setDescription(nextDocumentType ? `Template for ${nextDocumentType.name} documents.` : "Reusable official document template.");
          setDesignerNotice(null);
          setLayout(nextLayout);
          return;
        }

        const nextDetail = await templateApi.get(Number(templateId));
        const nextLayout = layoutFromDetail(nextDetail, defaultWordTemplateLayout(null));
        const nextDocumentTypeId = documentTypeIdFromAnyLayout(nextLayout);
        if (!alive) {
          return;
        }
        const stripped = isWordTemplateLayout(nextLayout)
          ? stripInlineTablesFromWordLayout(nextLayout)
          : { layout: nextLayout, removedTableCount: 0 };
        setDetail(nextDetail);
        setName(nextDetail.template.name);
        setDescription(nextDetail.template.description || "");
        setLayout(stripped.layout);
        setDesignerNotice(stripped.removedTableCount
          ? `${stripped.removedTableCount} inline template table${stripped.removedTableCount === 1 ? " was" : "s were"} removed. Floating tables are now the supported template table format.`
          : null);
        setSelectedDocumentTypeId(nextDocumentTypeId);
      } catch (caught) {
        if (alive) {
          setError(caught instanceof Error ? caught.message : "Could not load template.");
        }
      } finally {
        if (alive) {
          setBusy(false);
        }
      }
    }

    void loadTemplate();
    return () => {
      alive = false;
    };
  }, [documentTypeParam, documentTypes, documentTypesLoaded, isNew, templateId]);

  function selectDocumentType(documentTypeId: EntityId | null) {
    const nextDocumentType = documentTypeId ? documentTypes.find((item) => item.id === documentTypeId) || null : null;
    setSelectedDocumentTypeId(nextDocumentType?.id || null);
    setLayout((current) => withWordTemplateDocumentType(current, nextDocumentType));
  }

  async function saveTemplate() {
    setBusy(true);
    setError(null);
    try {
      const stripped = stripInlineTablesFromWordLayout(layout);
      const layoutDefinition = withWordTemplateDocumentType(stripped.layout, selectedDocumentType);
      const input = {
        name: name.trim() || defaultTemplateNameForWordDocumentType(selectedDocumentType),
        description: description.trim() || null,
        layout_definition: layoutDefinition
      };
      const saved = detail
        ? await templateApi.update(detail.template.id, input)
        : await templateApi.create(input);
      setDetail(saved);
      setLayout(layoutFromDetail(saved, layoutDefinition));
      if (!detail) {
        navigate(`/admin/templates/builder/${saved.template.id}`, { replace: true });
      }
      return saved;
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not save template.");
      return null;
    } finally {
      setBusy(false);
    }
  }

  async function openPublish() {
    if (detail && !canEdit) {
      navigate(`/admin/templates/publish/${detail.template.id}?review=1`);
      return;
    }
    const saved = await saveTemplate();
    if (saved) {
      navigate(`/admin/templates/publish/${saved.template.id}?review=1`);
    }
  }

  if (busy && !detail && !isNew) {
    return <PanelCard title="Template Designer"><p className="text-sm text-slate-600">Loading template...</p></PanelCard>;
  }

  if (isLegacyTemplate) {
    const legacyDocumentTypeId = documentTypeIdFromAnyLayout(layout);
    const replacementUrl = legacyDocumentTypeId
      ? `/admin/templates/builder/new?documentTypeId=${legacyDocumentTypeId}`
      : "/admin/templates/builder/new";

    return (
      <div className="mx-auto max-w-4xl space-y-4">
        {error ? <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">{error}</div> : null}
        <PanelCard
          actions={<StatusBadge tone="slate">legacy renderer supported</StatusBadge>}
          title="Legacy Template"
        >
          <div className="space-y-4">
            <p className="text-sm leading-6 text-slate-600">
              This template uses the old guided canvas format. It will still render for existing published documents, but new template creation now uses the Word-like designer.
            </p>
            <div className="flex flex-wrap gap-2">
              <Button icon="template" onClick={() => navigate(replacementUrl)} variant="primary">Create Word Template</Button>
              <Button icon="view" onClick={() => navigate(`/admin/templates/publish/${detail.template.id}`)}>Preview Legacy Template</Button>
              <Button onClick={() => navigate("/admin/templates/library")}>Back to Library</Button>
            </div>
          </div>
        </PanelCard>
      </div>
    );
  }

  return (
    <WordTemplateDesigner
      busy={busy}
      canEdit={canEdit}
      description={description}
      detail={detail}
      documentTypes={documentTypes}
      error={error}
      notice={designerNotice}
      layout={layout}
      name={name}
      onBackToLibrary={() => navigate("/admin/templates/library")}
      onDescriptionChange={setDescription}
      onLayoutChange={setLayout}
      onNameChange={setName}
      onOpenPublish={() => void openPublish()}
      onSave={() => void saveTemplate()}
      onSelectDocumentType={selectDocumentType}
      selectedDocumentTypeId={selectedDocumentTypeId}
    />
  );
}
