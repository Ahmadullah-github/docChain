import { useEffect, useMemo, useRef, useState } from "react";
import type { FormEvent, ReactNode } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { documentApi, templateApi, walkInIssuanceApi } from "../../api";
import type {
  ActiveDocumentTemplate,
  DocumentContent,
  EntityId,
  WalkInExternalPersonInput,
  WalkInHandoverMethod,
  WalkInPrintType,
  WalkInReference,
  WalkInRequestDetail
} from "../../api";
import {
  documentContentFromBody,
  documentContentToPlainText,
  emptyDocumentContent,
  safeDocumentContent,
  StructuredDocumentEditor
} from "../../components/app/StructuredDocumentEditor";
import { FullscreenDocumentPreview } from "../../components/app/FullscreenDocumentPreview";
import { Button, Icon, PanelCard, SelectFilter, StatusBadge } from "../../components/ui";
import { previewHtmlForFrame } from "../../lib/previewFrame";
import { cx } from "../../lib/classNames";
import { openBlobInNewWindow } from "../../lib/downloads";
import { dateInputValue, normalizeTemplateFields, parseTemplateFields } from "./documentEditUtils";
import { formatDateTime, statusLabel, textField } from "./appPageUtils";
import {
  limitStaffTemplateFieldValue,
  missingRequiredStaffTemplateFields,
  staffTemplateFieldsForLayout
} from "./staffTemplateFields";
import type { StaffTemplateFieldDefinition } from "./staffTemplateFields";
import {
  blankWalkInIntakeForm,
  buildCreateWalkInRequestPayload,
  buildUpdateWalkInPersonsPayload,
  intakeFormFromDetail,
  personName,
  personShortName,
  validateWalkInIntake,
  walkInActionState,
  walkInDocumentId,
  walkInDocumentStatus,
  walkInOfficialSerial
} from "./walkInIssuanceUtils";
import type { WalkInIntakeForm, WalkInPersonForm } from "./walkInIssuanceUtils";

type WizardStep = "intake" | "document" | "print" | "handover";

const previewServerDebounceMs = 850;
const stepItems: Array<{ id: WizardStep; label: string }> = [
  { id: "intake", label: "Intake" },
  { id: "document", label: "Document" },
  { id: "print", label: "Finalize & Print" },
  { id: "handover", label: "Handover & Archive" }
];

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function defaultConfidentialityId(reference: WalkInReference | null) {
  return String(reference?.confidentialityLevels.find((item) => item.is_default)?.id || reference?.confidentialityLevels[0]?.id || "");
}

function defaultPriorityId(reference: WalkInReference | null) {
  return String(
    reference?.priorityLevels.find((item) => item.is_default)?.id
      || reference?.priorityLevels.find((item) => item.code === "medium")?.id
      || reference?.priorityLevels.find((item) => item.code === "normal")?.id
      || reference?.priorityLevels[0]?.id
      || ""
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

function composerContent(documentContent: DocumentContent, metadata: DocumentContent["metadata"], templateFields: Record<string, string>) {
  return {
    ...documentContent,
    freeBlocks: [],
    metadata,
    templateFields
  };
}

function inputClass(invalid = false) {
  return cx(
    "mt-2 min-h-11 w-full rounded-lg border bg-white px-3 text-sm text-slate-950 shadow-sm shadow-slate-900/[0.02] outline-none transition placeholder:text-slate-400 focus:border-[#061d49] focus:ring-4 focus:ring-[#061d49]/10 disabled:bg-slate-50 disabled:text-slate-500",
    invalid ? "border-red-300" : "border-slate-200"
  );
}

function textareaClass(invalid = false, minHeight = "min-h-24") {
  return cx(inputClass(invalid), minHeight, "resize-none py-3 leading-6");
}

function fieldLabel(label: string, required = false) {
  return (
    <span className="flex min-w-0 items-center justify-between gap-3">
      <span className="min-w-0 truncate text-sm font-bold text-slate-700">{label}</span>
      {required ? <span className="shrink-0 rounded-full bg-slate-100 px-2 py-0.5 text-[0.62rem] font-bold uppercase text-slate-500">required</span> : null}
    </span>
  );
}

function DetailLine({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="min-w-0">
      <p className="text-[0.7rem] font-bold uppercase text-slate-400">{label}</p>
      <div className="mt-1 min-w-0 text-sm font-semibold text-slate-800">{value}</div>
    </div>
  );
}

function reasonText(value?: string) {
  return value ? <p className="mt-2 text-xs font-semibold leading-5 text-slate-500">{value}</p> : null;
}

function stepForDetail(detail: WalkInRequestDetail | null): WizardStep {
  if (!detail) {
    return "intake";
  }
  if (detail.request.status === "canceled") {
    return "intake";
  }
  if (!detail.document) {
    return "document";
  }
  if (!detail.handoverRecords.length) {
    return "print";
  }
  return "handover";
}

function requestIdFromParams(value?: string) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

function defaultDocumentSubject(detail: WalkInRequestDetail | null) {
  const subjectName = personShortName(detail?.subject);
  return subjectName === "Unnamed person" ? "" : `Walk-in document for ${subjectName}`;
}

function PersonFields({
  disabled,
  onChange,
  person,
  title
}: {
  disabled?: boolean;
  onChange: (person: WalkInPersonForm) => void;
  person: WalkInPersonForm;
  title: string;
}) {
  function update(key: keyof WalkInExternalPersonInput, value: string) {
    onChange({ ...person, [key]: value });
  }

  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50/60 p-3">
      <h3 className="text-sm font-bold text-slate-950">{title}</h3>
      <div className="mt-3 grid gap-3 md:grid-cols-2">
        <label className="block">
          {fieldLabel("First name", true)}
          <input className={inputClass()} disabled={disabled} onChange={(event) => update("first_name", event.target.value)} value={person.first_name} />
        </label>
        <label className="block">
          {fieldLabel("Last name", true)}
          <input className={inputClass()} disabled={disabled} onChange={(event) => update("last_name", event.target.value)} value={person.last_name} />
        </label>
        <label className="block">
          {fieldLabel("Father name", true)}
          <input className={inputClass()} disabled={disabled} onChange={(event) => update("father_name", event.target.value)} value={person.father_name} />
        </label>
        <label className="block">
          {fieldLabel("Phone number", true)}
          <input className={inputClass()} disabled={disabled} inputMode="tel" onChange={(event) => update("phone_number", event.target.value)} value={person.phone_number} />
        </label>
        <label className="block">
          {fieldLabel("Tazkira number", true)}
          <input className={inputClass()} disabled={disabled} onChange={(event) => update("tazkira_number", event.target.value)} value={person.tazkira_number} />
        </label>
        <label className="block">
          {fieldLabel("Address")}
          <input className={inputClass()} disabled={disabled} onChange={(event) => update("address", event.target.value)} value={person.address || ""} />
        </label>
      </div>
      <label className="mt-3 block">
        {fieldLabel("Notes")}
        <textarea className={textareaClass(false, "min-h-20")} disabled={disabled} onChange={(event) => update("notes", event.target.value)} value={person.notes || ""} />
      </label>
    </div>
  );
}

export function WalkInIssuancePage() {
  const navigate = useNavigate();
  const params = useParams();
  const routeRequestId = requestIdFromParams(params.requestId);
  const previewFrameRef = useRef<HTMLIFrameElement | null>(null);

  const [reference, setReference] = useState<WalkInReference | null>(null);
  const [detail, setDetail] = useState<WalkInRequestDetail | null>(null);
  const [activeTemplates, setActiveTemplates] = useState<ActiveDocumentTemplate[]>([]);
  const [selectedBindingId, setSelectedBindingId] = useState("");
  const [intake, setIntake] = useState<WalkInIntakeForm>(() => blankWalkInIntakeForm());
  const [step, setStep] = useState<WizardStep>("intake");
  const [documentDate, setDocumentDate] = useState(todayIso());
  const [confidentialityId, setConfidentialityId] = useState("");
  const [priorityId, setPriorityId] = useState("");
  const [subject, setSubject] = useState("");
  const [summary, setSummary] = useState("");
  const [templateFields, setTemplateFields] = useState<Record<string, string>>({});
  const [documentContent, setDocumentContent] = useState<DocumentContent>(() => emptyDocumentContent({ date: todayIso() }));
  const [touchedFields, setTouchedFields] = useState<Record<string, boolean>>({});
  const [documentSubmitAttempted, setDocumentSubmitAttempted] = useState(false);
  const [previewHtml, setPreviewHtml] = useState<string | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [previewUpdatedAt, setPreviewUpdatedAt] = useState<string | null>(null);
  const [printType, setPrintType] = useState<WalkInPrintType>("original");
  const [printReason, setPrintReason] = useState("");
  const [printCopyNumber, setPrintCopyNumber] = useState("1");
  const [handoverMethod, setHandoverMethod] = useState<WalkInHandoverMethod>("physical_original");
  const [handoverCopyCount, setHandoverCopyCount] = useState("1");
  const [handoverNote, setHandoverNote] = useState("");
  const [archiveReason, setArchiveReason] = useState("");
  const [loadingReference, setLoadingReference] = useState(true);
  const [loadingDetail, setLoadingDetail] = useState(Boolean(routeRequestId));
  const [templateLoading, setTemplateLoading] = useState(false);
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  async function loadDetail(requestId: EntityId, options: { quiet?: boolean } = {}) {
    if (!options.quiet) {
      setLoadingDetail(true);
    }
    setError(null);
    try {
      const nextDetail = await walkInIssuanceApi.getRequest(requestId);
      setDetail(nextDetail);
      setIntake(intakeFormFromDetail(nextDetail));
      setStep(stepForDetail(nextDetail));
      hydrateDocumentForm(nextDetail);
      return nextDetail;
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not load walk-in request.");
      return null;
    } finally {
      if (!options.quiet) {
        setLoadingDetail(false);
      }
    }
  }

  function hydrateDocumentForm(nextDetail: WalkInRequestDetail) {
    if (nextDetail.document) {
      const nextTemplateFields = normalizeTemplateFields(parseTemplateFields(nextDetail.document.template_fields));
      const nextDate = dateInputValue(nextDetail.document.document_date) || todayIso();
      const nextSubject = textField(nextDetail.document, "subject", "");
      const nextSummary = textField(nextDetail.document, "summary", "");
      setDocumentDate(nextDate);
      setSubject(nextSubject);
      setSummary(nextSummary);
      setTemplateFields(nextTemplateFields);
      setDocumentContent(safeDocumentContent(nextDetail.document.document_content, textField(nextDetail.document, "body", ""), {
        date: nextDate,
        subject: nextSubject,
        summary: nextSummary || undefined
      }, nextTemplateFields));
    } else {
      setSubject((current) => current || defaultDocumentSubject(nextDetail));
      setDocumentContent((current) => ({
        ...current,
        metadata: {
          ...current.metadata,
          date: documentDate || todayIso(),
          subject: subject || defaultDocumentSubject(nextDetail) || undefined
        }
      }));
    }
  }

  useEffect(() => {
    setLoadingReference(true);
    walkInIssuanceApi.reference()
      .then((result) => {
        setReference(result);
        setConfidentialityId((current) => current || defaultConfidentialityId(result));
        setPriorityId((current) => current || defaultPriorityId(result));
      })
      .catch(() => setError("Could not load walk-in reference data."))
      .finally(() => setLoadingReference(false));
  }, []);

  useEffect(() => {
    if (routeRequestId) {
      void loadDetail(routeRequestId as EntityId);
      return;
    }
    setDetail(null);
    setIntake(blankWalkInIntakeForm());
    setStep("intake");
    setLoadingDetail(false);
  }, [routeRequestId]);

  const documentTypeId = detail?.request.document_type_id ? String(detail.request.document_type_id) : intake.document_type_id;
  const actionState = useMemo(() => walkInActionState(detail), [detail]);
  const selectedDocumentType = reference?.documentTypes.find((item) => String(item.id) === documentTypeId) || null;
  const selectedTemplate = activeTemplates.find((row) => String(row.id) === selectedBindingId) || activeTemplates[0] || null;
  const selectedTemplateName = selectedTemplate?.templateName || (selectedTemplate ? `Template #${selectedTemplate.template_id}` : "");
  const selectedTemplateVersion = selectedTemplate?.templateVersionNumber
    ? `v${selectedTemplate.templateVersionNumber}`
    : selectedTemplate
      ? `version ${selectedTemplate.template_version_id}`
      : "";
  const staffFields = useMemo(() => staffTemplateFieldsForLayout(selectedTemplate?.layout_definition || null), [selectedTemplate]);
  const composerFields = useMemo(() => orderedStaffFields(staffFields), [staffFields]);
  const bodyText = useMemo(() => documentContentToPlainText(documentContent), [documentContent]);
  const normalizedTemplateFields = useMemo(() => normalizeTemplateFields(templateFields), [templateFields]);
  const documentMetadata = useMemo(() => ({
    date: documentDate || null,
    subject: subject.trim() || undefined,
    summary: summary.trim() || undefined
  }), [documentDate, subject, summary]);
  const missingRequiredFields = useMemo(() => missingRequiredStaffTemplateFields(staffFields, {
    bodyText,
    subject,
    templateFields
  }), [bodyText, staffFields, subject, templateFields]);
  const missingReferenceData = Boolean(reference && (!reference.confidentialityLevels.length || !reference.priorityLevels.length));
  const canCreateDraft = Boolean(actionState.canCreateDocument && selectedTemplate && confidentialityId && priorityId && !missingReferenceData && !missingRequiredFields.length);
  const officialSerial = walkInOfficialSerial(detail);
  const linkedDocumentId = walkInDocumentId(detail);
  const linkedDocumentStatus = walkInDocumentStatus(detail) || "none";

  useEffect(() => {
    if (!documentTypeId) {
      setActiveTemplates([]);
      setSelectedBindingId("");
      setPreviewHtml(null);
      return;
    }

    let alive = true;
    setTemplateLoading(true);
    setPreviewError(null);
    templateApi.activeFor({ document_type_id: Number(documentTypeId), locale: "all", variant: "official" })
      .then((rows) => {
        if (!alive) {
          return;
        }
        const uniqueRows = uniqueActiveTemplates(rows);
        setActiveTemplates(uniqueRows);
        setSelectedBindingId((current) => current && uniqueRows.some((row) => String(row.id) === current) ? current : String(uniqueRows[0]?.id || ""));
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

  useEffect(() => {
    setTemplateFields((current) => Object.fromEntries(
      staffFields
        .filter((definition) => definition.kind === "template")
        .map((definition) => [definition.key, current[definition.key] || ""])
    ));
  }, [staffFields]);

  const previewPayload = useMemo(() => {
    if (!selectedTemplate) {
      return null;
    }

    const content = composerContent(documentContent, {
      ...documentMetadata,
      subject: subject.trim() || "Draft subject"
    }, normalizedTemplateFields);
    return {
      body: documentContentToPlainText(content) || "Draft body will appear here.",
      confidentiality_level_id: confidentialityId ? Number(confidentialityId) as EntityId : null,
      document_content: content,
      document_date: documentDate || null,
      document_type_id: documentTypeId ? Number(documentTypeId) as EntityId : null,
      layout_definition: selectedTemplate.layout_definition,
      locale: "all" as const,
      priority_level_id: priorityId ? Number(priorityId) as EntityId : null,
      subject: subject.trim() || "Draft subject",
      summary: summary.trim() || null,
      template_fields: normalizedTemplateFields,
      template_id: selectedTemplate.template_id,
      template_version_id: selectedTemplate.template_version_id,
      variant: "official" as const
    };
  }, [confidentialityId, documentContent, documentDate, documentMetadata, documentTypeId, normalizedTemplateFields, priorityId, selectedTemplate, subject, summary]);

  useEffect(() => {
    if (step !== "document" || !previewPayload || detail?.document) {
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
            setPreviewError(caught instanceof Error ? caught.message : "Could not render official preview.");
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
  }, [detail?.document, previewPayload, step]);

  function setIntakePerson(role: "person" | "requester" | "subject" | "taker", person: WalkInPersonForm) {
    setIntake((current) => ({ ...current, [role]: person }));
  }

  function setStudentField(key: keyof WalkInIntakeForm["student"], value: string | boolean) {
    setIntake((current) => ({
      ...current,
      student: {
        ...current.student,
        [key]: value
      }
    }));
  }

  function setIntakeField(key: keyof Pick<WalkInIntakeForm, "destination_organization" | "document_type_id" | "purpose" | "relationship_to_subject" | "separatePeople">, value: string | boolean) {
    setIntake((current) => ({ ...current, [key]: value }));
  }

  function touchField(definition: StaffTemplateFieldDefinition) {
    const key = staffFieldId(definition);
    setTouchedFields((current) => current[key] ? current : { ...current, [key]: true });
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

  function scrollToFirstMissingDocumentField() {
    const firstMissing = missingRequiredFields[0];
    if (!firstMissing) {
      return;
    }
    window.requestAnimationFrame(() => {
      const field = document.querySelector<HTMLElement>(`[data-walk-in-field="${staffFieldId(firstMissing)}"]`);
      field?.scrollIntoView({ behavior: "smooth", block: "center" });
      field?.querySelector<HTMLElement>("input, textarea, [contenteditable='true']")?.focus();
    });
  }

  async function saveIntake(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const validationErrors = validateWalkInIntake(intake);
    if (validationErrors.length) {
      setError(validationErrors[0]);
      return;
    }

    setBusyAction(detail ? "save-intake" : "create-intake");
    setError(null);
    setNotice(null);
    try {
      if (detail) {
        const updated = await walkInIssuanceApi.updatePersons(detail.request.id, buildUpdateWalkInPersonsPayload(intake));
        setDetail(updated);
        setIntake(intakeFormFromDetail(updated));
        setNotice("Intake people and student details saved.");
      } else {
        const created = await walkInIssuanceApi.createRequest(buildCreateWalkInRequestPayload(intake));
        setDetail(created);
        setIntake(intakeFormFromDetail(created));
        setSubject(defaultDocumentSubject(created));
        setStep("document");
        setNotice("Walk-in intake created.");
        navigate(`/app/walk-in-issuance/${created.request.id}`, { replace: true });
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not save walk-in intake.");
    } finally {
      setBusyAction(null);
    }
  }

  async function refreshPreview() {
    if (!previewPayload) {
      return;
    }
    setPreviewLoading(true);
    setPreviewError(null);
    try {
      const result = await templateApi.preview(previewPayload);
      setPreviewHtml(result.html || null);
      setPreviewUpdatedAt(new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }));
    } catch (caught) {
      setPreviewError(caught instanceof Error ? caught.message : "Could not render official preview.");
    } finally {
      setPreviewLoading(false);
    }
  }

  async function createLinkedDocument(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setDocumentSubmitAttempted(true);
    if (!detail || !selectedTemplate || !canCreateDraft) {
      if (missingRequiredFields.length) {
        scrollToFirstMissingDocumentField();
      }
      return;
    }

    setBusyAction("create-document");
    setError(null);
    setNotice(null);
    try {
      const content = composerContent(documentContent, {
        ...documentMetadata,
        subject: subject.trim(),
        summary: summary.trim() || undefined
      }, normalizedTemplateFields);
      const updated = await walkInIssuanceApi.createDocument(detail.request.id, {
        body: documentContentToPlainText(content),
        change_reason: "Created from walk-in issuance.",
        confidentiality_level_id: Number(confidentialityId) as EntityId,
        document_content: content,
        document_date: documentDate || null,
        priority_level_id: Number(priorityId) as EntityId,
        subject: subject.trim(),
        summary: summary.trim() || null,
        template_fields: normalizedTemplateFields
      });
      const createdDocumentId = walkInDocumentId(updated);
      if (createdDocumentId) {
        try {
          await templateApi.saveLayoutDraft(createdDocumentId, {
            base_template_version_id: selectedTemplate.template_version_id,
            layout_definition: selectedTemplate.layout_definition
          });
        } catch {
          setNotice("Document created, but the selected template layout could not be saved. Official rendering will use the active template binding.");
        }
      }
      setDetail(updated);
      setStep("print");
      setNotice((current) => current || "Linked draft document created.");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not create the linked document.");
    } finally {
      setBusyAction(null);
    }
  }

  async function finalizeDocument() {
    if (!detail || !linkedDocumentId) {
      return;
    }
    setBusyAction("finalize");
    setError(null);
    setNotice(null);
    try {
      await documentApi.finalize(linkedDocumentId, { note: "Finalized from walk-in issuance." });
      await loadDetail(detail.request.id, { quiet: true });
      setNotice("Document finalized and official serial assigned.");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not finalize the document.");
    } finally {
      setBusyAction(null);
    }
  }

  async function openOfficialPdf() {
    if (!linkedDocumentId) {
      return;
    }
    const pdfWindow = window.open("about:blank", "_blank");
    if (pdfWindow) {
      pdfWindow.opener = null;
    }
    setBusyAction("pdf");
    setError(null);
    try {
      const rendered = await templateApi.renderPdf(linkedDocumentId, {
        locale: "all",
        variant: "official"
      });
      openBlobInNewWindow(rendered.blob, pdfWindow);
    } catch (caught) {
      pdfWindow?.close();
      setError(caught instanceof Error ? caught.message : "Could not prepare official PDF.");
    } finally {
      setBusyAction(null);
    }
  }

  async function recordPrintEvent(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!detail || !actionState.canPrint) {
      return;
    }
    setBusyAction("print");
    setError(null);
    setNotice(null);
    try {
      const updated = await walkInIssuanceApi.recordPrintEvent(detail.request.id, {
        copy_number: Math.max(1, Number(printCopyNumber) || 1),
        print_reason: printReason.trim() || null,
        print_type: printType
      });
      setDetail(updated);
      setNotice("Print event recorded.");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not record print event.");
    } finally {
      setBusyAction(null);
    }
  }

  async function recordHandover(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!detail || !actionState.canHandover) {
      return;
    }
    setBusyAction("handover");
    setError(null);
    setNotice(null);
    try {
      const updated = await walkInIssuanceApi.recordHandover(detail.request.id, {
        copy_count: Math.max(1, Number(handoverCopyCount) || 1),
        handover_method: handoverMethod,
        handover_note: handoverNote.trim() || null
      });
      setDetail(updated);
      setStep("handover");
      setNotice("Physical handover recorded.");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not record handover.");
    } finally {
      setBusyAction(null);
    }
  }

  async function archiveRequest(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!detail || !actionState.canArchive) {
      return;
    }
    setBusyAction("archive");
    setError(null);
    setNotice(null);
    try {
      const updated = await walkInIssuanceApi.archive(detail.request.id, { reason: archiveReason.trim() || null });
      setDetail(updated);
      setNotice("Walk-in issuance archived.");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not archive walk-in issuance.");
    } finally {
      setBusyAction(null);
    }
  }

  function renderTemplateField(definition: StaffTemplateFieldDefinition) {
    const isMissing = missingRequiredFields.some((field) => field.kind === definition.kind && field.key === definition.key);
    const touchKey = staffFieldId(definition);
    const showError = isMissing && (documentSubmitAttempted || touchedFields[touchKey]);
    const disabled = Boolean(detail?.document);
    const label = fieldLabel(definition.label, definition.required);

    if (definition.kind === "subject") {
      return (
        <label className="block scroll-mt-28 border-b border-slate-100 px-4 py-5 last:border-b-0" data-walk-in-field={touchKey} key={touchKey}>
          {label}
          <input
            className={inputClass(showError)}
            disabled={disabled}
            maxLength={definition.maxLength}
            onBlur={() => touchField(definition)}
            onChange={(event) => updateSubject(definition, event.target.value)}
            placeholder={definition.placeholder}
            value={subject}
          />
          {showError ? <span className="mt-2 block text-xs font-semibold text-red-600">This field is required.</span> : null}
        </label>
      );
    }

    if (definition.kind === "body") {
      return (
        <div className="scroll-mt-28 border-b border-slate-100 px-4 py-5 last:border-b-0" data-walk-in-field={touchKey} key={touchKey}>
          {label}
          <div className="mt-2">
            {definition.richText ? (
              <StructuredDocumentEditor
                allowFreeBlocks={false}
                allowTables={false}
                disabled={disabled}
                invalid={showError}
                onChange={disabled ? undefined : updateRichBody}
                placeholder={definition.placeholder}
                toolbarMode="minimal"
                value={documentContent}
              />
            ) : (
              <textarea
                className={textareaClass(showError, "min-h-64")}
                disabled={disabled}
                maxLength={definition.maxLength}
                onBlur={() => touchField(definition)}
                onChange={(event) => updatePlainBody(definition, event.target.value)}
                placeholder={definition.placeholder}
                value={bodyText}
              />
            )}
          </div>
          {showError ? <span className="mt-2 block text-xs font-semibold text-red-600">Body is required.</span> : null}
        </div>
      );
    }

    const value = templateFields[definition.key] || "";
    return (
      <label className="block scroll-mt-28 border-b border-slate-100 px-4 py-5 last:border-b-0" data-walk-in-field={touchKey} key={touchKey}>
        {label}
        {definition.multiline ? (
          <textarea
            className={textareaClass(showError)}
            disabled={disabled}
            maxLength={definition.maxLength}
            onBlur={() => touchField(definition)}
            onChange={(event) => updateTemplateField(definition, event.target.value)}
            placeholder={definition.placeholder}
            value={value}
          />
        ) : (
          <input
            className={inputClass(showError)}
            disabled={disabled}
            maxLength={definition.maxLength}
            onBlur={() => touchField(definition)}
            onChange={(event) => updateTemplateField(definition, event.target.value)}
            placeholder={definition.placeholder}
            value={value}
          />
        )}
        {showError ? <span className="mt-2 block text-xs font-semibold text-red-600">This field is required.</span> : null}
      </label>
    );
  }

  function renderIntakeStep() {
    const intakeLocked = Boolean(detail && ["handed_over", "archived", "canceled"].includes(detail.request.status));
    const canSaveIntake = !intakeLocked && busyAction !== "create-intake" && busyAction !== "save-intake";
    return (
      <form className="space-y-5" onSubmit={saveIntake}>
        <div className="grid gap-4 md:grid-cols-2">
          <label className="block">
            {fieldLabel("Document type", true)}
            <SelectFilter className="mt-2 w-full" disabled={Boolean(detail) || loadingReference} onChange={(event) => setIntakeField("document_type_id", event.target.value)} value={intake.document_type_id}>
              <option value="">Select document type</option>
              {reference?.documentTypes.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
            </SelectFilter>
          </label>
          <label className="block">
            {fieldLabel("Destination organization")}
            <input className={inputClass()} disabled={intakeLocked} onChange={(event) => setIntakeField("destination_organization", event.target.value)} value={intake.destination_organization} />
          </label>
        </div>

        <label className="block">
          {fieldLabel("Purpose")}
          <textarea className={textareaClass(false, "min-h-20")} disabled={intakeLocked} onChange={(event) => setIntakeField("purpose", event.target.value)} value={intake.purpose} />
        </label>

        <label className="inline-flex items-center gap-3 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-bold text-slate-700">
          <input
            checked={!intake.separatePeople}
            className="h-4 w-4 rounded border-slate-300 text-[#061d49] focus:ring-[#061d49]"
            disabled={intakeLocked}
            onChange={(event) => setIntakeField("separatePeople", !event.target.checked)}
            type="checkbox"
          />
          Requester, document subject, and physical receiver are the same person
        </label>

        {!intake.separatePeople ? (
          <PersonFields disabled={intakeLocked} onChange={(person) => setIntakePerson("person", person)} person={intake.person} title="Person details" />
        ) : (
          <div className="space-y-3">
            <PersonFields disabled={intakeLocked} onChange={(person) => setIntakePerson("requester", person)} person={intake.requester} title="Requester" />
            <PersonFields disabled={intakeLocked} onChange={(person) => setIntakePerson("subject", person)} person={intake.subject} title="Document subject" />
            <PersonFields disabled={intakeLocked} onChange={(person) => setIntakePerson("taker", person)} person={intake.taker} title="Physical receiver" />
            <label className="block">
              {fieldLabel("Receiver relationship to subject", true)}
              <input className={inputClass()} disabled={intakeLocked} onChange={(event) => setIntakeField("relationship_to_subject", event.target.value)} value={intake.relationship_to_subject} />
            </label>
          </div>
        )}

        <div className="rounded-lg border border-slate-200 bg-slate-50/60 p-3">
          <label className="inline-flex items-center gap-3 text-sm font-bold text-slate-700">
            <input
              checked={intake.student.is_student}
              className="h-4 w-4 rounded border-slate-300 text-[#061d49] focus:ring-[#061d49]"
              disabled={intakeLocked}
              onChange={(event) => setStudentField("is_student", event.target.checked)}
              type="checkbox"
            />
            Subject is a student
          </label>
          {intake.student.is_student ? (
            <div className="mt-3 grid gap-3 md:grid-cols-3">
              <label className="block">
                {fieldLabel("Faculty", true)}
                <SelectFilter className="mt-2 w-full" disabled={intakeLocked} onChange={(event) => setStudentField("faculty_id", event.target.value)} value={intake.student.faculty_id}>
                  <option value="">Select faculty</option>
                  {reference?.faculties.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
                </SelectFilter>
              </label>
              <label className="block">
                {fieldLabel("Department", true)}
                <SelectFilter className="mt-2 w-full" disabled={intakeLocked} onChange={(event) => setStudentField("department_id", event.target.value)} value={intake.student.department_id}>
                  <option value="">Select department</option>
                  {reference?.departments.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
                </SelectFilter>
              </label>
              <label className="block">
                {fieldLabel("Semester", true)}
                <input className={inputClass()} disabled={intakeLocked} onChange={(event) => setStudentField("semester", event.target.value)} value={intake.student.semester} />
              </label>
              <label className="block">
                {fieldLabel("Academic year")}
                <input className={inputClass()} disabled={intakeLocked} onChange={(event) => setStudentField("academic_year", event.target.value)} value={intake.student.academic_year} />
              </label>
              <label className="block">
                {fieldLabel("Registration number")}
                <input className={inputClass()} disabled={intakeLocked} onChange={(event) => setStudentField("student_registration_number", event.target.value)} value={intake.student.student_registration_number} />
              </label>
              <label className="block">
                {fieldLabel("Student status")}
                <input className={inputClass()} disabled={intakeLocked} onChange={(event) => setStudentField("student_status", event.target.value)} value={intake.student.student_status} />
              </label>
              <label className="block md:col-span-3">
                {fieldLabel("Student notes")}
                <textarea className={textareaClass(false, "min-h-20")} disabled={intakeLocked} onChange={(event) => setStudentField("student_notes", event.target.value)} value={intake.student.student_notes} />
              </label>
            </div>
          ) : null}
        </div>

        <div className="flex flex-wrap items-center justify-end gap-2 border-t border-slate-100 pt-4">
          {detail ? (
            <Button disabled={!canSaveIntake} icon="save" type="submit" variant="primary">
              {busyAction === "save-intake" ? "Saving..." : "Save intake changes"}
            </Button>
          ) : (
            <Button disabled={!canSaveIntake} icon="plus" type="submit" variant="primary">
              {busyAction === "create-intake" ? "Creating..." : "Create intake"}
            </Button>
          )}
        </div>
      </form>
    );
  }

  function renderDocumentStep() {
    if (!detail) {
      return <div className="rounded-lg bg-slate-50 px-4 py-6 text-sm font-semibold text-slate-600">Create the intake request first.</div>;
    }

    if (detail.document) {
      return (
        <div className="space-y-4">
          <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-800">
            Linked draft document already exists.
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <DetailLine label="Document" value={<Link className="font-bold text-[#061d49] hover:underline" to={`/app/documents/${detail.document.id}`}>{detail.document.subject}</Link>} />
            <DetailLine label="Status" value={<StatusBadge>{detail.document.status}</StatusBadge>} />
          </div>
        </div>
      );
    }

    return (
      <form className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(20rem,30rem)]" onSubmit={createLinkedDocument}>
        <div className="min-w-0 rounded-lg border border-slate-200">
          <div className="grid gap-4 border-b border-slate-200 p-4 md:grid-cols-2">
            <label className="block">
              {fieldLabel("Document date")}
              <input className={inputClass()} onChange={(event) => setDocumentDate(event.target.value)} type="date" value={documentDate} />
            </label>
            {activeTemplates.length > 1 ? (
              <label className="block">
                {fieldLabel("Official template", true)}
                <SelectFilter className="mt-2 w-full" onChange={(event) => setSelectedBindingId(event.target.value)} value={selectedBindingId}>
                  {activeTemplates.map((template) => (
                    <option key={template.id} value={template.id}>
                      {template.templateName || `Template #${template.template_id}`} / v{template.templateVersionNumber || template.template_version_id}
                    </option>
                  ))}
                </SelectFilter>
              </label>
            ) : (
              <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-3">
                <p className="text-sm font-bold text-slate-950">{templateLoading ? "Loading template..." : selectedTemplateName || "No active official template"}</p>
                {selectedTemplate ? <p className="mt-1 text-xs font-semibold text-slate-500">{selectedTemplateVersion}</p> : null}
              </div>
            )}
            <label className="block">
              {fieldLabel("Confidentiality", true)}
              <SelectFilter className="mt-2 w-full" onChange={(event) => setConfidentialityId(event.target.value)} value={confidentialityId}>
                {reference?.confidentialityLevels.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
              </SelectFilter>
            </label>
            <label className="block">
              {fieldLabel("Priority", true)}
              <SelectFilter className="mt-2 w-full" onChange={(event) => setPriorityId(event.target.value)} value={priorityId}>
                {reference?.priorityLevels.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
              </SelectFilter>
            </label>
            <label className="block md:col-span-2">
              {fieldLabel("Summary")}
              <textarea className={textareaClass(false, "min-h-20")} onChange={(event) => setSummary(event.target.value)} value={summary} />
            </label>
          </div>

          {selectedTemplate ? (
            <div>
              {composerFields.map(renderTemplateField)}
            </div>
          ) : (
            <div className="p-4 text-sm font-semibold text-amber-700">
              {templateLoading ? "Loading the active official template..." : "No active published official template is available for this document type."}
            </div>
          )}

          <div className="flex flex-wrap items-center justify-end gap-2 border-t border-slate-200 p-4">
            <Button disabled={!previewPayload || previewLoading} icon="view" onClick={refreshPreview}>
              {previewLoading ? "Rendering..." : "Refresh preview"}
            </Button>
            <Button disabled={!canCreateDraft || busyAction === "create-document"} icon="plus" type="submit" variant="primary">
              {busyAction === "create-document" ? "Creating..." : "Create linked draft"}
            </Button>
          </div>
        </div>

        <aside className="min-w-0 xl:sticky xl:top-24 xl:self-start">
          <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
            <header className="flex items-center justify-between gap-3 border-b border-slate-200 px-4 py-3">
              <div className="min-w-0">
                <p className="truncate text-sm font-bold text-slate-950">Official preview</p>
                <p className="mt-1 text-xs font-semibold text-slate-500">{previewUpdatedAt ? `Updated ${previewUpdatedAt}` : "Draft preview"}</p>
              </div>
              <Button disabled={!previewHtml} icon="fullscreen" onClick={() => setPreviewOpen(true)}>Open</Button>
            </header>
            {previewError ? <div className="border-b border-amber-200 bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-800">{previewError}</div> : null}
            {previewHtml ? (
              <iframe className="h-[34rem] w-full border-0 bg-slate-100" ref={previewFrameRef} srcDoc={previewHtmlForFrame(previewHtml)} title="Walk-in official preview" />
            ) : (
              <div className="grid h-[34rem] place-items-center bg-slate-50 px-5 text-center text-sm font-semibold leading-6 text-slate-500">
                {previewLoading ? "Rendering preview..." : "Choose a document type and template fields to render a preview."}
              </div>
            )}
          </div>
          {reasonText(actionState.reasons.createDocument)}
        </aside>
      </form>
    );
  }

  function renderPrintStep() {
    if (!detail?.document) {
      return <div className="rounded-lg bg-slate-50 px-4 py-6 text-sm font-semibold text-slate-600">Create the linked document first.</div>;
    }

    return (
      <div className="space-y-5">
        <div className="grid gap-4 md:grid-cols-3">
          <DetailLine label="Document status" value={<StatusBadge>{linkedDocumentStatus}</StatusBadge>} />
          <DetailLine label="Official serial" value={officialSerial || <span className="text-slate-400">Not assigned</span>} />
          <DetailLine label="Print events" value={String(detail.printEvents.length)} />
        </div>

        <div className="rounded-lg border border-slate-200 p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h3 className="text-sm font-bold text-slate-950">Finalize document</h3>
              {reasonText(actionState.reasons.finalize)}
            </div>
            <Button disabled={!actionState.canFinalize || busyAction === "finalize"} icon="serial" onClick={finalizeDocument} variant="primary">
              {busyAction === "finalize" ? "Finalizing..." : "Finalize"}
            </Button>
          </div>
        </div>

        <div className="rounded-lg border border-slate-200 p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h3 className="text-sm font-bold text-slate-950">Official PDF</h3>
              {reasonText(actionState.reasons.renderPdf)}
            </div>
            <Button disabled={!actionState.canRenderPdf || busyAction === "pdf"} icon="export" onClick={openOfficialPdf}>
              {busyAction === "pdf" ? "Preparing..." : "Open PDF"}
            </Button>
          </div>
        </div>

        <form className="rounded-lg border border-slate-200 p-4" onSubmit={recordPrintEvent}>
          <div className="grid gap-3 md:grid-cols-3">
            <label className="block">
              {fieldLabel("Print type")}
              <SelectFilter className="mt-2 w-full" disabled={!actionState.canPrint} onChange={(event) => setPrintType(event.target.value as WalkInPrintType)} value={printType}>
                <option value="original">Original</option>
                <option value="copy">Copy</option>
                <option value="reprint">Reprint</option>
              </SelectFilter>
            </label>
            <label className="block">
              {fieldLabel("Copy number")}
              <input className={inputClass()} disabled={!actionState.canPrint} min={1} onChange={(event) => setPrintCopyNumber(event.target.value)} type="number" value={printCopyNumber} />
            </label>
            <label className="block md:col-span-3">
              {fieldLabel("Print reason")}
              <textarea className={textareaClass(false, "min-h-20")} disabled={!actionState.canPrint} onChange={(event) => setPrintReason(event.target.value)} value={printReason} />
            </label>
          </div>
          <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-4">
            {reasonText(actionState.reasons.print)}
            <Button disabled={!actionState.canPrint || busyAction === "print"} icon="save" type="submit" variant="primary">
              {busyAction === "print" ? "Recording..." : "Record print"}
            </Button>
          </div>
        </form>

        {detail.printEvents.length ? (
          <div className="divide-y divide-slate-100 rounded-lg border border-slate-200">
            {detail.printEvents.map((event) => (
              <div className="grid gap-2 px-4 py-3 text-sm sm:grid-cols-[1fr_auto]" key={event.id}>
                <div className="font-semibold text-slate-800">{statusLabel(event.print_type)} / copy {event.copy_number}</div>
                <div className="text-slate-500">{formatDateTime(event.printed_at)}</div>
              </div>
            ))}
          </div>
        ) : null}
      </div>
    );
  }

  function renderHandoverStep() {
    if (!detail?.document) {
      return <div className="rounded-lg bg-slate-50 px-4 py-6 text-sm font-semibold text-slate-600">Create the linked document first.</div>;
    }

    return (
      <div className="space-y-5">
        <div className="rounded-lg border border-slate-200 bg-slate-50/60 p-4">
          <div className="grid gap-4 md:grid-cols-3">
            <DetailLine label="Receiver" value={personName(detail.taker) || "Unknown receiver"} />
            <DetailLine label="Relationship" value={detail.request.taker_relationship_to_subject || "-"} />
            <DetailLine label="Official serial" value={officialSerial || "-"} />
          </div>
        </div>

        <form className="rounded-lg border border-slate-200 p-4" onSubmit={recordHandover}>
          <div className="grid gap-3 md:grid-cols-3">
            <label className="block">
              {fieldLabel("Handover method")}
              <SelectFilter className="mt-2 w-full" disabled={!actionState.canHandover} onChange={(event) => setHandoverMethod(event.target.value as WalkInHandoverMethod)} value={handoverMethod}>
                <option value="physical_original">Physical original</option>
                <option value="physical_copy">Physical copy</option>
                <option value="reprint">Reprint</option>
              </SelectFilter>
            </label>
            <label className="block">
              {fieldLabel("Copy count")}
              <input className={inputClass()} disabled={!actionState.canHandover} min={1} onChange={(event) => setHandoverCopyCount(event.target.value)} type="number" value={handoverCopyCount} />
            </label>
            <label className="block md:col-span-3">
              {fieldLabel("Handover note")}
              <textarea className={textareaClass(false, "min-h-20")} disabled={!actionState.canHandover} onChange={(event) => setHandoverNote(event.target.value)} value={handoverNote} />
            </label>
          </div>
          <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-4">
            {reasonText(actionState.reasons.handover)}
            <Button disabled={!actionState.canHandover || busyAction === "handover"} icon="userCheck" type="submit" variant="primary">
              {busyAction === "handover" ? "Recording..." : "Record handover"}
            </Button>
          </div>
        </form>

        {detail.handoverRecords.length ? (
          <div className="divide-y divide-slate-100 rounded-lg border border-slate-200">
            {detail.handoverRecords.map((record) => (
              <div className="grid gap-2 px-4 py-3 text-sm sm:grid-cols-[1fr_auto]" key={record.id}>
                <div className="font-semibold text-slate-800">{statusLabel(record.handover_method)} / {record.copy_count} copy</div>
                <div className="text-slate-500">{formatDateTime(record.handed_over_at)}</div>
              </div>
            ))}
          </div>
        ) : null}

        <form className="rounded-lg border border-slate-200 p-4" onSubmit={archiveRequest}>
          <label className="block">
            {fieldLabel("Archive reason")}
            <textarea className={textareaClass(false, "min-h-20")} disabled={!actionState.canArchive} onChange={(event) => setArchiveReason(event.target.value)} value={archiveReason} />
          </label>
          <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-4">
            {reasonText(actionState.reasons.archive)}
            <Button disabled={!actionState.canArchive || busyAction === "archive"} icon="lock" type="submit" variant="primary">
              {busyAction === "archive" ? "Archiving..." : "Archive"}
            </Button>
          </div>
        </form>
      </div>
    );
  }

  function renderStepContent() {
    if (loadingReference || loadingDetail) {
      return <div className="p-8 text-sm font-semibold text-slate-600">Loading walk-in issuance...</div>;
    }
    if (step === "intake") {
      return renderIntakeStep();
    }
    if (step === "document") {
      return renderDocumentStep();
    }
    if (step === "print") {
      return renderPrintStep();
    }
    return renderHandoverStep();
  }

  return (
    <section className="mx-auto max-w-[104rem] space-y-4 pb-20">
      {previewOpen && previewHtml ? (
        <FullscreenDocumentPreview
          html={previewHtml}
          onClose={() => setPreviewOpen(false)}
          subtitle={selectedTemplate ? `${selectedTemplateName} ${selectedTemplateVersion ? `/ ${selectedTemplateVersion}` : ""}` : undefined}
          title="Official preview"
        />
      ) : null}

      <div className="rounded-lg border border-slate-200/80 bg-white px-4 py-3 shadow-sm shadow-slate-900/[0.03]">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="flex min-w-0 flex-wrap items-center gap-2">
              <h1 className="text-xl font-bold text-slate-950">Walk-in issuance</h1>
              {detail ? <StatusBadge>{detail.request.status}</StatusBadge> : <StatusBadge>new intake</StatusBadge>}
            </div>
            <p className="mt-1 truncate text-sm text-slate-500">
              {selectedDocumentType?.name || detail?.request.documentTypeName || "Create and hand over an official document for a walk-in claimant."}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {detail?.document ? (
              <Link to={`/app/documents/${detail.document.id}`}>
                <Button icon="document">Open document</Button>
              </Link>
            ) : null}
            {detail ? (
              <Link to="/app/walk-in-issuance">
                <Button icon="plus">New walk-in</Button>
              </Link>
            ) : null}
          </div>
        </div>
      </div>

      {error ? <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">{error}</div> : null}
      {notice ? <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-800">{notice}</div> : null}

      <div className="grid grid-cols-2 gap-2 rounded-lg border border-slate-200 bg-white p-2 md:grid-cols-4">
        {stepItems.map((item, index) => {
          const active = step === item.id;
          return (
            <button
              className={cx(
                "flex min-h-11 min-w-0 items-center justify-center gap-2 rounded-md px-3 text-sm font-bold transition",
                active ? "bg-[#061d49] text-white" : "text-slate-600 hover:bg-slate-50"
              )}
              key={item.id}
              onClick={() => setStep(item.id)}
              type="button"
            >
              <span className={cx("grid h-6 w-6 shrink-0 place-items-center rounded-full text-xs", active ? "bg-white/20" : "bg-slate-100 text-slate-500")}>{index + 1}</span>
              <span className="truncate">{item.label}</span>
            </button>
          );
        })}
      </div>

      <div className="min-w-0">
        <PanelCard bodyClassName="p-0" title={stepItems.find((item) => item.id === step)?.label || "Walk-in issuance"}>
          <div className="p-4">
            {renderStepContent()}
          </div>
        </PanelCard>
      </div>
    </section>
  );
}
