import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { adminApi, templateApi } from "../../../api";
import type { DocumentTemplateBinding, DocumentTemplateDetail, DocumentType, TemplateLayout, TemplateLocale, TemplateVariant } from "../../../api";
import { useAuth } from "../../../app/AuthContext";
import { Button, PanelCard, SelectFilter, StatusBadge } from "../../../components/ui";
import { cx } from "../../../lib/classNames";
import type { PreviewScenario } from "../../../components/admin/templates/builder";
import { PreviewPanel, TemplateA4Preview } from "./TemplatePreview";
import { activeLayout, documentTypeIdFromLayout, latestEditableVersion, locales, safe, variants } from "./templateBuilderModel";
import { isWordTemplateLayout, wordTemplateZones } from "./wordTemplateModel";

const scenarioOptions: Array<{ label: string; value: PreviewScenario }> = [
  { label: "Standard", value: "standard" },
  { label: "Long body", value: "longBody" },
  { label: "Three signatures", value: "threeSignatures" },
  { label: "With copies", value: "withCc" }
];

const previewShellCss = `
<style>
@media screen {
  html { background: #e5e7eb; }
  body {
    min-width: 100%;
    margin: 0;
    padding: 24px;
    box-sizing: border-box;
    background: #e5e7eb !important;
    direction: ltr;
  }
  .dc-word-page,
  .dc-page {
    margin-inline: auto;
    box-shadow: 0 18px 50px rgba(15, 23, 42, .18);
  }
  html[dir="rtl"] .dc-word-page,
  html[dir="rtl"] .dc-page {
    direction: rtl;
  }
  html[dir="ltr"] .dc-word-page,
  html[dir="ltr"] .dc-page {
    direction: ltr;
  }
  .dc-page:not(:last-child) {
    margin-bottom: 24px;
  }
}
@media screen and (max-width: 900px) {
  body { padding: 16px; }
}
@media screen and (max-width: 1100px) {
  body { padding: 12px; }
}
@media screen and (max-width: 700px) {
  body {
    --dc-preview-scale: min(1, calc((100vw - 24px) / 794px));
    overflow-x: hidden;
  }
  .dc-word-page,
  .dc-page {
    margin-inline: 0;
    transform: scale(var(--dc-preview-scale));
    transform-origin: top left;
  }
  .dc-word-page {
    margin-bottom: calc((297mm * var(--dc-preview-scale)) - 297mm + 16px);
  }
  .dc-page:not(:last-child) {
    margin-bottom: calc((297mm * var(--dc-preview-scale)) - 297mm + 24px);
  }
}
</style>`;

function previewHtmlForFrame(html: string) {
  if (!html) {
    return "";
  }
  if (html.includes("</head>")) {
    return html.replace("</head>", `${previewShellCss}</head>`);
  }
  return `${previewShellCss}${html}`;
}

function displayStatus(status = "") {
  return status.replaceAll("_", " ");
}

function localeLabel(locale: TemplateLocale) {
  const labels: Record<TemplateLocale, string> = {
    all: "All languages",
    en: "English",
    "fa-AF": "Dari",
    "ps-AF": "Pashto"
  };
  return labels[locale] || locale;
}

function variantLabel(variant: TemplateVariant) {
  const labels: Record<TemplateVariant, string> = {
    archive: "Archive",
    internal: "Internal",
    official: "Official",
    routing_sheet: "Routing sheet"
  };
  return labels[variant] || variant.replaceAll("_", " ");
}

function targetDocumentTypeName(documentTypeId: string, documentTypes: DocumentType[]) {
  if (documentTypeId === "all") {
    return "All document types";
  }
  return documentTypes.find((type) => String(type.id) === documentTypeId)?.name || `Document type #${documentTypeId}`;
}

function ScenarioSelect({
  className = "",
  onChange,
  value
}: {
  className?: string;
  onChange: (scenario: PreviewScenario) => void;
  value: PreviewScenario;
}) {
  return (
    <SelectFilter className={className} onChange={(event) => onChange(event.target.value as PreviewScenario)} value={value}>
      {scenarioOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
    </SelectFilter>
  );
}

function sampleBodyForScenario(scenario: PreviewScenario) {
  if (scenario === "longBody") {
    return [
      "این متن نمونه برای بررسی قالب رسمی سند است. کاربر نهایی فقط بخش های قابل ویرایش را تکمیل می کند و چوکات رسمی سند ثابت باقی می ماند.",
      "در این حالت متن طولانی تر استفاده شده است تا فاصله ها، جدول ها، سرصفحه، امضا و جایگاه محتوای اصلی در پیش نمایش بررسی شود.",
      "سیستم باید برای اسناد دانشگاهی مانند مکتوب، پیشنهاد، راپور و سایر انواع اسناد رسمی قابل استفاده باشد."
    ].join("\n\n");
  }
  return "این متن نمونه برای پیش نمایش قالب رسمی سند است. متن اصلی سند در زمان ایجاد توسط کاربر کارمند جایگزین می شود.";
}

function WordServerPreview({
  className = "",
  layout,
  scenario,
  variant = "embedded"
}: {
  className?: string;
  layout: TemplateLayout;
  scenario: PreviewScenario;
  variant?: "embedded" | "fullscreen" | "compact";
}) {
  const [html, setHtml] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const documentTypeId = documentTypeIdFromLayout(layout);
  const minHeightClass = variant === "fullscreen" ? "min-h-[calc(100vh-7rem)]" : variant === "compact" ? "min-h-[30rem]" : "min-h-[42rem]";
  const iframeClassName = variant === "fullscreen"
    ? "h-full min-h-[calc(100vh-7rem)] w-full border-0 bg-slate-200"
    : variant === "compact"
      ? "h-[32rem] w-full rounded-md border border-slate-200 bg-white"
      : "h-full min-h-[42rem] w-full rounded-md border border-slate-200 bg-white";
  const templateFields = useMemo(() => Object.fromEntries(
    wordTemplateZones(layout)
      .filter((zone) => !["subject", "body"].includes(zone.key))
      .map((zone) => [zone.key, zone.kind === "recipient" ? "اداره محترم مربوط" : zone.placeholder || zone.label])
  ), [layout]);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setError("");
    templateApi.preview({
      body: sampleBodyForScenario(scenario),
      document_date: new Date().toISOString().slice(0, 10),
      document_type_id: documentTypeId,
      layout_definition: layout,
      locale: "all",
      subject: "موضوع نمونه قالب رسمی",
      summary: null,
      template_fields: templateFields,
      variant: "official"
    })
      .then((result) => {
        if (alive) {
          setHtml(result.html || "");
        }
      })
      .catch((caught) => {
        if (alive) {
          setError(caught instanceof Error ? caught.message : "Could not render preview.");
        }
      })
      .finally(() => {
        if (alive) {
          setLoading(false);
        }
      });
    return () => {
      alive = false;
    };
  }, [documentTypeId, layout, scenario, templateFields]);

  if (error) {
    return <div className={cx("grid place-items-center rounded-md border border-red-200 bg-red-50 p-6 text-sm font-semibold text-red-700", minHeightClass, className)}>{error}</div>;
  }
  if (loading && !html) {
    return <div className={cx("grid place-items-center rounded-md border border-slate-200 bg-slate-50 p-6 text-sm font-semibold text-slate-600", minHeightClass, className)}>Rendering preview...</div>;
  }
  return <iframe className={cx(iframeClassName, className)} srcDoc={previewHtmlForFrame(html)} title="Word template preview" />;
}

function FullScreenReview({
  busy,
  canApprove,
  layout,
  onApprove,
  onBackToBuilder,
  onClose,
  publishSummary,
  scenario,
  setScenario,
  status,
  templateName
}: {
  busy: boolean;
  canApprove: boolean;
  layout: ReturnType<typeof activeLayout>;
  onApprove: () => void;
  onBackToBuilder: () => void;
  onClose: () => void;
  publishSummary: string;
  scenario: PreviewScenario;
  setScenario: (scenario: PreviewScenario) => void;
  status: string;
  templateName: string;
}) {
  useEffect(() => {
    const previousHtmlOverflow = document.documentElement.style.overflow;
    const previousOverflow = document.body.style.overflow;
    document.documentElement.style.overflow = "hidden";
    document.body.style.overflow = "hidden";
    return () => {
      document.documentElement.style.overflow = previousHtmlOverflow;
      document.body.style.overflow = previousOverflow;
    };
  }, []);

  return (
    <div className="fixed inset-0 z-50 flex h-dvh w-dvw flex-col overflow-hidden bg-slate-950 text-white">
      <header className="flex min-w-0 flex-wrap items-center justify-between gap-3 border-b border-white/10 bg-slate-950 px-4 py-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <p className="truncate text-base font-black">{templateName}</p>
            <span className="rounded-full border border-white/15 px-2 py-0.5 text-xs font-bold text-slate-300">{displayStatus(status)}</span>
          </div>
          <p className="mt-1 truncate text-xs font-semibold text-slate-300">{publishSummary}</p>
        </div>
        <div className="flex flex-wrap items-center justify-end gap-2">
          <ScenarioSelect className="h-9 w-40 rounded-md border-white/20 bg-white py-1 text-xs text-slate-900" onChange={setScenario} value={scenario} />
          <Button className="border-white/20 bg-white/10 text-white hover:bg-white/15" icon="edit" onClick={onBackToBuilder}>Edit</Button>
          <Button className="border-white bg-white text-[#061d49] hover:bg-slate-100" disabled={busy || !canApprove} icon="shield" onClick={onApprove}>{busy ? "Working..." : "Approve & Publish"}</Button>
          <Button className="border-white/20 bg-white/10 text-white hover:bg-white/15" icon="x" onClick={onClose}>Close</Button>
        </div>
      </header>
      <div className="min-h-0 flex-1 overflow-hidden bg-slate-900">
        {isWordTemplateLayout(layout) ? (
          <WordServerPreview className="h-full" layout={layout} scenario={scenario} variant="fullscreen" />
        ) : (
          <div className="h-full overflow-auto p-4">
            <TemplateA4Preview layout={layout} scenario={scenario} selectedBlockId={null} zoom={1.08} />
          </div>
        )}
      </div>
    </div>
  );
}

export function AdminTemplatePublishPage() {
  const { templateId } = useParams();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const auth = useAuth();
  const [detail, setDetail] = useState<DocumentTemplateDetail | null>(null);
  const [documentTypes, setDocumentTypes] = useState<DocumentType[]>([]);
  const [bindings, setBindings] = useState<DocumentTemplateBinding[]>([]);
  const [bindingTypeId, setBindingTypeId] = useState("all");
  const [bindingLocale, setBindingLocale] = useState<TemplateLocale>("all");
  const [bindingVariant, setBindingVariant] = useState<TemplateVariant>("official");
  const [renderDocumentId, setRenderDocumentId] = useState("");
  const [renderLocale, setRenderLocale] = useState<TemplateLocale>("all");
  const [renderVariant, setRenderVariant] = useState<TemplateVariant>("official");
  const [renderResult, setRenderResult] = useState("");
  const [htmlPreview, setHtmlPreview] = useState("");
  const [scenario, setScenario] = useState<PreviewScenario>("standard");
  const [zoom, setZoom] = useState(0.9);
  const [reviewOpen, setReviewOpen] = useState(searchParams.get("review") === "1");
  const [bindingInitialized, setBindingInitialized] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [actionMessage, setActionMessage] = useState("");

  async function refresh() {
    if (!templateId) {
      return;
    }

    setError(null);
    const [nextDetail, docs, bindingRows] = await Promise.all([
      safe(templateApi.get(Number(templateId)), null as DocumentTemplateDetail | null),
      safe(adminApi.documentTypes.list(), [] as DocumentType[]),
      auth.isAdmin ? safe(templateApi.admin.listBindings(), [] as DocumentTemplateBinding[]) : Promise.resolve([])
    ]);
    setDetail(nextDetail);
    setDocumentTypes(docs);
    setBindings(bindingRows);
  }

  useEffect(() => {
    void refresh();
  }, [templateId, auth.isAdmin]);

  useEffect(() => {
    setReviewOpen(searchParams.get("review") === "1");
  }, [searchParams]);

  useEffect(() => {
    setBindingInitialized(false);
  }, [templateId]);

  useEffect(() => {
    setHtmlPreview("");
    setRenderResult("");
  }, [renderDocumentId, renderLocale, renderVariant, templateId]);

  const layout = activeLayout(detail);
  const version = latestEditableVersion(detail);
  const submittedVersion = detail?.versions.find((item) => item.status === "submitted") || null;
  const canSubmit = Boolean(detail && version && ["draft", "rejected"].includes(version.status));
  const canApprove = Boolean(auth.isAdmin && detail && submittedVersion);
  const canBind = Boolean(auth.isAdmin && detail?.template.status === "published" && detail.template.current_version_id);
  const activeDocumentTypes = documentTypes.filter((type) => type.status === "active");
  const canApproveAndPublish = Boolean(detail && auth.isAdmin && (canSubmit || submittedVersion || detail.template.status === "published"));
  const activeBindings = bindings.filter((binding) => binding.status === "active");
  const activeBindingsForTemplate = detail ? activeBindings.filter((binding) => binding.template_id === detail.template.id) : [];
  const selectedTargetBindingCount = activeBindingsForTemplate.filter((binding) => (
    (bindingTypeId === "all" ? binding.document_type_id == null : binding.document_type_id === Number(bindingTypeId))
    && binding.locale === bindingLocale
    && binding.variant === bindingVariant
  )).length;
  const publishTargetName = targetDocumentTypeName(bindingTypeId, activeDocumentTypes);
  const publishSummary = `${publishTargetName} / ${localeLabel(bindingLocale)} / ${variantLabel(bindingVariant)}`;
  const publishButtonLabel = canSubmit || submittedVersion ? "Approve, Publish & Bind" : "Bind Published Template";
  const canRunPublishAction = Boolean(auth.isAdmin && detail && (detail.template.status === "published" ? canBind : canApproveAndPublish));

  useEffect(() => {
    if (bindingInitialized || !detail) {
      return;
    }

    const preferredDocumentTypeId = documentTypeIdFromLayout(layout);
    if (preferredDocumentTypeId && activeDocumentTypes.some((type) => type.id === preferredDocumentTypeId)) {
      setBindingTypeId(String(preferredDocumentTypeId));
    }
    setBindingInitialized(true);
  }, [activeDocumentTypes, bindingInitialized, detail, layout]);

  async function handleSubmit() {
    if (!detail) {
      return;
    }

    setBusy(true);
    setError(null);
    try {
      await templateApi.submit(detail.template.id);
      await refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not submit template.");
    } finally {
      setBusy(false);
    }
  }

  async function approvePublishAndBind() {
    if (!detail) {
      return;
    }

    setBusy(true);
    setError(null);
    setActionMessage("");
    try {
      let nextDetail = detail;
      let nextSubmittedVersion = nextDetail.versions.find((item) => item.status === "submitted") || null;

      if (!nextSubmittedVersion) {
        const nextVersion = latestEditableVersion(nextDetail);
        if (nextVersion && ["draft", "rejected"].includes(nextVersion.status)) {
          nextDetail = await templateApi.submit(nextDetail.template.id);
          nextSubmittedVersion = nextDetail.versions.find((item) => item.status === "submitted") || null;
        }
      }

      if (nextSubmittedVersion) {
        nextDetail = await templateApi.admin.approve(nextDetail.template.id, nextSubmittedVersion.id);
      } else if (nextDetail.template.status !== "published") {
        throw new Error("Template must have a submitted or draft version before it can be published.");
      }

      if (nextDetail.template.current_version_id) {
        await templateApi.admin.createBinding({
          document_type_id: bindingTypeId === "all" ? null : Number(bindingTypeId),
          locale: bindingLocale,
          variant: bindingVariant,
          template_id: nextDetail.template.id,
          template_version_id: nextDetail.template.current_version_id
        });
      }

      setDetail(nextDetail);
      setActionMessage(bindingTypeId === "all" ? "Template published for all document types." : "Template published and bound to the selected document type.");
      closeReview();
      await refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not publish template.");
    } finally {
      setBusy(false);
    }
  }

  async function handleReject() {
    if (!detail || !submittedVersion) {
      return;
    }

    const note = window.prompt("Reason for rejection");
    if (!note?.trim()) {
      return;
    }

    setBusy(true);
    setError(null);
    try {
      await templateApi.admin.reject(detail.template.id, submittedVersion.id, note.trim());
      await refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not reject template.");
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
    setRenderResult("");
    try {
      const result = await templateApi.render(documentId, {
        layout_definition: layout,
        locale: renderLocale,
        variant: renderVariant,
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

  function openReview() {
    setReviewOpen(true);
    const next = new URLSearchParams(searchParams);
    next.set("review", "1");
    setSearchParams(next, { replace: true });
  }

  function closeReview() {
    setReviewOpen(false);
    const next = new URLSearchParams(searchParams);
    next.delete("review");
    setSearchParams(next, { replace: true });
  }

  if (!detail && !error) {
    return <PanelCard title="Publish Template"><p className="text-sm text-slate-600">Loading template...</p></PanelCard>;
  }

  return (
    <div className="space-y-4">
      {error ? <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">{error}</div> : null}
      {renderResult ? <div className="rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-sm font-semibold text-blue-700">{renderResult}</div> : null}
      {actionMessage ? <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-700">{actionMessage}</div> : null}

      {reviewOpen && detail ? (
        <FullScreenReview
          busy={busy}
          canApprove={canRunPublishAction}
          layout={layout}
          onApprove={() => void approvePublishAndBind()}
          onBackToBuilder={() => navigate(`/admin/templates/builder/${detail.template.id}`)}
          onClose={closeReview}
          publishSummary={publishSummary}
          scenario={scenario}
          setScenario={setScenario}
          status={detail.template.status}
          templateName={detail.template.name}
        />
      ) : null}

      <section className="rounded-lg border border-slate-200 bg-white px-4 py-4 shadow-sm shadow-slate-900/5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <StatusBadge>{detail?.template.status || "unknown"}</StatusBadge>
              {version ? <span className="text-xs font-bold text-slate-500">v{version.version_number} {displayStatus(version.status)}</span> : null}
            </div>
            <h1 className="mt-2 text-2xl font-black text-slate-950">{detail?.template.name}</h1>
            <p className="mt-1 max-w-3xl text-sm leading-6 text-slate-600">{detail?.template.description || "No description."}</p>
          </div>
          <div className="flex flex-wrap items-center justify-end gap-2">
            <Button disabled={busy || !detail} icon="edit" onClick={() => navigate(`/admin/templates/builder/${detail!.template.id}`)}>Back to Builder</Button>
            <Button disabled={!detail} icon="fullscreen" onClick={openReview}>Fullscreen Review</Button>
          </div>
        </div>
      </section>

      <div className="grid gap-4 xl:grid-cols-[minmax(19rem,21rem)_minmax(0,1fr)]">
        <aside className="min-w-0 space-y-4">
          {auth.isAdmin ? (
            <PanelCard
              title="Publish Target"
              actions={<StatusBadge tone={detail?.template.status === "published" ? "green" : "blue"}>{detail?.template.status === "published" ? "published" : "review"}</StatusBadge>}
            >
              <div className="space-y-4">
                {canApprove ? (
                  <div className="rounded-lg border border-blue-100 bg-blue-50 px-3 py-2">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="text-xs font-semibold text-blue-800">Version {submittedVersion?.version_number} is waiting for admin review.</p>
                      <Button className="min-h-8 px-2.5 py-1 text-xs" disabled={busy} icon="x" onClick={() => void handleReject()} variant="danger">Reject</Button>
                    </div>
                  </div>
                ) : null}

                <label className="block text-xs font-bold text-slate-600">
                  Document type
                  <SelectFilter className="mt-1 w-full rounded-md" onChange={(event) => setBindingTypeId(event.target.value)} value={bindingTypeId}>
                    <option value="all">All document types</option>
                    {activeDocumentTypes.map((type) => <option key={type.id} value={type.id}>{type.name}</option>)}
                  </SelectFilter>
                </label>

                <div className="grid grid-cols-2 gap-2">
                  <label className="block text-xs font-bold text-slate-600">
                    Language
                    <SelectFilter className="mt-1 w-full rounded-md" onChange={(event) => setBindingLocale(event.target.value as TemplateLocale)} value={bindingLocale}>
                      {locales.map((locale) => <option key={locale} value={locale}>{localeLabel(locale)}</option>)}
                    </SelectFilter>
                  </label>
                  <label className="block text-xs font-bold text-slate-600">
                    Variant
                    <SelectFilter className="mt-1 w-full rounded-md" onChange={(event) => setBindingVariant(event.target.value as TemplateVariant)} value={bindingVariant}>
                      {variants.map((variant) => <option key={variant} value={variant}>{variantLabel(variant)}</option>)}
                    </SelectFilter>
                  </label>
                </div>

                <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-3">
                  <p className="text-xs font-black uppercase tracking-wide text-slate-500">Selected binding</p>
                  <p className="mt-1 text-sm font-black text-slate-950">{publishSummary}</p>
                  <p className="mt-1 text-xs font-semibold text-slate-500">
                    {selectedTargetBindingCount ? `${selectedTargetBindingCount} active binding already matches this target.` : "No active binding matches this target yet."}
                  </p>
                </div>

                <Button className="w-full" disabled={busy || !canRunPublishAction} icon="shield" onClick={() => void approvePublishAndBind()} variant="primary">
                  {busy ? "Working..." : publishButtonLabel}
                </Button>
              </div>
            </PanelCard>
          ) : (
            <PanelCard title="Submit for Approval" actions={detail ? <StatusBadge>{detail.template.status}</StatusBadge> : null}>
              <div className="space-y-3">
                <p className="text-sm font-semibold text-slate-600">{version ? `Version ${version.version_number} / ${displayStatus(version.status)}` : "No editable version available."}</p>
                <Button className="w-full" disabled={busy || !canSubmit} icon="upload" onClick={() => void handleSubmit()} variant="primary">
                  {detail?.template.status === "submitted" ? "Submitted for Review" : "Submit for Approval"}
                </Button>
              </div>
            </PanelCard>
          )}

          <PanelCard title="Test Render">
            <div className="space-y-3">
              <label className="block text-xs font-bold text-slate-600">
                Document ID
                <input className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm" inputMode="numeric" onChange={(event) => setRenderDocumentId(event.target.value)} value={renderDocumentId} />
              </label>
              <div className="grid grid-cols-2 gap-2">
                <label className="block text-xs font-bold text-slate-600">
                  Language
                  <SelectFilter className="mt-1 w-full rounded-md" onChange={(event) => setRenderLocale(event.target.value as TemplateLocale)} value={renderLocale}>
                    {locales.map((locale) => <option key={locale} value={locale}>{localeLabel(locale)}</option>)}
                  </SelectFilter>
                </label>
                <label className="block text-xs font-bold text-slate-600">
                  Variant
                  <SelectFilter className="mt-1 w-full rounded-md" onChange={(event) => setRenderVariant(event.target.value as TemplateVariant)} value={renderVariant}>
                    {variants.map((variant) => <option key={variant} value={variant}>{variantLabel(variant)}</option>)}
                  </SelectFilter>
                </label>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <Button disabled={busy} icon="view" onClick={() => void renderDocument("html")}>HTML Preview</Button>
                <Button disabled={busy} icon="export" onClick={() => void renderDocument("pdf")} variant="primary">PDF</Button>
              </div>
            </div>
          </PanelCard>

          {auth.isAdmin ? (
            <PanelCard title="Template Bindings" actions={<StatusBadge tone="blue">{String(activeBindingsForTemplate.length)}</StatusBadge>}>
              {activeBindingsForTemplate.length ? (
                <div className="space-y-2">
                  {activeBindingsForTemplate.slice(0, 4).map((binding) => (
                    <div className="rounded-md border border-slate-200 bg-white px-3 py-2" key={binding.id}>
                      <p className="truncate text-sm font-bold text-slate-950">{binding.documentTypeName || "All document types"}</p>
                      <p className="mt-1 text-xs font-semibold text-slate-500">{localeLabel(binding.locale)} / {variantLabel(binding.variant)} / v{binding.templateVersionNumber || binding.template_version_id}</p>
                    </div>
                  ))}
                  {activeBindingsForTemplate.length > 4 ? <p className="text-xs font-semibold text-slate-500">{activeBindingsForTemplate.length - 4} more active bindings.</p> : null}
                </div>
              ) : (
                <p className="text-sm leading-6 text-slate-600">This template has no active bindings yet.</p>
              )}
            </PanelCard>
          ) : null}
        </aside>

        <div className="min-w-0 space-y-4">
          {isWordTemplateLayout(layout) ? (
            <PanelCard
              actions={(
                <div className="flex flex-wrap items-center gap-2">
                  <ScenarioSelect className="h-9 w-40 rounded-md text-sm" onChange={setScenario} value={scenario} />
                  <Button className="min-h-9 px-3 py-1.5 text-xs" icon="fullscreen" onClick={openReview}>Review</Button>
                </div>
              )}
              bodyClassName="flex min-h-0 flex-1 p-2"
              className="flex min-h-[38rem] flex-col xl:sticky xl:top-24 xl:h-[calc(100vh-7rem)]"
              headerClassName="flex-wrap"
              title="Template Preview"
            >
              <WordServerPreview className="flex-1" layout={layout} scenario={scenario} />
            </PanelCard>
          ) : (
            <PreviewPanel
              layout={layout}
              scenario={scenario}
              setScenario={setScenario}
              setZoom={setZoom}
              title="Template Preview"
              zoom={zoom}
            />
          )}

          {htmlPreview ? (
            <PanelCard title="Document Data Preview">
              <iframe className="h-[32rem] w-full rounded-md border border-slate-200 bg-white" srcDoc={previewHtmlForFrame(htmlPreview)} title="Template HTML preview" />
            </PanelCard>
          ) : null}
        </div>
      </div>
    </div>
  );
}
