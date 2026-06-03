import { FormEvent, useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { documentApi, templateApi, workspaceApi } from "../../api";
import type {
  DocumentContent,
  DocumentDetail,
  DocumentLayoutDraft,
  DocumentRequestPermissions,
  DocumentTask,
  WorkspaceReference
} from "../../api";
import { useAuth } from "../../app/AuthContext";
import {
  documentContentToPlainText,
  emptyDocumentContent,
  safeDocumentContent,
  StructuredDocumentEditor
} from "../../components/app/StructuredDocumentEditor";
import { Button, PanelCard, SelectFilter, StatusBadge } from "../../components/ui";
import { numberField, textField } from "./appPageUtils";
import {
  dateInputValue,
  draftContentKey,
  limitTemplateFieldValue,
  normalizeTemplateFields,
  parseTemplateFields,
  templateFieldsForLayout
} from "./documentEditUtils";

function booleanValue(value: unknown) {
  return value === true || value === 1 || value === "1" || value === "true";
}

function taskCan(task: DocumentTask, permission: keyof DocumentRequestPermissions) {
  return booleanValue(task[permission]);
}

function taskMatchesActiveAssignment(task: DocumentTask, auth: ReturnType<typeof useAuth>) {
  const active = auth.assignments.find((assignment) => assignment.id === auth.activeAssignmentId) || null;
  if (!active || task.status !== "open") {
    return false;
  }
  const assignedAssignmentId = numberField(task as unknown as Record<string, unknown>, "assigned_assignment_id");
  const assignedUnitId = numberField(task as unknown as Record<string, unknown>, "assigned_unit_id");
  const assignedPositionId = numberField(task as unknown as Record<string, unknown>, "assigned_position_id");
  return assignedAssignmentId === active.id
    || Boolean(assignedUnitId === active.unitId && (!assignedPositionId || assignedPositionId === active.positionId));
}

export function DocumentEditPage() {
  const auth = useAuth();
  const navigate = useNavigate();
  const params = useParams();
  const documentId = Number(params.documentId);
  const [detail, setDetail] = useState<DocumentDetail | null>(null);
  const [reference, setReference] = useState<WorkspaceReference | null>(null);
  const [layoutDraft, setLayoutDraft] = useState<DocumentLayoutDraft | null>(null);
  const [templateFieldValues, setTemplateFieldValues] = useState<Record<string, string>>({});
  const [subject, setSubject] = useState("");
  const [summary, setSummary] = useState("");
  const [documentDate, setDocumentDate] = useState("");
  const [documentContent, setDocumentContent] = useState<DocumentContent>(() => emptyDocumentContent());
  const [confidentialityId, setConfidentialityId] = useState("");
  const [priorityId, setPriorityId] = useState("");
  const [savedDraftKey, setSavedDraftKey] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const [detailResult, referenceResult, layoutDraftResult] = await Promise.all([
        documentApi.get(documentId),
        workspaceApi.reference().catch(() => null),
        templateApi.getLayoutDraft(documentId).catch(() => null)
      ]);
      const parsedTemplateFields = normalizeTemplateFields(parseTemplateFields(detailResult.document.template_fields));
      const nextDate = dateInputValue(detailResult.document.document_date);
      const nextSubject = textField(detailResult.document, "subject", "");
      const nextSummary = textField(detailResult.document, "summary", "");
      const nextContent = safeDocumentContent(detailResult.document.document_content, textField(detailResult.document, "body", ""), {
        date: nextDate || null,
        subject: nextSubject,
        summary: nextSummary || undefined
      }, parsedTemplateFields);
      const nextConfidentialityId = String(numberField(detailResult.document, "confidentiality_level_id") || "");
      const nextPriorityId = String(numberField(detailResult.document, "priority_level_id") || "");

      setDetail(detailResult);
      setReference(referenceResult);
      setLayoutDraft(layoutDraftResult);
      setTemplateFieldValues(parsedTemplateFields);
      setSubject(nextSubject);
      setSummary(nextSummary);
      setDocumentDate(nextDate);
      setDocumentContent(nextContent);
      setConfidentialityId(nextConfidentialityId);
      setPriorityId(nextPriorityId);
      setSavedDraftKey(draftContentKey({
        confidentialityId: nextConfidentialityId,
        content: nextContent,
        date: nextDate,
        priorityId: nextPriorityId,
        subject: nextSubject,
        summary: nextSummary,
        templateFields: parsedTemplateFields
      }));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not load document.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (documentId) {
      void load();
    }
  }, [documentId]);

  const documentRecord = detail?.document || null;
  const documentStatus = textField(documentRecord, "status", "draft");
  const documentTypeId = numberField(documentRecord, "document_type_id");
  const documentWritePermission = reference?.documentWritePermissions.find((permission) => permission.documentTypeId === documentTypeId) || null;
  const activeAssignment = auth.assignments.find((assignment) => assignment.id === auth.activeAssignmentId) || null;
  const isCreator = Boolean(activeAssignment && numberField(documentRecord || {}, "creator_assignment_id") === activeAssignment.id);
  const editTask = detail?.tasks.find((task) => taskMatchesActiveAssignment(task, auth) && taskCan(task, "can_edit")) || null;
  const terminal = ["archived", "closed", "finalized", "serial_assigned"].includes(documentStatus);
  const editable = Boolean(!terminal && (auth.isAdmin || editTask || (isCreator && documentStatus === "draft" && documentWritePermission)));
  const allowRichStructure = Boolean(auth.isAdmin || editTask || documentWritePermission?.mode === "free");
  const templateFieldBlocks = useMemo(() => templateFieldsForLayout(layoutDraft?.layout_definition), [layoutDraft]);
  const normalizedTemplateFields = useMemo(() => normalizeTemplateFields(templateFieldValues), [templateFieldValues]);
  const editedContent = useMemo<DocumentContent>(() => ({
    ...documentContent,
    metadata: {
      ...documentContent.metadata,
      date: documentDate || null,
      subject: subject.trim(),
      summary: summary.trim() || undefined
    },
    templateFields: normalizedTemplateFields
  }), [documentContent, documentDate, normalizedTemplateFields, subject, summary]);
  const currentDraftKey = useMemo(() => draftContentKey({
    confidentialityId,
    content: editedContent,
    date: documentDate,
    priorityId,
    subject,
    summary,
    templateFields: normalizedTemplateFields
  }), [confidentialityId, documentDate, editedContent, normalizedTemplateFields, priorityId, subject, summary]);
  const isDirty = Boolean(editable && savedDraftKey && currentDraftKey !== savedDraftKey);
  const canSave = Boolean(editable && isDirty && subject.trim() && confidentialityId && priorityId && !saving);

  function updateTemplateFieldValue(key: string, value: string, maxLines: number) {
    setTemplateFieldValues((current) => ({
      ...current,
      [key]: limitTemplateFieldValue(value, maxLines)
    }));
  }

  async function saveEdits(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canSave) {
      return;
    }

    setSaving(true);
    setError(null);
    try {
      await documentApi.update(documentId, {
        body: documentContentToPlainText(editedContent),
        change_reason: "Updated from document editor.",
        confidentiality_level_id: Number(confidentialityId),
        document_content: editedContent,
        document_date: documentDate || null,
        priority_level_id: Number(priorityId),
        subject: subject.trim(),
        summary: summary.trim() || null,
        template_fields: normalizedTemplateFields
      });
      navigate(`/app/documents/${documentId}`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not save document.");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return <div className="p-8 text-sm text-slate-600">Loading document editor...</div>;
  }

  if (error && !detail) {
    return <div className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>;
  }

  if (!detail || !documentRecord) {
    return null;
  }

  return (
    <section className="mx-auto max-w-[96rem] space-y-4 pb-20">
      <div className="sticky top-0 z-20 rounded-lg border border-slate-200/80 bg-white px-4 py-3 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <Link className="text-sm font-bold text-[#061d49] hover:underline" to={`/app/documents/${documentId}`}>Back to document</Link>
            <div className="mt-1 flex min-w-0 flex-wrap items-center gap-2">
              <h1 className="truncate text-xl font-bold text-slate-950">Edit document</h1>
              <StatusBadge>{documentStatus}</StatusBadge>
              {isDirty ? <span className="rounded-full bg-amber-50 px-2 py-1 text-xs font-bold text-amber-700 ring-1 ring-amber-200">unsaved</span> : null}
            </div>
            <p className="mt-1 truncate text-sm text-slate-500">{textField(documentRecord, "subject", "Untitled document")}</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Link to={`/app/documents/${documentId}`}>
              <Button>Cancel</Button>
            </Link>
            <Button disabled={!canSave} form="document-edit-form" icon="save" type="submit" variant="primary">
              {saving ? "Saving..." : "Save and return"}
            </Button>
          </div>
        </div>
      </div>

      {error ? <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">{error}</div> : null}
      {!editable ? (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-800">
          This document cannot be edited because it is signed, locked, or outside your write permissions.
        </div>
      ) : null}

      <form className="grid gap-4 xl:grid-cols-[20rem_minmax(0,1fr)]" id="document-edit-form" onSubmit={saveEdits}>
        <aside className="space-y-4 xl:sticky xl:top-24 xl:self-start">
          <PanelCard bodyClassName="space-y-4" title="Document details">
            <label className="block text-sm font-bold text-slate-700">
              Document date
              <input className="mt-2 min-h-11 w-full rounded-lg border border-slate-200 px-3 text-sm outline-none focus:border-[#061d49] focus:ring-4 focus:ring-[#061d49]/10 disabled:bg-slate-50" disabled={!editable} onChange={(event) => setDocumentDate(event.target.value)} type="date" value={documentDate || ""} />
            </label>
            <label className="block text-sm font-bold text-slate-700">
              Confidentiality
              <SelectFilter className="mt-2 w-full" disabled={!editable} onChange={(event) => setConfidentialityId(event.target.value)} value={confidentialityId}>
                {reference?.confidentialityLevels.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
              </SelectFilter>
            </label>
            <label className="block text-sm font-bold text-slate-700">
              Priority
              <SelectFilter className="mt-2 w-full" disabled={!editable} onChange={(event) => setPriorityId(event.target.value)} value={priorityId}>
                {reference?.priorityLevels.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
              </SelectFilter>
            </label>
            <label className="block text-sm font-bold text-slate-700">
              Summary
              <textarea className="mt-2 min-h-24 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm leading-6 outline-none focus:border-[#061d49] focus:ring-4 focus:ring-[#061d49]/10 disabled:bg-slate-50" disabled={!editable} onChange={(event) => setSummary(event.target.value)} value={summary} />
            </label>
          </PanelCard>
        </aside>

        <main className="min-w-0">
          <PanelCard bodyClassName="space-y-4" title="Write document">
            <label className="block text-sm font-bold text-slate-700">
              Subject
              <input className="mt-2 min-h-11 w-full rounded-lg border border-slate-200 px-3 text-base outline-none focus:border-[#061d49] focus:ring-4 focus:ring-[#061d49]/10 disabled:bg-slate-50" disabled={!editable} maxLength={255} onChange={(event) => setSubject(event.target.value)} value={subject} />
            </label>

            {templateFieldBlocks.length ? (
              <div className="grid gap-3">
                {templateFieldBlocks.map((field) => (
                  <label className="block text-sm font-bold text-slate-700" key={field.id}>
                    {field.label}
                    <textarea
                      className="mt-2 min-h-20 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm leading-6 outline-none focus:border-[#061d49] focus:ring-4 focus:ring-[#061d49]/10 disabled:bg-slate-50"
                      disabled={!editable}
                      onChange={(event) => updateTemplateFieldValue(field.key, event.target.value, field.maxLines)}
                      placeholder={field.placeholder}
                      value={templateFieldValues[field.key] || ""}
                    />
                  </label>
                ))}
              </div>
            ) : null}

            <div>
              <p className="text-sm font-bold text-slate-700">Body</p>
              <div className="mt-2">
                <StructuredDocumentEditor
                  allowFreeBlocks={allowRichStructure}
                  allowTables={allowRichStructure}
                  disabled={!editable}
                  onChange={editable ? setDocumentContent : undefined}
                  value={documentContent}
                />
              </div>
            </div>
          </PanelCard>
        </main>
      </form>
    </section>
  );
}
