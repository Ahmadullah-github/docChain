import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { adminApi, templateApi } from "../../../api";
import type {
  DocumentTemplateBinding,
  DocumentTemplateDetail,
  DocumentType,
  EntityId,
  TemplateLayout,
  TemplateLocale,
  TemplateVariant
} from "../../../api";
import { useAuth } from "../../../app/AuthContext";
import {
  headerTemplateField,
  scenarioValues,
  templateFieldPrefix,
  type PreviewScenario
} from "../../../components/admin/templates/builder";
import { Button, Icon, PanelCard, SelectFilter, StatusBadge } from "../../../components/ui";
import type { IconName } from "../../../components/ui";
import { cx } from "../../../lib/classNames";
import { downloadBlob, openBlobInNewWindow } from "../../../lib/downloads";
import { previewHtmlForFrame } from "../../../lib/previewFrame";
import { activeLayout, documentTypeIdFromLayout, latestEditableVersion, locales, safe, variants } from "./templateBuilderModel";
import { wordTemplateZones } from "./wordTemplateModel";

type PreviewMode = "sample" | "document";
type NoticeTone = "blue" | "green" | "red";

type RenderNotice = {
  tone: NoticeTone;
  text: string;
};

type LastPdfRender = {
  blob: Blob;
  byteSize: number;
  filename?: string;
  generatedAt: string;
};

const scenarioOptions: Array<{ label: string; value: PreviewScenario }> = [
  { label: "Standard", value: "standard" },
  { label: "Long body", value: "longBody" },
  { label: "Three signatures", value: "threeSignatures" },
  { label: "With copies", value: "withCc" }
];

const noticeToneClasses: Record<NoticeTone, string> = {
  blue: "border-blue-200 bg-blue-50 text-blue-700",
  green: "border-emerald-200 bg-emerald-50 text-emerald-700",
  red: "border-red-200 bg-red-50 text-red-700"
};

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

function scenarioDataFor(scenario: PreviewScenario) {
  return scenarioValues[scenario] || scenarioValues.standard;
}

function sampleSubjectForScenario(scenario: PreviewScenario) {
  return (scenarioDataFor(scenario)["document.subject"] || "موضوع نمونه قالب رسمی").replace(/^موضوع:\s*/u, "");
}

function sampleBodyForScenario(scenario: PreviewScenario) {
  return scenarioDataFor(scenario)["document.body"] || "این متن نمونه برای پیش نمایش قالب رسمی سند است. متن اصلی سند در زمان ایجاد توسط کاربر کارمند جایگزین می شود.";
}

function sampleTemplateFields(layout: TemplateLayout, scenario: PreviewScenario) {
  const data = scenarioDataFor(scenario);
  const fields: Record<string, string> = {};
  const headerUnit = data[headerTemplateField];
  if (headerUnit) {
    fields[headerTemplateField.slice(templateFieldPrefix.length)] = headerUnit;
  }

  for (const zone of wordTemplateZones(layout)) {
    if (zone.key === "subject" || zone.key === "body") {
      continue;
    }
    fields[zone.key] = data[`${templateFieldPrefix}${zone.key}`]
      || data[zone.key]
      || zone.placeholder
      || zone.label
      || zone.key;
  }

  return fields;
}

function positiveId(value: string) {
  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric > 0 ? Math.round(numeric) : 0;
}

function fileSizeLabel(value: unknown) {
  const size = Number(value);
  if (!Number.isFinite(size) || size <= 0) {
    return "";
  }
  if (size >= 1024 * 1024) {
    return `${(size / (1024 * 1024)).toFixed(1)} MB`;
  }
  return `${Math.max(1, Math.round(size / 1024))} KB`;
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

function NoticeBox({ notice }: { notice: RenderNotice }) {
  return (
    <div className={cx("rounded-lg border px-3 py-2 text-sm font-semibold", noticeToneClasses[notice.tone])}>
      {notice.text}
    </div>
  );
}

function EmptyPreview({
  action,
  children,
  className,
  icon = "view"
}: {
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  icon?: IconName;
}) {
  return (
    <div className={cx("grid min-h-[32rem] place-items-center rounded-md border border-dashed border-slate-300 bg-slate-50 px-4 py-8 text-center", className)}>
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

function PreviewState({
  children,
  className,
  tone = "slate"
}: {
  children: React.ReactNode;
  className?: string;
  tone?: "red" | "slate";
}) {
  return (
    <div className={cx(
      "grid place-items-center rounded-md border p-6 text-sm font-semibold",
      tone === "red" ? "border-red-200 bg-red-50 text-red-700" : "border-slate-200 bg-slate-50 text-slate-600",
      className
    )}>
      {children}
    </div>
  );
}

function SampleServerPreview({
  className = "",
  layout,
  scenario,
  variant = "embedded"
}: {
  className?: string;
  layout: TemplateLayout;
  scenario: PreviewScenario;
  variant?: "embedded" | "fullscreen";
}) {
  const [html, setHtml] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const documentTypeId = documentTypeIdFromLayout(layout);
  const templateFields = useMemo(() => sampleTemplateFields(layout, scenario), [layout, scenario]);
  const iframeClassName = variant === "fullscreen"
    ? "h-full min-h-[calc(100vh-7rem)] w-full border-0 bg-slate-200"
    : "h-full min-h-[42rem] w-full rounded-md border border-slate-200 bg-white";
  const stateClassName = variant === "fullscreen"
    ? "h-full min-h-[calc(100vh-7rem)]"
    : "min-h-[42rem]";

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
      subject: sampleSubjectForScenario(scenario),
      summary: scenarioDataFor(scenario)["document.summary"] || null,
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
    return <PreviewState className={cx(stateClassName, className)} tone="red">{error}</PreviewState>;
  }
  if (loading && !html) {
    return <PreviewState className={cx(stateClassName, className)}>Rendering sample preview...</PreviewState>;
  }
  return <iframe className={cx(iframeClassName, className)} srcDoc={previewHtmlForFrame(html)} title="Sample template preview" />;
}

function HtmlPreviewFrame({
  className = "",
  html,
  title
}: {
  className?: string;
  html: string;
  title: string;
}) {
  return <iframe className={cx("h-full min-h-[42rem] w-full rounded-md border border-slate-200 bg-white", className)} srcDoc={previewHtmlForFrame(html)} title={title} />;
}

function PreviewModeSegment({
  disabled,
  onChange,
  value
}: {
  disabled?: boolean;
  onChange: (mode: PreviewMode) => void;
  value: PreviewMode;
}) {
  const modes: Array<{ label: string; value: PreviewMode }> = [
    { label: "Sample", value: "sample" },
    { label: "Real document", value: "document" }
  ];

  return (
    <div className="grid grid-cols-2 rounded-lg border border-slate-200 bg-slate-50 p-1">
      {modes.map((mode) => (
        <button
          aria-pressed={value === mode.value}
          className={cx(
            "min-h-9 rounded-md px-3 text-sm font-bold transition focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#061d49]/15 disabled:cursor-not-allowed disabled:opacity-60",
            value === mode.value ? "bg-[#061d49] text-white shadow-sm" : "text-slate-600 hover:bg-white"
          )}
          disabled={disabled}
          key={mode.value}
          onClick={() => onChange(mode.value)}
          type="button"
        >
          {mode.label}
        </button>
      ))}
    </div>
  );
}

function PublishHeader({
  busy,
  detail,
  onBackToBuilder,
  version
}: {
  busy: boolean;
  detail: DocumentTemplateDetail;
  onBackToBuilder: () => void;
  version: ReturnType<typeof latestEditableVersion>;
}) {
  return (
    <section className="rounded-lg border border-slate-200 bg-white px-4 py-4 shadow-sm shadow-slate-900/5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge>{detail.template.status || "unknown"}</StatusBadge>
            {version ? <span className="text-xs font-bold text-slate-500">v{version.version_number} {displayStatus(version.status)}</span> : null}
          </div>
          <h1 className="mt-2 text-2xl font-black text-slate-950">{detail.template.name}</h1>
          <p className="mt-1 max-w-3xl text-sm leading-6 text-slate-600">{detail.template.description || "Reusable official document template."}</p>
        </div>
        <div className="flex flex-wrap items-center justify-end gap-2">
          <Button disabled={busy} icon="edit" onClick={onBackToBuilder}>Back to Builder</Button>
        </div>
      </div>
    </section>
  );
}

function PublishTargetPanel({
  activeDocumentTypes,
  bindingLocale,
  bindingTypeId,
  bindingVariant,
  busy,
  canApprove,
  canRunPublishAction,
  detail,
  onChangeLocale,
  onChangeTypeId,
  onChangeVariant,
  onPublish,
  onReject,
  publishButtonLabel,
  publishSummary,
  selectedTargetBindingCount,
  submittedVersion
}: {
  activeDocumentTypes: DocumentType[];
  bindingLocale: TemplateLocale;
  bindingTypeId: string;
  bindingVariant: TemplateVariant;
  busy: boolean;
  canApprove: boolean;
  canRunPublishAction: boolean;
  detail: DocumentTemplateDetail;
  onChangeLocale: (locale: TemplateLocale) => void;
  onChangeTypeId: (documentTypeId: string) => void;
  onChangeVariant: (variant: TemplateVariant) => void;
  onPublish: () => void;
  onReject: () => void;
  publishButtonLabel: string;
  publishSummary: string;
  selectedTargetBindingCount: number;
  submittedVersion: DocumentTemplateDetail["versions"][number] | null;
}) {
  return (
    <PanelCard
      actions={<StatusBadge tone={detail.template.status === "published" ? "green" : "blue"}>{detail.template.status === "published" ? "published" : "review"}</StatusBadge>}
      title="Publish & Bind"
    >
      <div className="space-y-4">
        {canApprove ? (
          <div className="rounded-lg border border-blue-100 bg-blue-50 px-3 py-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-xs font-semibold text-blue-800">Version {submittedVersion?.version_number} is waiting for admin review.</p>
              <Button className="min-h-8 px-2.5 py-1 text-xs" disabled={busy} icon="x" onClick={onReject} variant="danger">Reject</Button>
            </div>
          </div>
        ) : null}

        <div className="space-y-3">
          <label className="block text-xs font-bold text-slate-600">
            Document type
            <SelectFilter className="mt-1 w-full rounded-md" onChange={(event) => onChangeTypeId(event.target.value)} value={bindingTypeId}>
              <option value="all">All document types</option>
              {activeDocumentTypes.map((type) => <option key={type.id} value={type.id}>{type.name}</option>)}
            </SelectFilter>
          </label>

          <div className="grid grid-cols-2 gap-2">
            <label className="block text-xs font-bold text-slate-600">
              Language
              <SelectFilter className="mt-1 w-full rounded-md" onChange={(event) => onChangeLocale(event.target.value as TemplateLocale)} value={bindingLocale}>
                {locales.map((locale) => <option key={locale} value={locale}>{localeLabel(locale)}</option>)}
              </SelectFilter>
            </label>
            <label className="block text-xs font-bold text-slate-600">
              Variant
              <SelectFilter className="mt-1 w-full rounded-md" onChange={(event) => onChangeVariant(event.target.value as TemplateVariant)} value={bindingVariant}>
                {variants.map((variant) => <option key={variant} value={variant}>{variantLabel(variant)}</option>)}
              </SelectFilter>
            </label>
          </div>
        </div>

        <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-3">
          <p className="text-sm font-black text-slate-950">{publishSummary}</p>
          <p className="mt-1 text-xs font-semibold text-slate-500">
            {selectedTargetBindingCount ? `${selectedTargetBindingCount} active binding already matches this target.` : "No active binding matches this target yet."}
          </p>
        </div>

        <Button className="min-h-12 w-full" disabled={busy || !canRunPublishAction} icon="shield" onClick={onPublish} variant="primary">
          {busy ? "Working..." : publishButtonLabel}
        </Button>
      </div>
    </PanelCard>
  );
}

function SubmitForApprovalPanel({
  busy,
  canSubmit,
  detail,
  onSubmit,
  version
}: {
  busy: boolean;
  canSubmit: boolean;
  detail: DocumentTemplateDetail;
  onSubmit: () => void;
  version: ReturnType<typeof latestEditableVersion>;
}) {
  return (
    <PanelCard actions={<StatusBadge>{detail.template.status}</StatusBadge>} title="Submit for Approval">
      <div className="space-y-3">
        <p className="text-sm font-semibold text-slate-600">{version ? `Version ${version.version_number} / ${displayStatus(version.status)}` : "No editable version available."}</p>
        <Button className="min-h-12 w-full" disabled={busy || !canSubmit} icon="upload" onClick={onSubmit} variant="primary">
          {detail.template.status === "submitted" ? "Submitted for Review" : "Submit for Approval"}
        </Button>
      </div>
    </PanelCard>
  );
}

function RenderCheckPanel({
  lastPdfRender,
  mode,
  notice,
  onChangeDocumentId,
  onChangeLocale,
  onChangeMode,
  onChangeVariant,
  onDownloadPdf,
  onOpenPdf,
  onRenderHtml,
  onRenderPdf,
  renderBusy,
  renderDocumentId,
  renderLocale,
  renderVariant
}: {
  lastPdfRender: LastPdfRender | null;
  mode: PreviewMode;
  notice: RenderNotice | null;
  onChangeDocumentId: (value: string) => void;
  onChangeLocale: (locale: TemplateLocale) => void;
  onChangeMode: (mode: PreviewMode) => void;
  onChangeVariant: (variant: TemplateVariant) => void;
  onDownloadPdf: () => void;
  onOpenPdf: () => void;
  onRenderHtml: () => void;
  onRenderPdf: () => void;
  renderBusy: boolean;
  renderDocumentId: string;
  renderLocale: TemplateLocale;
  renderVariant: TemplateVariant;
}) {
  return (
    <PanelCard title="Render Check">
      <div className="space-y-4">
        <PreviewModeSegment disabled={renderBusy} onChange={onChangeMode} value={mode} />

        {mode === "sample" ? (
          <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-3 text-sm leading-6 text-slate-600">
            Sample data is active.
          </div>
        ) : (
          <div className="space-y-3">
            <label className="block text-xs font-bold text-slate-600">
              Document ID
              <input
                className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-[#061d49] focus:ring-4 focus:ring-[#061d49]/10"
                inputMode="numeric"
                onChange={(event) => onChangeDocumentId(event.target.value)}
                placeholder="Enter document ID"
                value={renderDocumentId}
              />
            </label>
            <div className="grid grid-cols-2 gap-2">
              <label className="block text-xs font-bold text-slate-600">
                Language
                <SelectFilter className="mt-1 w-full rounded-md" onChange={(event) => onChangeLocale(event.target.value as TemplateLocale)} value={renderLocale}>
                  {locales.map((locale) => <option key={locale} value={locale}>{localeLabel(locale)}</option>)}
                </SelectFilter>
              </label>
              <label className="block text-xs font-bold text-slate-600">
                Variant
                <SelectFilter className="mt-1 w-full rounded-md" onChange={(event) => onChangeVariant(event.target.value as TemplateVariant)} value={renderVariant}>
                  {variants.map((variant) => <option key={variant} value={variant}>{variantLabel(variant)}</option>)}
                </SelectFilter>
              </label>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <Button disabled={renderBusy} icon="view" onClick={onRenderHtml}>HTML Preview</Button>
              <Button disabled={renderBusy} icon="export" onClick={onRenderPdf} variant="primary">{renderBusy ? "Rendering..." : "PDF"}</Button>
            </div>
          </div>
        )}

        {notice ? <NoticeBox notice={notice} /> : null}

        {lastPdfRender ? (
          <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-3">
            <p className="text-sm font-black text-emerald-800">PDF is ready for this session.</p>
            <p className="mt-1 text-xs font-semibold text-emerald-700">
              {["Generated now", fileSizeLabel(lastPdfRender.byteSize), lastPdfRender.generatedAt].filter(Boolean).join(" / ")}
            </p>
            <div className="mt-3 grid grid-cols-2 gap-2">
              <Button className="min-h-9 px-3 py-1.5 text-xs" icon="view" onClick={onOpenPdf}>Open PDF</Button>
              <Button className="min-h-9 px-3 py-1.5 text-xs" icon="export" onClick={onDownloadPdf}>Download</Button>
            </div>
          </div>
        ) : null}
      </div>
    </PanelCard>
  );
}

function BindingsSummaryPanel({
  bindings
}: {
  bindings: DocumentTemplateBinding[];
}) {
  return (
    <PanelCard actions={<StatusBadge tone="blue">{String(bindings.length)}</StatusBadge>} title="Template Bindings">
      {bindings.length ? (
        <div className="space-y-2">
          {bindings.slice(0, 4).map((binding) => (
            <div className="rounded-md border border-slate-200 bg-white px-3 py-2" key={binding.id}>
              <p className="truncate text-sm font-bold text-slate-950">{binding.documentTypeName || "All document types"}</p>
              <p className="mt-1 text-xs font-semibold text-slate-500">{localeLabel(binding.locale)} / {variantLabel(binding.variant)} / v{binding.templateVersionNumber || binding.template_version_id}</p>
            </div>
          ))}
          {bindings.length > 4 ? <p className="text-xs font-semibold text-slate-500">{bindings.length - 4} more active bindings.</p> : null}
        </div>
      ) : (
        <p className="text-sm leading-6 text-slate-600">This template has no active bindings yet.</p>
      )}
    </PanelCard>
  );
}

function PreviewWorkspace({
  documentHtml,
  lastPdfRender,
  mode,
  onOpenPdf,
  onReview,
  scenario,
  setScenario,
  layout
}: {
  documentHtml: string;
  lastPdfRender: LastPdfRender | null;
  layout: TemplateLayout;
  mode: PreviewMode;
  onOpenPdf: () => void;
  onReview: () => void;
  scenario: PreviewScenario;
  setScenario: (scenario: PreviewScenario) => void;
}) {
  const title = mode === "sample" ? "Sample Preview" : "Real Document Preview";

  return (
    <PanelCard
      actions={(
        <div className="flex flex-wrap items-center gap-2">
          {mode === "sample" ? (
            <ScenarioSelect className="h-9 w-40 rounded-md text-sm" onChange={setScenario} value={scenario} />
          ) : (
            <StatusBadge tone={documentHtml ? "green" : lastPdfRender ? "blue" : "slate"}>{documentHtml ? "html ready" : lastPdfRender ? "pdf ready" : "waiting"}</StatusBadge>
          )}
          <Button className="min-h-9 px-3 py-1.5 text-xs" icon="fullscreen" onClick={onReview}>Review</Button>
        </div>
      )}
      bodyClassName="flex min-h-0 flex-1 bg-slate-100 p-2 sm:p-3"
      className="flex min-h-[38rem] flex-col xl:sticky xl:top-24 xl:h-[calc(100vh-7rem)]"
      headerClassName="flex-wrap"
      title={title}
    >
      {mode === "sample" ? (
        <SampleServerPreview className="flex-1" layout={layout} scenario={scenario} />
      ) : documentHtml ? (
        <HtmlPreviewFrame className="flex-1" html={documentHtml} title="Real document template preview" />
      ) : (
        <EmptyPreview
          action={lastPdfRender ? <Button icon="view" onClick={onOpenPdf} variant="primary">Open PDF</Button> : undefined}
          className="flex-1"
          icon={lastPdfRender ? "export" : "document"}
        >
          {lastPdfRender ? "PDF is ready." : "No real document preview yet."}
        </EmptyPreview>
      )}
    </PanelCard>
  );
}

function FullScreenReview({
  busy,
  canPublish,
  layout,
  onBackToBuilder,
  onClose,
  onPublish,
  publishButtonLabel,
  publishSummary,
  scenario,
  setScenario,
  status,
  templateName
}: {
  busy: boolean;
  canPublish: boolean;
  layout: ReturnType<typeof activeLayout>;
  onBackToBuilder: () => void;
  onClose: () => void;
  onPublish: () => void;
  publishButtonLabel: string;
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
          <Button className="border-white bg-white text-[#061d49] hover:bg-slate-100" disabled={busy || !canPublish} icon="shield" onClick={onPublish}>
            {busy ? "Working..." : publishButtonLabel}
          </Button>
          <Button className="border-white/20 bg-white/10 text-white hover:bg-white/15" icon="x" onClick={onClose}>Close</Button>
        </div>
      </header>
      <div className="min-h-0 flex-1 overflow-hidden bg-slate-900">
        <SampleServerPreview className="h-full" layout={layout} scenario={scenario} variant="fullscreen" />
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
  const [previewMode, setPreviewMode] = useState<PreviewMode>("sample");
  const [renderDocumentId, setRenderDocumentId] = useState("");
  const [renderLocale, setRenderLocale] = useState<TemplateLocale>("all");
  const [renderVariant, setRenderVariant] = useState<TemplateVariant>("official");
  const [documentHtmlPreview, setDocumentHtmlPreview] = useState("");
  const [lastPdfRender, setLastPdfRender] = useState<LastPdfRender | null>(null);
  const [renderNotice, setRenderNotice] = useState<RenderNotice | null>(null);
  const [renderBusy, setRenderBusy] = useState(false);
  const [scenario, setScenario] = useState<PreviewScenario>("standard");
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
    if (!nextDetail) {
      setError("Could not load template.");
    }
  }

  useEffect(() => {
    void refresh();
  }, [templateId, auth.isAdmin]);

  useEffect(() => {
    setReviewOpen(searchParams.get("review") === "1");
  }, [searchParams]);

  useEffect(() => {
    setBindingInitialized(false);
    setPreviewMode("sample");
    setDocumentHtmlPreview("");
    setLastPdfRender(null);
    setRenderNotice(null);
  }, [templateId]);

  useEffect(() => {
    setDocumentHtmlPreview("");
    setLastPdfRender(null);
    setRenderNotice(null);
  }, [renderDocumentId, renderLocale, renderVariant]);

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
    const documentId = positiveId(renderDocumentId);
    setPreviewMode("document");
    if (!documentId) {
      setRenderNotice({ tone: "red", text: "Enter a document ID before rendering a real document." });
      return;
    }

    setRenderBusy(true);
    setRenderNotice(null);
    try {
      if (output === "pdf") {
        const result = await templateApi.renderPdf(documentId, {
          layout_definition: layout,
          locale: renderLocale,
          variant: renderVariant
        });
        setLastPdfRender({
          blob: result.blob,
          byteSize: result.blob.size,
          filename: result.filename,
          generatedAt: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
        });
        setRenderNotice({ tone: "green", text: "PDF generated for this browser session." });
        return;
      }

      const result = await templateApi.render(documentId, {
        layout_definition: layout,
        locale: renderLocale,
        variant: renderVariant,
        output
      });
      if (!result.html) {
        setDocumentHtmlPreview("");
        setRenderNotice({ tone: "red", text: "The render completed, but no HTML preview was returned." });
        return;
      }
      setDocumentHtmlPreview(result.html);
      setRenderNotice({ tone: "blue", text: `HTML preview generated for document #${documentId}.` });
    } catch (caught) {
      setRenderNotice({ tone: "red", text: caught instanceof Error ? caught.message : "Could not render document." });
    } finally {
      setRenderBusy(false);
    }
  }

  function openPdfRender() {
    if (lastPdfRender) {
      openBlobInNewWindow(lastPdfRender.blob);
    }
  }

  function downloadPdfRender() {
    if (lastPdfRender) {
      downloadBlob(lastPdfRender.blob, lastPdfRender.filename || `document-${renderDocumentId || "preview"}.pdf`);
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

  if (!detail) {
    return (
      <PanelCard title="Publish Template">
        <p className="text-sm font-semibold text-red-700">{error || "Could not load template."}</p>
      </PanelCard>
    );
  }

  return (
    <div className="space-y-4">
      {error ? <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">{error}</div> : null}
      {actionMessage ? <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-700">{actionMessage}</div> : null}

      {reviewOpen ? (
        <FullScreenReview
          busy={busy}
          canPublish={canRunPublishAction}
          layout={layout}
          onBackToBuilder={() => navigate(`/admin/templates/builder/${detail.template.id}`)}
          onClose={closeReview}
          onPublish={() => void approvePublishAndBind()}
          publishButtonLabel={publishButtonLabel}
          publishSummary={publishSummary}
          scenario={scenario}
          setScenario={setScenario}
          status={detail.template.status}
          templateName={detail.template.name}
        />
      ) : null}

      <PublishHeader
        busy={busy}
        detail={detail}
        onBackToBuilder={() => navigate(`/admin/templates/builder/${detail.template.id}`)}
        version={version}
      />

      <div className="grid gap-4 xl:grid-cols-[minmax(19rem,21rem)_minmax(0,1fr)]">
        <aside className="min-w-0 space-y-4">
          {auth.isAdmin ? (
            <PublishTargetPanel
              activeDocumentTypes={activeDocumentTypes}
              bindingLocale={bindingLocale}
              bindingTypeId={bindingTypeId}
              bindingVariant={bindingVariant}
              busy={busy}
              canApprove={canApprove}
              canRunPublishAction={canRunPublishAction}
              detail={detail}
              onChangeLocale={setBindingLocale}
              onChangeTypeId={setBindingTypeId}
              onChangeVariant={setBindingVariant}
              onPublish={() => void approvePublishAndBind()}
              onReject={() => void handleReject()}
              publishButtonLabel={publishButtonLabel}
              publishSummary={publishSummary}
              selectedTargetBindingCount={selectedTargetBindingCount}
              submittedVersion={submittedVersion}
            />
          ) : (
            <SubmitForApprovalPanel
              busy={busy}
              canSubmit={canSubmit}
              detail={detail}
              onSubmit={() => void handleSubmit()}
              version={version}
            />
          )}

          <RenderCheckPanel
            lastPdfRender={lastPdfRender}
            mode={previewMode}
            notice={renderNotice}
            onChangeDocumentId={setRenderDocumentId}
            onChangeLocale={setRenderLocale}
            onChangeMode={setPreviewMode}
            onChangeVariant={setRenderVariant}
            onDownloadPdf={downloadPdfRender}
            onOpenPdf={openPdfRender}
            onRenderHtml={() => void renderDocument("html")}
            onRenderPdf={() => void renderDocument("pdf")}
            renderBusy={renderBusy}
            renderDocumentId={renderDocumentId}
            renderLocale={renderLocale}
            renderVariant={renderVariant}
          />

          {auth.isAdmin ? <BindingsSummaryPanel bindings={activeBindingsForTemplate} /> : null}
        </aside>

        <div className="min-w-0">
          <PreviewWorkspace
            documentHtml={documentHtmlPreview}
            lastPdfRender={lastPdfRender}
            layout={layout}
            mode={previewMode}
            onOpenPdf={openPdfRender}
            onReview={openReview}
            scenario={scenario}
            setScenario={setScenario}
          />
        </div>
      </div>
    </div>
  );
}
