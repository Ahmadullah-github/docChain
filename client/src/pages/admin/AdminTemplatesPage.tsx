import { useEffect, useMemo, useState } from "react";
import { adminApi, templateApi } from "../../api";
import type {
  DocumentTemplate,
  DocumentTemplateBinding,
  DocumentTemplateDetail,
  DocumentTemplateVersion,
  DocumentType,
  EntityId,
  TemplateBlock,
  TemplateLayout,
  TemplateLocale,
  TemplateVariant
} from "../../api";
import { AdminPageHeader } from "../../components/admin";
import { useAuth } from "../../app/AuthContext";
import { Button, DataTable, IconButton, PanelCard, SearchInput, SelectFilter, StatusBadge } from "../../components/ui";
import { cx } from "../../lib/classNames";

const a4Width = 210;
const a4Height = 297;
const variants: TemplateVariant[] = ["official", "internal", "archive", "routing_sheet"];
const locales: TemplateLocale[] = ["all", "en", "fa-AF", "ps-AF"];
const blockToolGroups = [
  { label: "Content", tools: ["text", "dynamic_field", "image", "table"] },
  { label: "Structure", tools: ["box", "line", "qr", "page_number"] },
  { label: "Workflow", tools: ["signature_zone", "comments_zone", "watermark"] }
];
const fields = [
  "document.subject",
  "document.body",
  "document.summary",
  "document.internal_reference",
  "document.official_serial",
  "document.date",
  "document.document_type",
  "document.confidentiality",
  "origin_unit.name",
  "owner_unit.name",
  "holder_unit.name",
  "signature.final.position",
  "signature.final.unit",
  "serial.value",
  "page.number"
];

type TemplateScope = "visible" | "mine" | "published" | "submitted";

const sampleValues: Record<string, string> = {
  "document.subject": "موضوع: مکتوب رسمی نمونه",
  "document.body": "این متن نمونه برای پیش نمایش قالب رسمی سند است. متن اصلی سند در زمان تولید از محتوای واقعی جایگزین می شود.",
  "document.summary": "خلاصه سند نمونه",
  "document.internal_reference": "DOC-20260426-0001",
  "document.official_serial": "DOC-2026-000001",
  "document.date": "1405/02/06",
  "document.document_type": "Official Letter",
  "document.confidentiality": "Normal",
  "origin_unit.name": "Faculty of Computer Science",
  "owner_unit.name": "Department of Software Engineering",
  "holder_unit.name": "Rector Office",
  "signature.final.position": "President",
  "signature.final.unit": "University",
  "serial.value": "DOC-2026-000001",
  "page.number": "1"
};

function defaultLayout(): TemplateLayout {
  return {
    page: {
      widthMm: 210,
      heightMm: 297,
      direction: "rtl",
      backgroundColor: "#ffffff",
      marginTopMm: 14,
      marginRightMm: 16,
      marginBottomMm: 14,
      marginLeftMm: 16
    },
    blocks: [
      { id: crypto.randomUUID(), type: "logo", x: 16, y: 12, width: 24, height: 24, src: "", style: { borderWidth: 0 } },
      { id: crypto.randomUUID(), type: "text", x: 52, y: 13, width: 106, height: 18, content: "DocChain University\nOfficial Correspondence", style: { fontSize: 13, fontWeight: "700", textAlign: "center" } },
      { id: crypto.randomUUID(), type: "logo", x: 170, y: 12, width: 24, height: 24, src: "", style: { borderWidth: 0 } },
      { id: crypto.randomUUID(), type: "dynamic_field", x: 24, y: 52, width: 162, height: 12, field: "document.subject", style: { fontSize: 12, fontWeight: "700", textAlign: "center" } },
      { id: crypto.randomUUID(), type: "dynamic_field", x: 26, y: 74, width: 158, height: 104, field: "document.body", style: { fontSize: 11, textAlign: "start" } },
      { id: crypto.randomUUID(), type: "signature_zone", x: 72, y: 202, width: 72, height: 34, mode: "completed", limit: 4, style: { fontSize: 10, textAlign: "center" } },
      { id: crypto.randomUUID(), type: "line", x: 16, y: 268, width: 178, height: 1, style: { borderWidth: 1, borderColor: "#0f172a" } },
      { id: crypto.randomUUID(), type: "text", x: 20, y: 272, width: 170, height: 8, content: "Address | Phone | Email | Website", style: { fontSize: 8, textAlign: "center" } }
    ]
  };
}

function safeLayout(value?: TemplateLayout | null) {
  if (value?.page && Array.isArray(value.blocks)) {
    return value;
  }

  return defaultLayout();
}

function blockLabel(block: TemplateBlock) {
  if (block.type === "dynamic_field") {
    return block.field || "dynamic field";
  }

  return block.content?.split("\n")[0]?.slice(0, 32) || block.type.replaceAll("_", " ");
}

function displayBlockContent(block: TemplateBlock) {
  if (block.type === "dynamic_field") {
    return sampleValues[block.field || ""] || block.field || "Dynamic field";
  }

  if (block.type === "signature_zone") {
    return "Signature zone";
  }

  if (block.type === "comments_zone") {
    return "Workflow comments";
  }

  if (block.type === "qr") {
    return "QR";
  }

  if (block.type === "page_number") {
    return "1";
  }

  return block.content || block.type.replaceAll("_", " ");
}

function styleForBlock(block: TemplateBlock) {
  const style = block.style || {};
  return {
    left: `${(block.x / a4Width) * 100}%`,
    top: `${(block.y / a4Height) * 100}%`,
    width: `${(block.width / a4Width) * 100}%`,
    minHeight: `${(block.height / a4Height) * 100}%`,
    color: style.color || "#111827",
    backgroundColor: style.backgroundColor || "transparent",
    borderColor: style.borderColor || "#94a3b8",
    borderStyle: style.borderStyle || "solid",
    borderWidth: `${style.borderWidth || 0}px`,
    fontSize: `${style.fontSize || 10}px`,
    fontWeight: style.fontWeight || 400,
    textAlign: style.textAlign || "start"
  } as React.CSSProperties;
}

async function safe<T>(promise: Promise<T>, fallback: T) {
  try {
    return await promise;
  } catch {
    return fallback;
  }
}

function latestEditableVersion(detail: DocumentTemplateDetail | null) {
  return detail?.versions.find((version) => ["draft", "rejected"].includes(version.status))
    || detail?.versions.find((version) => version.status === "submitted")
    || detail?.versions.find((version) => version.status === "active")
    || detail?.versions[0]
    || null;
}

export function AdminTemplatesPage() {
  const auth = useAuth();
  const [scope, setScope] = useState<TemplateScope>("visible");
  const [query, setQuery] = useState("");
  const [templates, setTemplates] = useState<DocumentTemplate[]>([]);
  const [allTemplates, setAllTemplates] = useState<DocumentTemplate[]>([]);
  const [reviewQueue, setReviewQueue] = useState<DocumentTemplateVersion[]>([]);
  const [bindings, setBindings] = useState<DocumentTemplateBinding[]>([]);
  const [documentTypes, setDocumentTypes] = useState<DocumentType[]>([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState<EntityId | null>(null);
  const [detail, setDetail] = useState<DocumentTemplateDetail | null>(null);
  const [name, setName] = useState("Official A4 Template");
  const [description, setDescription] = useState("");
  const [layout, setLayout] = useState<TemplateLayout>(defaultLayout);
  const [selectedBlockId, setSelectedBlockId] = useState<string | null>(null);
  const [bindingTypeId, setBindingTypeId] = useState<string>("all");
  const [bindingLocale, setBindingLocale] = useState<TemplateLocale>("all");
  const [bindingVariant, setBindingVariant] = useState<TemplateVariant>("official");
  const [renderDocumentId, setRenderDocumentId] = useState("");
  const [renderResult, setRenderResult] = useState("");
  const [htmlPreview, setHtmlPreview] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isAdmin = auth.isAdmin;
  const selectedVersion = latestEditableVersion(detail);
  const selectedBlock = layout.blocks.find((block) => block.id === selectedBlockId) || null;
  const canEdit = !selectedVersion || ["draft", "rejected"].includes(selectedVersion.status);
  const publishedTemplates = allTemplates.filter((template) => template.status === "published" && template.current_version_id);

  const filteredTemplates = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) {
      return templates;
    }

    return templates.filter((template) => [
      template.name,
      template.description,
      template.status,
      template.ownerDisplayName
    ].filter(Boolean).some((value) => String(value).toLowerCase().includes(normalized)));
  }, [query, templates]);

  async function refresh(nextScope = scope) {
    setError(null);
    const [templateRows, docs, allRows, queueRows, bindingRows] = await Promise.all([
      safe(templateApi.list(nextScope), [] as DocumentTemplate[]),
      safe(adminApi.documentTypes.list(), [] as DocumentType[]),
      isAdmin ? safe(templateApi.admin.listAll(), [] as DocumentTemplate[]) : safe(templateApi.list("published"), [] as DocumentTemplate[]),
      isAdmin ? safe(templateApi.admin.reviewQueue(), [] as DocumentTemplateVersion[]) : Promise.resolve([]),
      isAdmin ? safe(templateApi.admin.listBindings(), [] as DocumentTemplateBinding[]) : Promise.resolve([])
    ]);

    setTemplates(templateRows);
    setDocumentTypes(docs);
    setAllTemplates(allRows);
    setReviewQueue(queueRows);
    setBindings(bindingRows);

    const stillExists = selectedTemplateId && templateRows.some((template) => template.id === selectedTemplateId);
    if (!stillExists) {
      setSelectedTemplateId(templateRows[0]?.id || null);
    }
  }

  useEffect(() => {
    void refresh(scope);
  }, [scope, isAdmin]);

  useEffect(() => {
    let alive = true;

    async function loadDetail() {
      if (!selectedTemplateId) {
        setDetail(null);
        setLayout(defaultLayout());
        return;
      }

      const nextDetail = await safe(templateApi.get(selectedTemplateId), null as DocumentTemplateDetail | null);
      if (!alive || !nextDetail) {
        return;
      }

      const version = latestEditableVersion(nextDetail);
      setDetail(nextDetail);
      setName(nextDetail.template.name);
      setDescription(nextDetail.template.description || "");
      setLayout(safeLayout(version?.layout_definition));
      setSelectedBlockId(safeLayout(version?.layout_definition).blocks[0]?.id || null);
    }

    void loadDetail();

    return () => {
      alive = false;
    };
  }, [selectedTemplateId]);

  function setBlock(nextBlock: TemplateBlock) {
    setLayout((current) => ({
      ...current,
      blocks: current.blocks.map((block) => block.id === nextBlock.id ? nextBlock : block)
    }));
  }

  function addBlock(type: string) {
    const nextBlock: TemplateBlock = {
      id: crypto.randomUUID(),
      type,
      x: 24,
      y: 44 + layout.blocks.length * 4,
      width: type === "line" ? 160 : 64,
      height: type === "line" ? 1 : 18,
      content: type === "text" ? "New text block" : type.replaceAll("_", " "),
      field: type === "dynamic_field" ? "document.subject" : undefined,
      mode: type === "signature_zone" ? "completed" : undefined,
      limit: ["signature_zone", "comments_zone"].includes(type) ? 4 : undefined,
      style: { fontSize: 10, textAlign: "start", borderWidth: type === "box" ? 1 : 0 }
    };
    setLayout((current) => ({ ...current, blocks: [...current.blocks, nextBlock] }));
    setSelectedBlockId(nextBlock.id);
  }

  function removeSelectedBlock() {
    if (!selectedBlockId) {
      return;
    }

    setLayout((current) => ({
      ...current,
      blocks: current.blocks.filter((block) => block.id !== selectedBlockId)
    }));
    setSelectedBlockId(null);
  }

  async function handleSave() {
    setBusy(true);
    setError(null);
    try {
      const input = { name, description: description || null, layout_definition: layout };
      const saved = detail
        ? await templateApi.update(detail.template.id, input)
        : await templateApi.create(input);
      setDetail(saved);
      setSelectedTemplateId(saved.template.id);
      await refresh(scope);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not save template.");
    } finally {
      setBusy(false);
    }
  }

  async function handleCreate() {
    setDetail(null);
    setSelectedTemplateId(null);
    setName("Official A4 Template");
    setDescription("");
    const next = defaultLayout();
    setLayout(next);
    setSelectedBlockId(next.blocks[0]?.id || null);
  }

  async function handleSubmit() {
    if (!detail) {
      return;
    }

    setBusy(true);
    setError(null);
    try {
      await templateApi.submit(detail.template.id);
      await refresh(scope);
      setDetail(await templateApi.get(detail.template.id));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not submit template.");
    } finally {
      setBusy(false);
    }
  }

  async function handleClone(templateId: EntityId) {
    setBusy(true);
    setError(null);
    try {
      const cloned = await templateApi.clone(templateId);
      setScope("mine");
      setSelectedTemplateId(cloned.template.id);
      await refresh("mine");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not clone template.");
    } finally {
      setBusy(false);
    }
  }

  async function handleDeleteOrArchive() {
    if (!detail) {
      return;
    }

    setBusy(true);
    setError(null);
    try {
      if (detail.template.status === "published" && isAdmin) {
        await templateApi.admin.archive(detail.template.id);
      } else {
        await templateApi.remove(detail.template.id);
      }
      setSelectedTemplateId(null);
      await refresh(scope);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not remove template.");
    } finally {
      setBusy(false);
    }
  }

  async function approveVersion(version: DocumentTemplateVersion) {
    setBusy(true);
    setError(null);
    try {
      await templateApi.admin.approve(version.template_id, version.id);
      await refresh(scope);
      if (selectedTemplateId === version.template_id) {
        setDetail(await templateApi.get(version.template_id));
      }
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
      await refresh(scope);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not reject template.");
    } finally {
      setBusy(false);
    }
  }

  async function createBinding() {
    const selectedPublished = publishedTemplates.find((template) => template.id === selectedTemplateId) || publishedTemplates[0];
    if (!selectedPublished?.current_version_id) {
      setError("Select a published template before creating a default binding.");
      return;
    }

    setBusy(true);
    setError(null);
    try {
      await templateApi.admin.createBinding({
        document_type_id: bindingTypeId === "all" ? null : Number(bindingTypeId),
        locale: bindingLocale,
        variant: bindingVariant,
        template_id: selectedPublished.id,
        template_version_id: selectedPublished.current_version_id
      });
      await refresh(scope);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not create binding.");
    } finally {
      setBusy(false);
    }
  }

  async function uploadAsset(file: File) {
    if (!selectedBlock) {
      return;
    }

    const dataBase64 = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(file);
    });

    setBusy(true);
    setError(null);
    try {
      const asset = await templateApi.uploadAsset({
        original_filename: file.name,
        mime_type: file.type || "image/png",
        data_base64: dataBase64
      });
      setBlock({ ...selectedBlock, type: "image", src: asset.data_url });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not upload asset.");
    } finally {
      setBusy(false);
    }
  }

  async function renderDocument(output: "html" | "pdf") {
    const documentId = Number(renderDocumentId);
    if (!documentId) {
      setError("Enter a document id to render.");
      return;
    }

    setBusy(true);
    setError(null);
    try {
      const result = await templateApi.render(documentId, {
        layout_definition: layout,
        locale: bindingLocale,
        variant: bindingVariant,
        output
      });
      if (result.html) {
        setHtmlPreview(result.html);
        setRenderResult("HTML preview generated.");
      } else {
        setRenderResult(`PDF render #${result.renderId} stored at ${result.storagePath}.`);
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not render document.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4 pb-8">
      <AdminPageHeader
        actions={(
          <>
            <Button className="h-8 px-2.5 text-xs" icon="plus" onClick={handleCreate} variant="primary">New</Button>
            <Button className="h-8 px-2.5 text-xs" disabled={busy || !canEdit} icon="template" onClick={handleSave} variant="primary">Save</Button>
            <Button className="h-8 px-2.5 text-xs" disabled={busy || !detail || !canEdit} icon="upload" onClick={handleSubmit}>Submit</Button>
            <Button className="h-8 px-2.5 text-xs" disabled={busy || !detail} icon="export" onClick={() => void handleClone(detail!.template.id)}>Clone</Button>
          </>
        )}
        description="Design exact A4 formal document templates, submit drafts for approval, and bind published templates to document types."
        title="Templates"
      />

      {error ? <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">{error}</div> : null}
      {renderResult ? <div className="rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-sm font-semibold text-blue-700">{renderResult}</div> : null}

      <section className="grid min-w-0 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm xl:h-[calc(100vh-12rem)] xl:min-h-[40rem] xl:grid-cols-[17rem_minmax(0,1fr)_19rem] 2xl:grid-cols-[18rem_minmax(0,1fr)_20rem]">
        <aside className="flex min-h-0 min-w-0 flex-col border-b border-slate-200 bg-white xl:border-b-0 xl:border-r">
          <div className="border-b border-slate-200 px-4 py-3">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-base font-bold text-slate-950">Templates</h2>
              <SelectFilter className="h-8 w-28 rounded-md py-1 text-xs" onChange={(event) => setScope(event.target.value as TemplateScope)} value={scope}>
                <option value="visible">Visible</option>
                <option value="mine">Mine</option>
                <option value="published">Published</option>
                <option value="submitted">Submitted</option>
              </SelectFilter>
            </div>
            <div className="mt-3">
              <SearchInput onChange={(event) => setQuery(event.target.value)} placeholder="Search templates..." value={query} />
            </div>
          </div>

          <div className="shrink-0 overflow-y-auto px-3 py-3 xl:max-h-[22rem]">
            <div className="space-y-2">
              {filteredTemplates.map((template) => (
                <button
                  className={cx(
                    "w-full rounded-lg border px-3 py-2.5 text-start transition",
                    selectedTemplateId === template.id ? "border-blue-300 bg-blue-50" : "border-slate-200 bg-white hover:bg-slate-50"
                  )}
                  key={template.id}
                  onClick={() => setSelectedTemplateId(template.id)}
                  type="button"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-bold text-slate-950">{template.name}</p>
                      <p className="mt-1 truncate text-xs text-slate-500">{template.ownerDisplayName || "Private creator"}</p>
                    </div>
                    <StatusBadge>{template.status}</StatusBadge>
                  </div>
                  <p className="mt-2 line-clamp-2 text-xs leading-5 text-slate-600">{template.description || "No description."}</p>
                </button>
              ))}
              {!filteredTemplates.length ? <p className="rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm text-slate-500">No templates found.</p> : null}
            </div>
          </div>

          <div className="min-h-0 flex-1 border-t border-slate-200 bg-slate-50 px-3 py-3">
            <div className="mb-2 flex items-center justify-between gap-2">
              <h3 className="text-sm font-bold text-slate-950">Layers</h3>
              <span className="rounded-full bg-white px-2 py-0.5 text-xs font-semibold text-slate-600 ring-1 ring-slate-200">{layout.blocks.length}</span>
            </div>
            <div className="max-h-64 space-y-1.5 overflow-y-auto pe-1 xl:max-h-full">
              {layout.blocks.map((block) => (
                <button
                  className={cx(
                    "flex w-full items-center justify-between gap-2 rounded-md border px-2.5 py-2 text-start text-xs transition",
                    selectedBlockId === block.id ? "border-blue-300 bg-white text-blue-800 shadow-sm" : "border-transparent bg-transparent text-slate-700 hover:border-slate-200 hover:bg-white"
                  )}
                  key={block.id}
                  onClick={() => setSelectedBlockId(block.id)}
                  type="button"
                >
                  <span className="min-w-0 truncate">{blockLabel(block)}</span>
                  <span className="shrink-0 text-[10px] uppercase text-slate-400">{block.type.replaceAll("_", " ")}</span>
                </button>
              ))}
            </div>
          </div>
        </aside>

        <main className="flex min-h-0 min-w-0 flex-col bg-slate-50">
          <div className="border-b border-slate-200 bg-white px-4 py-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-base font-bold text-slate-950">A4 Designer</h2>
                <p className="mt-0.5 text-xs font-semibold text-slate-500">A4 portrait: 210 x 297 mm</p>
              </div>
              <div className="flex items-center gap-2 text-xs font-semibold text-slate-500">
                <span>{layout.blocks.length} blocks</span>
                <span className="h-1 w-1 rounded-full bg-slate-300" />
                <span>{layout.page.direction.toUpperCase()}</span>
              </div>
            </div>
            <div className="mt-3 grid gap-2 lg:grid-cols-3">
              {blockToolGroups.map((group) => (
                <div className="min-w-0" key={group.label}>
                  <p className="mb-1.5 text-[11px] font-bold uppercase text-slate-500">{group.label}</p>
                  <div className="flex flex-wrap gap-1.5">
                    {group.tools.map((type) => (
                      <Button
                        className="h-8 rounded-md px-2.5 py-1 text-xs"
                        disabled={!canEdit}
                        key={type}
                        onClick={() => addBlock(type)}
                      >
                        {type.replaceAll("_", " ")}
                      </Button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="min-h-0 flex-1 overflow-auto p-4">
            <div className="flex min-h-full justify-center rounded-xl bg-slate-200/70 p-4">
              <div
                className="relative bg-white shadow-xl ring-1 ring-slate-300"
                dir={layout.page.direction}
                style={{ aspectRatio: "210 / 297", width: "min(100%, 34rem)", backgroundColor: layout.page.backgroundColor || "#fff" }}
              >
                {layout.blocks.map((block) => (
                  <button
                    className={cx(
                      "absolute overflow-hidden whitespace-pre-wrap p-1.5 text-start leading-relaxed outline-none transition",
                      selectedBlockId === block.id ? "ring-2 ring-blue-500" : "hover:ring-1 hover:ring-blue-300",
                      block.type === "line" && "p-0",
                      block.type === "qr" && "flex items-center justify-center border border-dashed border-slate-400 text-center text-[10px]",
                      block.type === "image" || block.type === "logo" ? "flex items-center justify-center p-0" : ""
                    )}
                    key={block.id}
                    onClick={() => setSelectedBlockId(block.id)}
                    style={styleForBlock(block)}
                    type="button"
                  >
                    {block.src && ["image", "logo"].includes(block.type) ? (
                      <img alt="" className="h-full w-full object-contain" src={block.src} />
                    ) : (
                      displayBlockContent(block)
                    )}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </main>

        <aside className="flex min-h-0 min-w-0 flex-col border-t border-slate-200 bg-white xl:border-l xl:border-t-0">
          <div className="flex items-center justify-between gap-3 border-b border-slate-200 px-4 py-3">
            <div className="min-w-0">
              <h2 className="text-base font-bold text-slate-950">Properties</h2>
              <p className="mt-0.5 truncate text-xs font-semibold text-slate-500">{selectedBlock ? blockLabel(selectedBlock) : "Template settings"}</p>
            </div>
            {detail ? <StatusBadge>{detail.template.status}</StatusBadge> : null}
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto">
            <section className="space-y-3 border-b border-slate-200 px-4 py-4">
              <div className="flex items-center justify-between gap-3">
                <h3 className="text-sm font-bold text-slate-950">Template</h3>
                {detail ? <Button className="h-8 px-2.5 text-xs" disabled={busy} icon="x" onClick={handleDeleteOrArchive} variant="danger">{detail.template.status === "published" ? "Archive" : "Delete"}</Button> : null}
              </div>
              <label className="block text-xs font-bold text-slate-600">
                Name
                <input className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm" disabled={!canEdit} onChange={(event) => setName(event.target.value)} value={name} />
              </label>
              <label className="block text-xs font-bold text-slate-600">
                Description
                <textarea className="mt-1 min-h-20 w-full rounded-md border border-slate-300 px-3 py-2 text-sm" disabled={!canEdit} onChange={(event) => setDescription(event.target.value)} value={description} />
              </label>
              <div className="grid grid-cols-2 gap-2">
                <label className="text-xs font-bold text-slate-600">
                  Direction
                  <SelectFilter
                    className="mt-1 h-10 w-full rounded-md"
                    disabled={!canEdit}
                    onChange={(event) => setLayout((current) => ({ ...current, page: { ...current.page, direction: event.target.value as "rtl" | "ltr" } }))}
                    value={layout.page.direction}
                  >
                    <option value="rtl">RTL</option>
                    <option value="ltr">LTR</option>
                  </SelectFilter>
                </label>
                <label className="text-xs font-bold text-slate-600">
                  Background
                  <input
                    className="mt-1 h-10 w-full rounded-md border border-slate-300 bg-white px-2"
                    disabled={!canEdit}
                    onChange={(event) => setLayout((current) => ({ ...current, page: { ...current.page, backgroundColor: event.target.value } }))}
                    type="color"
                    value={layout.page.backgroundColor || "#ffffff"}
                  />
                </label>
              </div>
            </section>

            <section className="space-y-3 border-b border-slate-200 px-4 py-4">
              <div className="flex items-center justify-between gap-3">
                <h3 className="text-sm font-bold text-slate-950">Selected Block</h3>
                {selectedBlock ? <IconButton className="h-8 w-8 rounded-md" disabled={!canEdit} icon="x" label="Remove block" onClick={removeSelectedBlock} /> : null}
              </div>
              {selectedBlock ? (
                <div className="space-y-3">
                  <div className="grid grid-cols-2 gap-2">
                    {(["x", "y", "width", "height"] as const).map((key) => (
                      <label className="text-xs font-bold text-slate-600" key={key}>
                        {key.toUpperCase()} mm
                        <input
                          className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                          disabled={!canEdit}
                          min={key === "width" || key === "height" ? 1 : 0}
                          onChange={(event) => setBlock({ ...selectedBlock, [key]: Number(event.target.value) })}
                          type="number"
                          value={selectedBlock[key]}
                        />
                      </label>
                    ))}
                  </div>
                  <label className="block text-xs font-bold text-slate-600">
                    Type
                    <SelectFilter className="mt-1 w-full rounded-md" disabled={!canEdit} onChange={(event) => setBlock({ ...selectedBlock, type: event.target.value })} value={selectedBlock.type}>
                      {["text", "rich_text", "dynamic_field", "image", "logo", "box", "line", "table", "signature_zone", "comments_zone", "cc_list", "qr", "watermark", "page_number"].map((type) => (
                        <option key={type} value={type}>{type.replaceAll("_", " ")}</option>
                      ))}
                    </SelectFilter>
                  </label>
                  {selectedBlock.type === "dynamic_field" ? (
                    <label className="block text-xs font-bold text-slate-600">
                      Field
                      <SelectFilter className="mt-1 w-full rounded-md" disabled={!canEdit} onChange={(event) => setBlock({ ...selectedBlock, field: event.target.value })} value={selectedBlock.field || fields[0]}>
                        {fields.map((field) => <option key={field} value={field}>{field}</option>)}
                      </SelectFilter>
                    </label>
                  ) : null}
                  {["text", "rich_text", "watermark", "cc_list"].includes(selectedBlock.type) ? (
                    <label className="block text-xs font-bold text-slate-600">
                      Content
                      <textarea className="mt-1 min-h-24 w-full rounded-md border border-slate-300 px-3 py-2 text-sm" disabled={!canEdit} onChange={(event) => setBlock({ ...selectedBlock, content: event.target.value })} value={selectedBlock.content || ""} />
                    </label>
                  ) : null}
                  {["image", "logo"].includes(selectedBlock.type) ? (
                    <label className="block text-xs font-bold text-slate-600">
                      Image asset
                      <input className="mt-1 w-full text-sm" disabled={!canEdit || busy} onChange={(event) => event.target.files?.[0] ? void uploadAsset(event.target.files[0]) : undefined} type="file" />
                    </label>
                  ) : null}
                  <div className="grid grid-cols-2 gap-2">
                    <label className="text-xs font-bold text-slate-600">
                      Font
                      <input className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm" disabled={!canEdit} onChange={(event) => setBlock({ ...selectedBlock, style: { ...selectedBlock.style, fontSize: Number(event.target.value) } })} type="number" value={selectedBlock.style?.fontSize || 10} />
                    </label>
                    <label className="text-xs font-bold text-slate-600">
                      Border
                      <input className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm" disabled={!canEdit} onChange={(event) => setBlock({ ...selectedBlock, style: { ...selectedBlock.style, borderWidth: Number(event.target.value) } })} type="number" value={selectedBlock.style?.borderWidth || 0} />
                    </label>
                    <label className="text-xs font-bold text-slate-600">
                      Text Color
                      <input className="mt-1 h-10 w-full rounded-md border border-slate-300 px-2" disabled={!canEdit} onChange={(event) => setBlock({ ...selectedBlock, style: { ...selectedBlock.style, color: event.target.value } })} type="color" value={selectedBlock.style?.color || "#111827"} />
                    </label>
                    <label className="text-xs font-bold text-slate-600">
                      Fill
                      <input className="mt-1 h-10 w-full rounded-md border border-slate-300 px-2" disabled={!canEdit} onChange={(event) => setBlock({ ...selectedBlock, style: { ...selectedBlock.style, backgroundColor: event.target.value } })} type="color" value={selectedBlock.style?.backgroundColor || "#ffffff"} />
                    </label>
                  </div>
                </div>
              ) : (
                <p className="text-sm text-slate-500">Select a block on the A4 page.</p>
              )}
            </section>

            <section className="space-y-3 border-b border-slate-200 px-4 py-4">
              <h3 className="text-sm font-bold text-slate-950">Output</h3>
              <label className="block text-xs font-bold text-slate-600">
                Document ID
                <input className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm" onChange={(event) => setRenderDocumentId(event.target.value)} value={renderDocumentId} />
              </label>
              <div className="grid grid-cols-2 gap-2">
                <SelectFilter className="w-full rounded-md" onChange={(event) => setBindingLocale(event.target.value as TemplateLocale)} value={bindingLocale}>
                  {locales.map((locale) => <option key={locale} value={locale}>{locale}</option>)}
                </SelectFilter>
                <SelectFilter className="w-full rounded-md" onChange={(event) => setBindingVariant(event.target.value as TemplateVariant)} value={bindingVariant}>
                  {variants.map((variant) => <option key={variant} value={variant}>{variant}</option>)}
                </SelectFilter>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <Button className="h-9 px-2" disabled={busy} icon="view" onClick={() => void renderDocument("html")}>Preview</Button>
                <Button className="h-9 px-2" disabled={busy} icon="export" onClick={() => void renderDocument("pdf")} variant="primary">PDF</Button>
              </div>
            </section>

            {isAdmin ? (
              <section className="space-y-3 px-4 py-4">
                <h3 className="text-sm font-bold text-slate-950">Default Binding</h3>
                <SelectFilter className="w-full rounded-md" onChange={(event) => setBindingTypeId(event.target.value)} value={bindingTypeId}>
                  <option value="all">All document types</option>
                  {documentTypes.map((type) => <option key={type.id} value={type.id}>{type.name}</option>)}
                </SelectFilter>
                <div className="grid grid-cols-2 gap-2">
                  <SelectFilter className="w-full rounded-md" onChange={(event) => setBindingLocale(event.target.value as TemplateLocale)} value={bindingLocale}>
                    {locales.map((locale) => <option key={locale} value={locale}>{locale}</option>)}
                  </SelectFilter>
                  <SelectFilter className="w-full rounded-md" onChange={(event) => setBindingVariant(event.target.value as TemplateVariant)} value={bindingVariant}>
                    {variants.map((variant) => <option key={variant} value={variant}>{variant}</option>)}
                  </SelectFilter>
                </div>
                <Button className="w-full" disabled={busy || !publishedTemplates.length} icon="settings" onClick={createBinding} variant="primary">
                  Bind Template
                </Button>
              </section>
            ) : null}
          </div>
        </aside>
      </section>

      {htmlPreview ? (
        <PanelCard title="Server HTML Preview">
          <iframe className="h-[32rem] w-full rounded-lg border border-slate-200 bg-white" srcDoc={htmlPreview} title="Template HTML preview" />
        </PanelCard>
      ) : null}

      {isAdmin ? (
        <section className="grid min-w-0 gap-4">
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
                      <Button className="px-2 py-1 text-xs" disabled={busy} onClick={() => void approveVersion(row)} variant="primary">Approve</Button>
                      <Button className="px-2 py-1 text-xs" disabled={busy} onClick={() => void rejectVersion(row)} variant="danger">Reject</Button>
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
                { key: "status", header: "Status", cell: (row) => <StatusBadge>{row.status}</StatusBadge> }
              ]}
              emptyLabel="No template bindings configured."
              getRowKey={(row) => row.id}
              rows={bindings}
            />
          </PanelCard>
        </section>
      ) : null}
    </div>
  );
}
