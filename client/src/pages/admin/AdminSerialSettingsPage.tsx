import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { adminApi, ApiError, signatureApi } from "../../api";
import type { DocumentType, EntityId, JsonRecord } from "../../api";
import { AdminModal, AdminPageHeader } from "../../components/admin";
import {
  buildSerialConflicts,
  buildSerialRuleRows,
  serialPresetDefinitions,
  serialRuleFormDefaults,
  serialRuleFormFromRow,
  serialRuleRowFromForm,
  SerialFormatBuilder,
  SerialPreviewPanel,
  SerialRuleDirectory,
  SerialRulePresets,
  SerialSettingsStats
} from "../../components/admin/serial-settings";
import type { SerialRuleForm, SerialRulePreset, SerialSettingsPageData } from "../../components/admin/serial-settings";
import { Button, StatusBadge } from "../../components/ui";
import { useI18n } from "../../i18n";

type ActiveModal = "actions" | "archive" | "presets" | "ruleEditor" | "test" | null;
type BuilderMode = "clone" | "create" | "edit";

const emptyData: SerialSettingsPageData = {
  documentTypes: [],
  serialRules: []
};

async function safe<T>(promise: Promise<T>, fallback: T) {
  try {
    return await promise;
  } catch {
    return fallback;
  }
}

function chooseDefaultRule(rows: ReturnType<typeof buildSerialRuleRows>) {
  return rows.find((row) => row.status === "active" && row.isDefault)
    || rows.find((row) => row.status === "active" && row.warningIssues.length === 0)
    || rows.find((row) => row.status === "active")
    || rows[0]
    || null;
}

function recordId(record: JsonRecord | null | undefined) {
  const value = record?.id;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function errorMessage(error: unknown) {
  if (error instanceof ApiError) {
    return error.message;
  }
  if (error instanceof Error) {
    return error.message;
  }
  return "Request failed.";
}

function serialPayload(form: SerialRuleForm, status: SerialRuleForm["status"]) {
  return {
    code: form.code.trim(),
    format: form.format.trim(),
    is_default: form.is_default,
    name: form.name.trim(),
    notes: form.notes.trim() || null,
    reset_policy: form.reset_policy,
    scope: form.scope,
    sequence_padding: form.sequence_padding,
    status
  };
}

export function AdminSerialSettingsPage() {
  const { t } = useI18n();
  const [data, setData] = useState<SerialSettingsPageData>(emptyData);
  const [loading, setLoading] = useState(true);
  const [selectedRuleId, setSelectedRuleId] = useState<EntityId | null>(null);
  const [activeModal, setActiveModal] = useState<ActiveModal>(null);
  const [builderMode, setBuilderMode] = useState<BuilderMode>("edit");
  const [modalRuleId, setModalRuleId] = useState<EntityId | null>(null);
  const [modalBuilderMode, setModalBuilderMode] = useState<BuilderMode>("create");
  const [modalForm, setModalForm] = useState<SerialRuleForm | null>(null);
  const [modalFormError, setModalFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [serialForm, setSerialForm] = useState<SerialRuleForm | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [previewResult, setPreviewResult] = useState<Awaited<ReturnType<typeof signatureApi.previewSerialRule>> | null>(null);
  const builderRef = useRef<HTMLDivElement | null>(null);

  const refreshSerialSettings = useCallback(async (nextSelectedRuleId?: EntityId | null) => {
    setLoading(true);

    const [serialRules, documentTypes] = await Promise.all([
      safe(signatureApi.listSerialRules(), [] as JsonRecord[]),
      safe(adminApi.documentTypes.list(), [] as DocumentType[])
    ]);

    setData({ documentTypes, serialRules });
    setLoading(false);

    if (nextSelectedRuleId !== undefined) {
      setSelectedRuleId(nextSelectedRuleId);
    }
  }, []);

  useEffect(() => {
    void refreshSerialSettings();
  }, [refreshSerialSettings]);

  const rows = useMemo(() => buildSerialRuleRows(data), [data]);
  const conflictQueue = useMemo(() => buildSerialConflicts(rows), [rows]);

  useEffect(() => {
    const selectedStillExists = selectedRuleId ? rows.some((row) => row.id === selectedRuleId) : false;
    if (!selectedStillExists) {
      setSelectedRuleId(chooseDefaultRule(rows)?.id || null);
    }
  }, [rows, selectedRuleId]);

  const selectedRule = rows.find((row) => row.id === selectedRuleId) || null;
  const modalRule = modalRuleId ? rows.find((row) => row.id === modalRuleId) || null : selectedRule;
  const hasDefaultRule = rows.some((row) => row.isDefault);
  const stagedRule = serialForm ? serialRuleRowFromForm(serialForm) : selectedRule;
  const stats = {
    active: rows.filter((row) => row.status === "active").length,
    defaultRules: rows.filter((row) => row.isDefault).length,
    documentTypes: data.documentTypes.filter((documentType) => documentType.requires_serial).length,
    total: rows.length,
    warnings: conflictQueue.length
  };

  useEffect(() => {
    if (!serialForm && selectedRule) {
      setSerialForm(serialRuleFormFromRow(selectedRule));
      setBuilderMode("edit");
    }
  }, [selectedRule, serialForm]);

  function scrollToBuilder() {
    window.requestAnimationFrame(() => {
      builderRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      builderRef.current?.focus({ preventScroll: true });
    });
  }

  function stageForm(form: SerialRuleForm, mode: BuilderMode) {
    setSerialForm(form);
    setBuilderMode(mode);
    setFormError(null);
    setPreviewError(null);
    setPreviewResult(null);
    scrollToBuilder();
  }

  function updateForm(patch: Partial<SerialRuleForm>) {
    setSerialForm((current) => current ? { ...current, ...patch } : current);
    setPreviewResult(null);
  }

  function updateModalForm(patch: Partial<SerialRuleForm>) {
    setModalForm((current) => current ? { ...current, ...patch } : current);
    setModalFormError(null);
    setPreviewResult(null);
  }

  function viewRule(row: typeof rows[number]) {
    setSelectedRuleId(row.id);
    stageForm(serialRuleFormFromRow(row), "edit");
  }

  function selectRule(ruleId: EntityId) {
    const row = rows.find((item) => item.id === ruleId);
    if (row) {
      viewRule(row);
    } else {
      setSelectedRuleId(ruleId);
    }
  }

  function openCreateRule() {
    setSelectedRuleId(null);
    openRuleEditor(serialRuleFormDefaults(hasDefaultRule), "create");
  }

  function openEditRule(row: typeof rows[number]) {
    setSelectedRuleId(row.id);
    stageForm(serialRuleFormFromRow(row), "edit");
  }

  function openCloneRule(row: typeof rows[number]) {
    setSelectedRuleId(row.id);
    openRuleEditor(serialRuleFormFromRow(row, true), "clone");
  }

  function closeModal() {
    setActiveModal(null);
    setModalRuleId(null);
    setModalBuilderMode("create");
    setModalForm(null);
    setModalFormError(null);
    setFormError(null);
    setPreviewError(null);
    setBusy(false);
  }

  function openRuleEditor(form: SerialRuleForm, mode: BuilderMode) {
    setModalBuilderMode(mode);
    setModalForm(form);
    setModalFormError(null);
    setFormError(null);
    setPreviewError(null);
    setPreviewResult(null);
    setActiveModal("ruleEditor");
  }

  function openActionsModal(row: typeof rows[number]) {
    setSelectedRuleId(row.id);
    setModalRuleId(row.id);
    setActiveModal("actions");
  }

  function openArchiveModal(row: typeof rows[number]) {
    setSelectedRuleId(row.id);
    setModalRuleId(row.id);
    setActiveModal("archive");
  }

  function stagePreset(preset: SerialRulePreset) {
    openRuleEditor({
      ...serialRuleFormDefaults(hasDefaultRule),
      code: "",
      format: preset.format,
      name: preset.label,
      reset_policy: preset.resetPolicy,
      scope: preset.scope,
      sequence_padding: preset.sequencePadding
    }, "create");
  }

  function validateSerialForm(form: SerialRuleForm, reportError: (message: string) => void) {
    if (!form.name.trim() || !form.format.trim()) {
      reportError(t("admin.serialSettings.form.requiredFields"));
      return false;
    }
    if (form.sequence_padding < 1 || form.sequence_padding > 12) {
      reportError(t("admin.serialSettings.form.paddingRange"));
      return false;
    }

    return true;
  }

  async function saveSerialRule(statusOverride?: SerialRuleForm["status"]) {
    if (!serialForm || busy) {
      return;
    }

    const status = statusOverride || serialForm.status;
    if (!validateSerialForm(serialForm, setFormError)) {
      return;
    }

    setBusy(true);
    setFormError(null);
    try {
      const saved = serialForm.id && builderMode === "edit"
        ? await signatureApi.updateSerialRule(serialForm.id, serialPayload(serialForm, status))
        : await signatureApi.createSerialRule(serialPayload(serialForm, status));
      const savedRuleId = recordId(saved);
      await refreshSerialSettings(savedRuleId);
      const nextRow = savedRuleId ? buildSerialRuleRows({ ...data, serialRules: [saved] }).find((row) => row.id === savedRuleId) : null;
      setSerialForm(nextRow ? serialRuleFormFromRow(nextRow) : { ...serialForm, id: savedRuleId, status });
      setBuilderMode("edit");
      setBusy(false);
    } catch (error) {
      setFormError(errorMessage(error));
      setBusy(false);
    }
  }

  async function saveModalSerialRule(statusOverride?: SerialRuleForm["status"]) {
    if (!modalForm || busy) {
      return;
    }

    const status = statusOverride || modalForm.status;
    if (!validateSerialForm(modalForm, setModalFormError)) {
      return;
    }

    setBusy(true);
    setModalFormError(null);
    try {
      const saved = modalForm.id && modalBuilderMode === "edit"
        ? await signatureApi.updateSerialRule(modalForm.id, serialPayload(modalForm, status))
        : await signatureApi.createSerialRule(serialPayload(modalForm, status));
      const savedRuleId = recordId(saved);
      await refreshSerialSettings(savedRuleId);
      const nextRow = savedRuleId ? buildSerialRuleRows({ ...data, serialRules: [saved] }).find((row) => row.id === savedRuleId) : null;
      setSerialForm(nextRow ? serialRuleFormFromRow(nextRow) : { ...modalForm, id: savedRuleId, status });
      setBuilderMode("edit");
      setActiveModal(null);
      setModalBuilderMode("create");
      setModalForm(null);
      setModalFormError(null);
      setBusy(false);
    } catch (error) {
      setModalFormError(errorMessage(error));
      setBusy(false);
    }
  }

  async function updateRuleStatus(row: typeof rows[number], status: SerialRuleForm["status"]) {
    if (busy) {
      return;
    }

    setBusy(true);
    setFormError(null);
    try {
      const updated = await signatureApi.updateSerialRuleStatus(row.id, status);
      await refreshSerialSettings(recordId(updated) || row.id);
      closeModal();
    } catch (error) {
      setFormError(errorMessage(error));
      setBusy(false);
    }
  }

  async function setDefaultRule(row: typeof rows[number]) {
    if (busy) {
      return;
    }

    setBusy(true);
    setFormError(null);
    try {
      const updated = await signatureApi.updateSerialRule(row.id, { is_default: true, status: "active" });
      await refreshSerialSettings(recordId(updated) || row.id);
      closeModal();
    } catch (error) {
      setFormError(errorMessage(error));
      setBusy(false);
    }
  }

  async function archiveRule() {
    if (!modalRule || busy) {
      return;
    }

    setBusy(true);
    setFormError(null);
    try {
      await signatureApi.removeSerialRule(modalRule.id);
      await refreshSerialSettings(null);
      setSerialForm(null);
      closeModal();
    } catch (error) {
      setFormError(errorMessage(error));
      setBusy(false);
    }
  }

  async function runPreview(source?: SerialRuleForm) {
    const sourceForm = source || serialForm || (selectedRule ? serialRuleFormFromRow(selectedRule) : null);
    if (!sourceForm || busy) {
      return;
    }

    setBusy(true);
    setPreviewError(null);
    try {
      const result = await signatureApi.previewSerialRule({
        rule: {
          format: sourceForm.format,
          reset_policy: sourceForm.reset_policy,
          scope: sourceForm.scope,
          sequence_padding: sourceForm.sequence_padding
        },
        serial_rule_id: sourceForm.id || undefined
      });
      setPreviewResult(result);
      setActiveModal("test");
      setBusy(false);
    } catch (error) {
      setPreviewError(errorMessage(error));
      setActiveModal("test");
      setBusy(false);
    }
  }

  function cancelBuilder() {
    if (selectedRule) {
      stageForm(serialRuleFormFromRow(selectedRule), "edit");
    } else {
      setSerialForm(null);
      setBuilderMode("edit");
      setFormError(null);
    }
  }

  return (
    <div className="space-y-4">
      <AdminPageHeader
        actions={(
          <>
            <Button icon="plus" onClick={openCreateRule} variant="primary">{t("admin.serialSettings.actions.newRule")}</Button>
            <Button icon="template" onClick={() => setActiveModal("presets")}>{t("admin.serialSettings.actions.usePreset")}</Button>
            <Button icon="serial" onClick={() => void runPreview()} variant="primary">{t("admin.serialSettings.actions.testNumber")}</Button>
          </>
        )}
        description={t("admin.serialSettings.description")}
        title={t("admin.serialSettings.title")}
      />

      <SerialSettingsStats
        labels={{
          active: t("admin.serialSettings.stats.active"),
          defaultRules: t("admin.serialSettings.stats.defaultRules"),
          documentTypes: t("admin.serialSettings.stats.documentTypes"),
          total: t("admin.serialSettings.stats.total"),
          warnings: t("admin.serialSettings.stats.warnings")
        }}
        loading={loading}
        stats={stats}
      />

      <section className="min-w-0">
        <SerialRuleDirectory
          onEditRule={openEditRule}
          onOpenRuleActions={openActionsModal}
          onSelectRule={selectRule}
          onViewRule={openActionsModal}
          rows={rows}
          selectedRuleId={selectedRuleId}
        />
      </section>

      <section className="grid min-w-0 gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(27rem,.78fr)]">
        <div className="min-w-0" ref={builderRef} tabIndex={-1}>
          <SerialFormatBuilder
            busy={busy}
            form={serialForm}
            formError={formError}
            mode={builderMode}
            onCancel={cancelBuilder}
            onChange={updateForm}
            onSaveDraft={() => void saveSerialRule("draft")}
            onSaveRule={() => void saveSerialRule("active")}
          />
        </div>
        <div className="min-w-0">
          <SerialPreviewPanel previewSerial={previewResult?.serialValue || null} selectedRule={stagedRule} />
        </div>
      </section>

      <AdminModal
        onClose={closeModal}
        open={activeModal === "ruleEditor"}
        size="lg"
        title={
          modalBuilderMode === "clone"
            ? t("admin.serialSettings.builder.cloneTitle")
            : modalBuilderMode === "create"
              ? t("admin.serialSettings.builder.createTitle")
              : t("admin.serialSettings.builder.title")
        }
      >
        <SerialFormatBuilder
          busy={busy}
          embedded
          form={modalForm}
          formError={modalFormError}
          mode={modalBuilderMode}
          onCancel={closeModal}
          onChange={updateModalForm}
          onSaveDraft={() => void saveModalSerialRule("draft")}
          onSaveRule={() => void saveModalSerialRule("active")}
        />
      </AdminModal>

      <AdminModal onClose={closeModal} open={activeModal === "presets"} size="md" title={t("admin.serialSettings.form.presetsTitle")}>
        <div className="space-y-2">
          {serialPresetDefinitions(t).map((preset) => (
            <article className="flex flex-col gap-3 rounded-lg border border-slate-200 bg-white p-3 sm:flex-row sm:items-center sm:justify-between" key={preset.label}>
              <div className="min-w-0">
                <p className="font-bold text-slate-900">{preset.label}</p>
                <p className="force-ltr mt-1 truncate text-start font-mono text-xs text-slate-500" title={preset.format}>{preset.format}</p>
              </div>
              <Button className="shrink-0 px-3 py-1.5 text-xs" icon="template" onClick={() => stagePreset(preset)}>{t("admin.serialSettings.presets.usePreset")}</Button>
            </article>
          ))}
        </div>
      </AdminModal>

      <AdminModal
        footer={<Button onClick={closeModal}>{t("admin.serialSettings.form.close")}</Button>}
        onClose={closeModal}
        open={activeModal === "test"}
        size="md"
        title={t("admin.serialSettings.form.testTitle")}
      >
        {previewError ? <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm font-semibold text-red-700">{previewError}</div> : null}
        {previewResult ? (
          <div className="space-y-3">
            <div className="rounded-lg border border-blue-200 bg-blue-50 p-4 text-center">
              <p className="text-xs font-bold uppercase tracking-wide text-slate-500">{t("admin.serialSettings.preview.nextSerial")}</p>
              <p className="force-ltr mt-2 truncate text-center font-mono text-3xl font-black text-[#061d49]" title={previewResult.serialValue}>{previewResult.serialValue}</p>
            </div>
            <dl className="grid gap-2 sm:grid-cols-3">
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                <dt className="text-xs font-bold text-slate-500">{t("admin.serialSettings.form.sequenceScope")}</dt>
                <dd className="force-ltr mt-1 truncate text-start font-mono text-xs font-bold text-slate-900" title={previewResult.sequenceScope}>{previewResult.sequenceScope}</dd>
              </div>
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                <dt className="text-xs font-bold text-slate-500">{t("admin.serialSettings.form.sequencePeriod")}</dt>
                <dd className="force-ltr mt-1 text-start font-mono text-xs font-bold text-slate-900">{previewResult.sequencePeriod}</dd>
              </div>
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                <dt className="text-xs font-bold text-slate-500">{t("admin.serialSettings.form.sequenceValue")}</dt>
                <dd className="force-ltr mt-1 text-start font-mono text-xs font-bold text-slate-900">{previewResult.sequenceValue}</dd>
              </div>
            </dl>
          </div>
        ) : !previewError ? (
          <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">{t("admin.serialSettings.preview.empty")}</div>
        ) : null}
      </AdminModal>

      <AdminModal
        footer={modalRule ? (
          <>
            <Button disabled={busy} onClick={closeModal}>{t("admin.serialSettings.form.close")}</Button>
            <Button disabled={busy} icon="edit" onClick={() => { closeModal(); openEditRule(modalRule); }}>{t("admin.serialSettings.inspector.editRule")}</Button>
            <Button disabled={busy} icon="template" onClick={() => { closeModal(); openCloneRule(modalRule); }}>{t("admin.serialSettings.inspector.cloneRule")}</Button>
          </>
        ) : null}
        onClose={closeModal}
        open={activeModal === "actions"}
        size="md"
        title={t("admin.serialSettings.form.actionsTitle")}
      >
        {formError ? <div className="mb-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm font-semibold text-red-700">{formError}</div> : null}
        {modalRule ? (
          <div className="space-y-3">
            <div>
              <h3 className="break-words text-base font-bold text-slate-950">{modalRule.name}</h3>
              <p className="force-ltr mt-1 truncate text-start text-xs font-semibold text-slate-500" title={modalRule.code}>{modalRule.code}</p>
              <div className="mt-2 flex flex-wrap gap-2">
                <StatusBadge tone={modalRule.status === "active" ? "green" : "slate"}>{modalRule.status}</StatusBadge>
                <StatusBadge tone={modalRule.isDefault ? "green" : "blue"}>{modalRule.isDefault ? "default" : "secondary"}</StatusBadge>
              </div>
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
              <Button disabled={busy} icon="shield" onClick={() => void setDefaultRule(modalRule)} variant="primary">{t("admin.serialSettings.form.setDefault")}</Button>
              <Button disabled={busy} icon="activity" onClick={() => void updateRuleStatus(modalRule, "active")}>{t("admin.serialSettings.form.activateRule")}</Button>
              <Button disabled={busy} icon="document" onClick={() => void updateRuleStatus(modalRule, "draft")}>{t("admin.serialSettings.form.setDraft")}</Button>
              <Button disabled={busy} icon="pause" onClick={() => void updateRuleStatus(modalRule, "inactive")}>{t("admin.serialSettings.inspector.disableRule")}</Button>
              <Button disabled={busy} icon="view" onClick={() => { const form = serialRuleFormFromRow(modalRule); closeModal(); setSerialForm(form); void runPreview(form); }}>{t("admin.serialSettings.inspector.previewResult")}</Button>
              <Button disabled={busy} icon="audit" onClick={() => openArchiveModal(modalRule)} variant="danger">{t("admin.serialSettings.form.archiveRule")}</Button>
            </div>
          </div>
        ) : null}
      </AdminModal>

      <AdminModal
        footer={(
          <>
            <Button disabled={busy} onClick={closeModal}>{t("admin.serialSettings.form.close")}</Button>
            <Button disabled={busy} icon="audit" onClick={() => void archiveRule()} variant="danger">{t("admin.serialSettings.form.archiveRule")}</Button>
          </>
        )}
        onClose={closeModal}
        open={activeModal === "archive"}
        size="md"
        title={t("admin.serialSettings.form.archiveTitle")}
      >
        {formError ? <div className="mb-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm font-semibold text-red-700">{formError}</div> : null}
        <p className="text-sm leading-6 text-slate-700">
          {t("admin.serialSettings.form.archiveDescription", { name: modalRule?.name || "" })}
        </p>
      </AdminModal>
    </div>
  );
}
