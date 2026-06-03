import { useEffect, useMemo, useRef, useState } from "react";
import type { FormEvent, ReactNode } from "react";
import { Link, useNavigate } from "react-router-dom";
import { documentApi, templateApi, workspaceApi } from "../../api";
import type {
  ActiveDocumentTemplate,
  DocumentContent,
  EntityId,
  WorkspaceReference
} from "../../api";
import {
  documentContentFromBody,
  documentContentToPlainText,
  emptyDocumentContent,
  StructuredDocumentEditor
} from "../../components/app/StructuredDocumentEditor";
import { FullscreenDocumentPreview } from "../../components/app/FullscreenDocumentPreview";
import { Button, Icon, SelectFilter, StatusBadge } from "../../components/ui";
import type { IconName } from "../../components/ui";
import {
  limitStaffTemplateFieldValue,
  missingRequiredStaffTemplateFields,
  staffTemplateFieldsForLayout
} from "./staffTemplateFields";
import type { StaffTemplateFieldDefinition } from "./staffTemplateFields";
import { previewHtmlForFrame } from "../../lib/previewFrame";
import { cx } from "../../lib/classNames";
import { currentPreviewFrameHtml, patchLivePreviewFrame } from "../../lib/livePreview";

type MobileView = "details" | "write" | "preview";
const previewServerDebounceMs = 900;

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function booleanValue(value: unknown) {
  return value === true || value === 1 || value === "1";
}

function fileSizeLabel(size: number) {
  if (size >= 1024 * 1024) {
    return `${(size / (1024 * 1024)).toFixed(1)} MB`;
  }
  return `${Math.max(1, Math.round(size / 1024))} KB`;
}

function normalizeTemplateFields(values: Record<string, string>) {
  return Object.fromEntries(
    Object.entries(values)
      .map(([key, value]) => [key, value.replace(/\r\n?/g, "\n").trimEnd()])
      .filter(([key, value]) => key && value)
  );
}

function staffFieldId(definition: StaffTemplateFieldDefinition) {
  return `${definition.kind}:${definition.key}`;
}

function orderedStaffFields(fields: StaffTemplateFieldDefinition[]) {
  const rank: Record<StaffTemplateFieldDefinition["kind"], number> = {
    template: 0,
    subject: 1,
    body: 2
  };
  return fields
    .map((field, index) => ({ field, index }))
    .sort((left, right) => rank[left.field.kind] - rank[right.field.kind] || left.index - right.index)
    .map(({ field }) => field);
}

function uniqueActiveTemplates(rows: ActiveDocumentTemplate[]) {
  const seen = new Set<string>();
  return rows.filter((row) => {
    const key = `${row.document_type_id || "all"}:${row.locale}:${row.variant}:${row.template_id}:${row.template_version_id}`;
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

function composerContent(
  documentContent: DocumentContent,
  metadata: DocumentContent["metadata"],
  templateFields: Record<string, string>,
  preview = false
) {
  const content: DocumentContent = {
    ...documentContent,
    freeBlocks: [],
    metadata,
    templateFields
  };

  const hasBody = Boolean(documentContentToPlainText(content).trim());
  if (preview && !hasBody) {
    return documentContentFromBody("Draft body will appear here.", metadata, templateFields);
  }

  return content;
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

export function DocumentCreatePage() {
  const navigate = useNavigate();
  const previewFrameRef = useRef<HTMLIFrameElement | null>(null);
  const [reference, setReference] = useState<WorkspaceReference | null>(null);
  const [activeTemplates, setActiveTemplates] = useState<ActiveDocumentTemplate[]>([]);
  const [selectedBindingId, setSelectedBindingId] = useState("");
  const [documentTypeId, setDocumentTypeId] = useState("");
  const [confidentialityId, setConfidentialityId] = useState("");
  const [priorityId, setPriorityId] = useState("");
  const [documentDate, setDocumentDate] = useState(todayIso());
  const [subject, setSubject] = useState("");
  const [templateFields, setTemplateFields] = useState<Record<string, string>>({});
  const [summary, setSummary] = useState("");
  const [documentContent, setDocumentContent] = useState<DocumentContent>(() => emptyDocumentContent({ date: todayIso() }));
  const [files, setFiles] = useState<File[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [loadingReference, setLoadingReference] = useState(true);
  const [templateLoading, setTemplateLoading] = useState(false);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewHtml, setPreviewHtml] = useState<string | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [fullscreenPreviewHtml, setFullscreenPreviewHtml] = useState<string | null>(null);
  const [livePreviewAvailable, setLivePreviewAvailable] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [previewUpdatedAt, setPreviewUpdatedAt] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [mobileView, setMobileView] = useState<MobileView>("details");
  const [submitAttempted, setSubmitAttempted] = useState(false);
  const [touchedFields, setTouchedFields] = useState<Record<string, boolean>>({});

  useEffect(() => {
    setLoadingReference(true);
    workspaceApi.reference()
      .then((result) => {
        setReference(result);
        setConfidentialityId((current) => current || String(result.confidentialityLevels.find((item) => booleanValue(item.is_default))?.id || result.confidentialityLevels[0]?.id || ""));
        setPriorityId((current) => current || String(
          result.priorityLevels.find((item) => booleanValue(item.is_default))?.id
            || result.priorityLevels.find((item) => item.code === "medium")?.id
            || result.priorityLevels.find((item) => item.code === "normal")?.id
            || result.priorityLevels[0]?.id
            || ""
        ));
      })
      .catch(() => setError("Could not load document reference data."))
      .finally(() => setLoadingReference(false));
  }, []);

  useEffect(() => {
    if (!documentTypeId) {
      setActiveTemplates([]);
      setSelectedBindingId("");
      setTemplateFields({});
      setPreviewHtml(null);
      setPreviewUpdatedAt(null);
      return;
    }

    let alive = true;
    setTemplateLoading(true);
    setPreviewError(null);
    setPreviewHtml(null);
    setPreviewUpdatedAt(null);
    templateApi.activeFor({ document_type_id: Number(documentTypeId), locale: "all", variant: "official" })
      .then((rows) => {
        if (alive) {
          const uniqueRows = uniqueActiveTemplates(rows);
          setActiveTemplates(uniqueRows);
          setSelectedBindingId((current) => (
            current && uniqueRows.some((row) => String(row.id) === current)
              ? current
              : String(uniqueRows[0]?.id || "")
          ));
        }
      })
      .catch(() => {
        if (alive) {
          setActiveTemplates([]);
          setSelectedBindingId("");
          setPreviewError("Could not load published templates for this document type.");
        }
      })
      .finally(() => {
        if (alive) {
          setTemplateLoading(false);
        }
      });

    return () => {
      alive = false;
    };
  }, [documentTypeId]);

  const selectedDocumentType = useMemo(() => {
    return reference?.documentTypes.find((item) => String(item.id) === documentTypeId) || null;
  }, [documentTypeId, reference]);
  const selectedTemplate = activeTemplates.find((row) => String(row.id) === selectedBindingId) || activeTemplates[0] || null;
  const selectedLayout = selectedTemplate?.layout_definition || null;
  const staffFields = useMemo(() => staffTemplateFieldsForLayout(selectedLayout), [selectedLayout]);
  const composerFields = useMemo(() => orderedStaffFields(staffFields), [staffFields]);
  const templateFieldDefaults = useMemo(() => reference?.templateFieldDefaults || {}, [reference]);
  const hasWritableDocumentTypes = Boolean(reference?.documentTypes.length);

  useEffect(() => {
    setTemplateFields((current) => Object.fromEntries(
      staffFields
        .filter((definition) => definition.kind === "template")
        .map((definition) => [
          definition.key,
          current[definition.key] || templateFieldDefaults[definition.key] || ""
        ])
    ));
  }, [staffFields, templateFieldDefaults]);

  const bodyText = useMemo(() => documentContentToPlainText(documentContent), [documentContent]);
  const normalizedTemplateFields = useMemo(() => normalizeTemplateFields(templateFields), [templateFields]);
  const missingRequiredFields = useMemo(() => missingRequiredStaffTemplateFields(staffFields, {
    bodyText,
    subject,
    templateFields
  }), [bodyText, staffFields, subject, templateFields]);
  const metadata = useMemo(() => ({
    date: documentDate || null,
    subject: subject.trim() || "Draft subject",
    summary: summary.trim() || undefined
  }), [documentDate, subject, summary]);
  const missingConfidentialityLevels = Boolean(reference && !reference.confidentialityLevels.length);
  const missingPriorityLevels = Boolean(reference && !reference.priorityLevels.length);
  const missingReferenceData = missingConfidentialityLevels || missingPriorityLevels;
  const canAttemptSubmit = Boolean(
    hasWritableDocumentTypes
    && documentTypeId
    && selectedTemplate
    && confidentialityId
    && priorityId
    && !missingReferenceData
    && !templateLoading
  );
  const canSubmit = canAttemptSubmit && !missingRequiredFields.length;
  const missingTemplate = Boolean(documentTypeId && !templateLoading && !selectedTemplate);
  const requiredFieldTotal = staffFields.filter((field) => field.required).length;
  const requiredFieldComplete = Math.max(0, requiredFieldTotal - missingRequiredFields.length);
  const selectedTemplateName = selectedTemplate?.templateName || (selectedTemplate ? `Template #${selectedTemplate.template_id}` : "");
  const selectedTemplateVersion = selectedTemplate?.templateVersionNumber
    ? `v${selectedTemplate.templateVersionNumber}`
    : selectedTemplate
      ? `version ${selectedTemplate.template_version_id}`
      : "";
  const selectedTemplateScope = selectedTemplate?.documentTypeName || selectedDocumentType?.name || "All document types";
  const previewPayload = useMemo(() => {
    if (!selectedTemplate) {
      return null;
    }

    const previewContent = composerContent(documentContent, metadata, normalizedTemplateFields, true);
    return {
      body: documentContentToPlainText(previewContent),
      confidentiality_level_id: confidentialityId ? Number(confidentialityId) as EntityId : null,
      document_content: previewContent,
      document_date: documentDate || null,
      document_type_id: documentTypeId ? Number(documentTypeId) as EntityId : null,
      locale: "all" as const,
      priority_level_id: priorityId ? Number(priorityId) as EntityId : null,
      subject: subject.trim() || "Draft subject",
      summary: summary.trim() || null,
      template_fields: normalizedTemplateFields,
      template_id: selectedTemplate.template_id,
      template_version_id: selectedTemplate.template_version_id,
      layout_definition: selectedTemplate.layout_definition,
      variant: "official" as const
    };
  }, [confidentialityId, documentContent, documentDate, documentTypeId, metadata, normalizedTemplateFields, priorityId, selectedTemplate, subject, summary]);
  const livePreviewValues = useMemo(() => ({
    bodyContent: documentContent.body,
    bodyText,
    documentDate,
    subject,
    templateFields: normalizedTemplateFields
  }), [bodyText, documentContent.body, documentDate, normalizedTemplateFields, subject]);
  const previewStatus = previewLoading
    ? livePreviewAvailable
      ? "Syncing"
      : "Rendering preview..."
    : livePreviewAvailable
      ? previewUpdatedAt
        ? `Live / synced ${previewUpdatedAt}`
        : "Live"
      : previewUpdatedAt
        ? `Updated ${previewUpdatedAt}`
        : "Draft preview";

  useEffect(() => {
    if (!previewPayload) {
      setPreviewHtml(null);
      setPreviewUpdatedAt(null);
      return;
    }

    let alive = true;
    const timeout = window.setTimeout(() => {
      setPreviewLoading(true);
      templateApi.preview(previewPayload)
        .then((result) => {
          if (alive) {
            setPreviewHtml(result.html || null);
            setPreviewError(null);
            setPreviewUpdatedAt(new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }));
          }
        })
        .catch((caught) => {
          if (alive) {
            setPreviewError(caught instanceof Error ? caught.message : "Could not render preview.");
          }
        })
        .finally(() => {
          if (alive) {
            setPreviewLoading(false);
          }
        });
    }, previewServerDebounceMs);

    return () => {
      alive = false;
      window.clearTimeout(timeout);
    };
  }, [previewPayload]);

  useEffect(() => {
    if (!previewHtml) {
      setLivePreviewAvailable(false);
      return;
    }

    const patched = patchLivePreviewFrame(previewFrameRef.current, livePreviewValues);
    setLivePreviewAvailable((current) => current === patched ? current : patched);
  }, [livePreviewValues, previewHtml]);

  function changeDocumentType(value: string) {
    setDocumentTypeId(value);
    setSelectedBindingId("");
    setSubject("");
    setTemplateFields({});
    setSummary("");
    setDocumentContent(emptyDocumentContent({ date: documentDate || todayIso() }));
    setPreviewError(null);
    setSubmitAttempted(false);
    setTouchedFields({});
    setMobileView(value ? "write" : "details");
  }

  function changeSelectedBinding(value: string) {
    setSelectedBindingId(value);
    setSubmitAttempted(false);
    setTouchedFields({});
  }

  function touchField(definition: StaffTemplateFieldDefinition) {
    const key = staffFieldId(definition);
    setTouchedFields((current) => current[key] ? current : { ...current, [key]: true });
  }

  function scrollToFirstMissingField() {
    const firstMissing = missingRequiredFields[0];
    if (!firstMissing) {
      return;
    }

    window.requestAnimationFrame(() => {
      const field = document.querySelector<HTMLElement>(`[data-staff-field="${staffFieldId(firstMissing)}"]`);
      field?.scrollIntoView({ behavior: "smooth", block: "center" });
      const focusable = field?.querySelector<HTMLElement>("input, textarea, [contenteditable='true']");
      focusable?.focus();
    });
  }

  async function refreshPreview() {
    if (!previewPayload) {
      return;
    }

    setPreviewLoading(true);
    try {
      const result = await templateApi.preview(previewPayload);
      setPreviewHtml(result.html || null);
      setPreviewError(null);
      setPreviewUpdatedAt(new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }));
    } catch (caught) {
      setPreviewError(caught instanceof Error ? caught.message : "Could not render preview.");
    } finally {
      setPreviewLoading(false);
    }
  }

  function handlePreviewFrameLoad() {
    const patched = patchLivePreviewFrame(previewFrameRef.current, livePreviewValues);
    setLivePreviewAvailable((current) => current === patched ? current : patched);
  }

  function openFullscreenPreview() {
    if (!previewHtml) {
      return;
    }
    setFullscreenPreviewHtml(currentPreviewFrameHtml(previewFrameRef.current, previewHtml));
    setPreviewOpen(true);
  }

  function updateTemplateField(definition: StaffTemplateFieldDefinition, value: string) {
    touchField(definition);
    setTemplateFields((current) => ({
      ...current,
      [definition.key]: limitStaffTemplateFieldValue(value, definition)
    }));
  }

  function updateSubject(definition: StaffTemplateFieldDefinition, value: string) {
    touchField(definition);
    setSubject(limitStaffTemplateFieldValue(value, definition));
  }

  function updatePlainBody(definition: StaffTemplateFieldDefinition, value: string) {
    touchField(definition);
    const limitedValue = limitStaffTemplateFieldValue(value, definition);
    setDocumentContent(documentContentFromBody(limitedValue, documentContent.metadata, templateFields));
  }

  function updateRichBody(content: DocumentContent) {
    const bodyField = staffFields.find((field) => field.kind === "body");
    if (bodyField) {
      touchField(bodyField);
    }
    setDocumentContent({ ...content, freeBlocks: [] });
  }

  function addFiles(fileList: FileList | null) {
    const nextFiles = Array.from(fileList || []);
    if (nextFiles.length) {
      setFiles((current) => [...current, ...nextFiles]);
    }
  }

  function removeFile(index: number) {
    setFiles((current) => current.filter((_file, fileIndex) => fileIndex !== index));
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitAttempted(true);
    if (!canSubmit || !selectedTemplate) {
      scrollToFirstMissingField();
      return;
    }

    setSubmitting(true);
    setError(null);
    try {
      const content = composerContent(documentContent, {
        ...metadata,
        subject: subject.trim(),
        summary: summary.trim() || undefined
      }, normalizedTemplateFields);
      const created = await documentApi.create({
        body: documentContentToPlainText(content),
        change_reason: "Initial draft.",
        confidentiality_level_id: Number(confidentialityId) as EntityId,
        document_content: content,
        document_date: documentDate || null,
        document_type_id: Number(documentTypeId) as EntityId,
        priority_level_id: Number(priorityId) as EntityId,
        subject: subject.trim(),
        summary: summary.trim() || null,
        template_fields: normalizedTemplateFields
      });
      const documentId = created.document.id;
      await templateApi.saveLayoutDraft(documentId, {
        base_template_version_id: selectedTemplate.template_version_id,
        layout_definition: selectedTemplate.layout_definition
      });
      for (const file of files) {
        await documentApi.uploadAttachment(documentId, { file });
      }
      navigate(`/app/documents/${documentId}`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not create document.");
    } finally {
      setSubmitting(false);
    }
  }

  function renderField(definition: StaffTemplateFieldDefinition) {
    const isMissing = missingRequiredFields.some((field) => field.kind === definition.kind && field.key === definition.key);
    const touchKey = staffFieldId(definition);
    const showError = isMissing && (submitAttempted || touchedFields[touchKey]);
    const label = (
      <span className="flex min-w-0 items-center justify-between gap-3">
        <span className="min-w-0 truncate text-[0.82rem] font-bold text-slate-800">{definition.label}</span>
        {definition.required ? <span className="shrink-0 rounded-full bg-slate-100 px-2 py-0.5 text-[0.62rem] font-bold uppercase text-slate-500">required</span> : null}
      </span>
    );
    const fieldClass = cx(
      "mt-2 min-h-11 w-full rounded-lg border bg-white px-3 text-sm text-slate-950 shadow-sm shadow-slate-900/[0.02] outline-none transition placeholder:text-slate-400 focus:border-[#061d49] focus:ring-4 focus:ring-[#061d49]/10",
      showError ? "border-red-300" : "border-slate-200"
    );
    const fieldShellClass = "scroll-mt-28 border-b border-slate-100 px-4 py-5 last:border-b-0";

    if (definition.kind === "subject") {
      return (
        <label className={fieldShellClass} data-staff-field={touchKey} key={`${definition.kind}-${definition.key}`}>
          <span className="block">{label}</span>
          <input
            className={fieldClass}
            maxLength={definition.maxLength}
            onBlur={() => touchField(definition)}
            onChange={(event) => updateSubject(definition, event.target.value)}
            placeholder={definition.placeholder}
            required={definition.required}
            value={subject}
          />
          {showError ? <span className="mt-2 block text-xs font-semibold text-red-600">This field is required.</span> : null}
        </label>
      );
    }

    if (definition.kind === "body") {
      return (
        <div className={fieldShellClass} data-staff-field={touchKey} key={`${definition.kind}-${definition.key}`}>
          <div>{label}</div>
          {definition.richText ? (
            <div className="mt-2">
              <StructuredDocumentEditor
                allowFreeBlocks={false}
                allowTables={false}
                invalid={showError}
                onChange={updateRichBody}
                placeholder={definition.placeholder}
                toolbarMode="minimal"
                value={documentContent}
              />
            </div>
          ) : (
            <textarea
              className={cx(fieldClass, "min-h-64 resize-none overflow-y-auto py-3 leading-6")}
              dir="auto"
              maxLength={definition.maxLength}
              onBlur={() => touchField(definition)}
              onChange={(event) => updatePlainBody(definition, event.target.value)}
              placeholder={definition.placeholder}
              required={definition.required}
              value={bodyText}
            />
          )}
          {showError ? <span className="mt-2 block text-xs font-semibold text-red-600">Body is required.</span> : null}
        </div>
      );
    }

    const value = templateFields[definition.key] || "";
    return (
      <label className={fieldShellClass} data-staff-field={touchKey} key={`${definition.kind}-${definition.key}`}>
        <span className="block">{label}</span>
        {definition.multiline ? (
          <textarea
            className={cx(fieldClass, "min-h-24 resize-none overflow-y-auto py-3 leading-6")}
            dir="auto"
            maxLength={definition.maxLength}
            onBlur={() => touchField(definition)}
            onChange={(event) => updateTemplateField(definition, event.target.value)}
            placeholder={definition.placeholder}
            required={definition.required}
            value={value}
          />
        ) : (
          <input
            className={fieldClass}
            dir="auto"
            maxLength={definition.maxLength}
            onBlur={() => touchField(definition)}
            onChange={(event) => updateTemplateField(definition, event.target.value)}
            placeholder={definition.placeholder}
            required={definition.required}
            value={value}
          />
        )}
        {showError ? <span className="mt-2 block text-xs font-semibold text-red-600">This field is required.</span> : null}
      </label>
    );
  }

  return (
    <section className="mx-auto max-w-[118rem] pb-24 sm:pb-0">
      {previewOpen && fullscreenPreviewHtml ? (
        <FullscreenDocumentPreview
          html={fullscreenPreviewHtml}
          onClose={() => {
            setPreviewOpen(false);
            setFullscreenPreviewHtml(null);
          }}
          subtitle={selectedTemplate ? `${selectedTemplateName || "Official template"} / ${selectedTemplateVersion}` : undefined}
          title="Official preview"
        />
      ) : null}

      <form className="space-y-3" id="create-document-form" noValidate onSubmit={handleSubmit}>
        <div className="rounded-lg border border-slate-200/80 bg-white px-4 py-3 shadow-sm shadow-slate-900/[0.03]">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="min-w-0">
              <Link className="inline-flex text-sm font-bold text-[#061d49] hover:underline" to="/app/documents">Back to registry</Link>
              <div className="mt-1 flex min-w-0 flex-wrap items-center gap-2">
                <h1 className="text-xl font-bold text-slate-950">Create document</h1>
                <StatusBadge>draft</StatusBadge>
              </div>
            </div>

            <div className="flex min-w-0 flex-1 flex-wrap items-center justify-end gap-2">
              {selectedDocumentType ? (
                <span className="max-w-full truncate rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-bold text-slate-700">
                  {selectedDocumentType.name}
                </span>
              ) : null}
              {selectedTemplate ? (
                <span className="max-w-full truncate rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-bold text-emerald-700">
                  {selectedTemplateName} {selectedTemplateVersion ? `/ ${selectedTemplateVersion}` : ""}
                </span>
              ) : null}
              <div className="hidden sm:block">
                <Button disabled={!canAttemptSubmit || submitting || loadingReference} form="create-document-form" icon="plus" type="submit" variant="primary">
                  {submitting ? "Creating..." : "Create draft"}
                </Button>
              </div>
            </div>
          </div>
        </div>

        {error ? <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">{error}</div> : null}
        {!loadingReference && reference && !hasWritableDocumentTypes ? (
          <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-800">
            Your active assignment does not have a document write rule. Ask an administrator to grant locked or free write permission for one of the official document types.
          </div>
        ) : null}
        {!loadingReference && reference && missingReferenceData ? (
          <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-semibold leading-6 text-amber-800">
            Create draft is disabled because {[
              missingConfidentialityLevels ? "confidentiality levels" : "",
              missingPriorityLevels ? "priority levels" : ""
            ].filter(Boolean).join(" and ")} are not configured. Add at least one active value in admin settings, then reload this page.
          </div>
        ) : null}

        <div className="grid grid-cols-3 gap-1 rounded-lg border border-slate-200 bg-white p-1 xl:hidden">
          {([
            ["write", "Write"],
            ["preview", "Preview"],
            ["details", "Details"]
          ] as Array<[MobileView, string]>).map(([view, label]) => (
            <button
              className={cx(
                "min-h-10 rounded-md px-3 text-sm font-bold transition",
                mobileView === view ? "bg-[#061d49] text-white" : "text-slate-600 hover:bg-slate-50"
              )}
              key={view}
              onClick={() => setMobileView(view)}
              type="button"
            >
              {label}
            </button>
          ))}
        </div>

        <div className="grid gap-3 xl:grid-cols-[18rem_minmax(0,1fr)] 2xl:grid-cols-[19rem_minmax(32rem,48rem)_minmax(30rem,1fr)] xl:items-start">
          <aside className={cx("space-y-3 xl:sticky xl:top-24", mobileView === "details" ? "block" : "hidden xl:block")}>
            <section className="overflow-hidden rounded-lg border border-slate-200/80 bg-white shadow-sm shadow-slate-900/[0.03]">
              <header className="flex items-center justify-between gap-3 border-b border-slate-200 px-4 py-3">
                <h2 className="text-sm font-bold text-slate-950">Start</h2>
                {selectedTemplate ? <StatusBadge>published</StatusBadge> : null}
              </header>
              <div className="space-y-4 p-4">
                <label className="block text-sm font-bold text-slate-700">
                  Document type
                  <SelectFilter className="mt-2 w-full" disabled={loadingReference || !hasWritableDocumentTypes} onChange={(event) => changeDocumentType(event.target.value)} required value={documentTypeId}>
                    <option value="">Select a document type</option>
                    {reference?.documentTypes.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
                  </SelectFilter>
                </label>

                {activeTemplates.length > 1 ? (
                  <label className="block text-sm font-bold text-slate-700">
                    Official template
                    <SelectFilter className="mt-2 w-full" onChange={(event) => changeSelectedBinding(event.target.value)} value={selectedBindingId}>
                      {activeTemplates.map((template) => (
                        <option key={template.id} value={template.id}>
                          {template.templateName || `Template #${template.template_id}`} / v{template.templateVersionNumber || template.template_version_id} / {template.documentTypeName || "All document types"}
                        </option>
                      ))}
                    </SelectFilter>
                  </label>
                ) : selectedTemplate ? (
                  <div className="rounded-lg border border-emerald-200 bg-emerald-50/80 px-3 py-3">
                    <div className="flex items-start gap-3">
                      <Icon className="mt-0.5 h-4 w-4 shrink-0 text-emerald-700" name="template" />
                      <div className="min-w-0">
                        <p className="truncate text-sm font-bold text-slate-950">{selectedTemplateName}</p>
                        <p className="mt-1 text-xs font-semibold text-emerald-700">{selectedTemplateVersion || "Active version"} / {selectedTemplateScope}</p>
                      </div>
                    </div>
                  </div>
                ) : documentTypeId && !templateLoading ? (
                  <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-3 text-sm font-semibold leading-6 text-amber-800">
                    No active published official template is bound to this document type.
                  </div>
                ) : (
                  <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-3 text-sm font-semibold text-slate-500">
                    {templateLoading ? "Loading template..." : "No document type selected."}
                  </div>
                )}
              </div>
            </section>

            <section className="overflow-hidden rounded-lg border border-slate-200/80 bg-white shadow-sm shadow-slate-900/[0.03]">
              <header className="border-b border-slate-200 px-4 py-3">
                <h2 className="text-sm font-bold text-slate-950">Details</h2>
              </header>
              <div className="space-y-4 p-4">
                <label className="block text-sm font-bold text-slate-700">
                  Document date
                  <input className="mt-2 min-h-10 w-full rounded-md border border-slate-200 px-3 text-sm outline-none focus:border-[#061d49] focus:ring-4 focus:ring-[#061d49]/10" onChange={(event) => setDocumentDate(event.target.value)} type="date" value={documentDate} />
                </label>

                <label className="block text-sm font-bold text-slate-700">
                  Confidentiality
                  <SelectFilter className="mt-2 w-full" onChange={(event) => setConfidentialityId(event.target.value)} required value={confidentialityId}>
                    {missingConfidentialityLevels ? <option value="">No active confidentiality levels</option> : null}
                    {reference?.confidentialityLevels.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
                  </SelectFilter>
                </label>

                <label className="block text-sm font-bold text-slate-700">
                  Priority
                  <SelectFilter className="mt-2 w-full" onChange={(event) => setPriorityId(event.target.value)} required value={priorityId}>
                    {missingPriorityLevels ? <option value="">No active priority levels</option> : null}
                    {reference?.priorityLevels.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
                  </SelectFilter>
                </label>

                <label className="block text-sm font-bold text-slate-700">
                  Summary
                  <textarea
                    className="mt-2 min-h-24 w-full rounded-md border border-slate-200 px-3 py-2 text-sm leading-6 outline-none focus:border-[#061d49] focus:ring-4 focus:ring-[#061d49]/10"
                    onChange={(event) => setSummary(event.target.value)}
                    value={summary}
                  />
                </label>
              </div>
            </section>

            <section className="overflow-hidden rounded-lg border border-slate-200/80 bg-white shadow-sm shadow-slate-900/[0.03]">
              <header className="border-b border-slate-200 px-4 py-3">
                <h2 className="text-sm font-bold text-slate-950">Files</h2>
              </header>
              <div className="space-y-3 p-4">
                <label className="flex min-h-24 cursor-pointer flex-col items-center justify-center rounded-lg border border-dashed border-slate-300 bg-slate-50 px-3 py-4 text-center text-sm font-bold text-[#061d49] transition hover:bg-white">
                  <Icon className="mb-2 h-5 w-5" name="upload" />
                  Add files
                  <input className="sr-only" multiple onChange={(event) => addFiles(event.target.files)} type="file" />
                </label>
                {files.length ? (
                  <div className="space-y-2">
                    {files.map((file, index) => (
                      <div className="flex min-w-0 items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2" key={`${file.name}-${file.size}-${index}`}>
                        <Icon className="h-4 w-4 shrink-0 text-slate-500" name="document" />
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-semibold text-slate-900">{file.name}</p>
                          <p className="text-xs text-slate-500">{fileSizeLabel(file.size)}</p>
                        </div>
                        <button className="text-sm font-bold text-red-600 hover:text-red-700" onClick={() => removeFile(index)} type="button">Remove</button>
                      </div>
                    ))}
                  </div>
                ) : null}
              </div>
            </section>
          </aside>

          <main className={cx("min-w-0", mobileView === "write" ? "block" : "hidden xl:block")}>
            <section className="overflow-hidden rounded-lg border border-slate-200/80 bg-white shadow-sm shadow-slate-900/[0.03]">
              <header className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200/80 px-4 py-3">
                <div className="min-w-0">
                  <h2 className="text-base font-bold text-slate-950">Write document</h2>
                  <p className="mt-1 text-xs font-semibold text-slate-500">
                    {requiredFieldTotal ? `${requiredFieldComplete}/${requiredFieldTotal} required fields complete` : "No required fields"}
                  </p>
                </div>
                {requiredFieldTotal ? (
                  <div className="h-2 w-32 max-w-full overflow-hidden rounded-full bg-slate-100" aria-hidden="true">
                    <div
                      className={cx("h-full rounded-full", missingRequiredFields.length ? "bg-amber-500" : "bg-emerald-500")}
                      style={{ width: `${Math.round((requiredFieldComplete / requiredFieldTotal) * 100)}%` }}
                    />
                  </div>
                ) : null}
              </header>

              <div className="bg-white">
                {!documentTypeId ? (
                  <EmptyPreview icon="document">Choose a document type first.</EmptyPreview>
                ) : templateLoading ? (
                  <EmptyPreview icon="template">Loading template fields...</EmptyPreview>
                ) : missingTemplate ? (
                  <EmptyPreview icon="template">
                    This document type cannot be drafted because it has no active published official template.
                  </EmptyPreview>
                ) : (
                  <>
                    <div className="px-2 sm:px-4">
                      {composerFields.map(renderField)}
                    </div>

                    {submitAttempted && missingRequiredFields.length ? (
                      <div className="mx-4 mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">
                        Fill the required template fields before creating the draft.
                      </div>
                    ) : canSubmit ? (
                      <div className="mx-4 mb-4 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-700">
                        Required template fields are complete.
                      </div>
                    ) : (
                      <div className="h-4" aria-hidden="true" />
                    )}
                  </>
                )}
              </div>
            </section>
          </main>

          <aside className={cx("min-w-0 xl:col-span-2 2xl:col-span-1 2xl:sticky 2xl:top-24", mobileView === "preview" ? "block" : "hidden xl:block")}>
            <section className="overflow-hidden rounded-lg border border-slate-200/80 bg-white shadow-sm shadow-slate-900/[0.03]">
              <header className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200/80 px-4 py-3">
                <div className="min-w-0">
                  <h2 className="text-base font-bold text-slate-950">Official preview</h2>
                  <p className="mt-1 text-xs font-semibold text-slate-500">
                    {previewStatus}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Button disabled={!previewPayload || previewLoading} icon="view" onClick={() => void refreshPreview()} variant="secondary">Refresh</Button>
                  <Button disabled={!previewHtml} icon="fullscreen" onClick={openFullscreenPreview} variant="secondary">Fullscreen</Button>
                </div>
              </header>

              <div className="bg-slate-100 p-4">
                {!documentTypeId ? (
                  <EmptyPreview>Select a document type to load the official preview.</EmptyPreview>
                ) : templateLoading ? (
                  <EmptyPreview>Loading template...</EmptyPreview>
                ) : missingTemplate ? (
                  <EmptyPreview icon="template">No published official template is available for staff drafting.</EmptyPreview>
                ) : previewError ? (
                  <EmptyPreview action={<Button icon="reset" onClick={() => void refreshPreview()} variant="secondary">Try again</Button>} icon="x">
                    {previewError}
                  </EmptyPreview>
                ) : previewHtml ? (
                  <iframe
                    className="h-[72vh] min-h-[38rem] w-full rounded-lg border border-slate-200 bg-white shadow-[0_18px_45px_rgba(15,23,42,0.12)] 2xl:h-[calc(100vh-14rem)]"
                    onLoad={handlePreviewFrameLoad}
                    ref={previewFrameRef}
                    srcDoc={previewHtmlForFrame(previewHtml)}
                    title="Official document preview"
                  />
                ) : (
                  <EmptyPreview>The official document preview will appear here.</EmptyPreview>
                )}
              </div>
            </section>
          </aside>
        </div>

        <div className="fixed inset-x-0 bottom-0 z-30 border-t border-slate-200 bg-white/95 p-3 shadow-[0_-12px_30px_rgba(15,23,42,0.12)] backdrop-blur sm:hidden">
          <Button className="w-full" disabled={!canAttemptSubmit || submitting || loadingReference} icon="plus" type="submit" variant="primary">
            {submitting ? "Creating..." : "Create draft"}
          </Button>
        </div>
      </form>
    </section>
  );
}
