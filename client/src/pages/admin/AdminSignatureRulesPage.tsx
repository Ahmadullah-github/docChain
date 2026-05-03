import { type FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { adminApi, signatureApi } from "../../api";
import type { DocumentType, EntityId, JsonRecord, Position, UnitType } from "../../api";
import { AdminModal, AdminPageHeader } from "../../components/admin";
import {
  buildSignatureConflicts,
  buildSignatureRuleRows,
  EasySignatureBuilder,
  SignatureConflictQueue,
  SignatureFlowPreview,
  SignaturePlacementPreview,
  SignatureRuleDirectory,
  SignatureRuleHelp,
  SignatureRuleInspector,
  SignatureRuleStats,
  SignatureRuleTemplates
} from "../../components/admin/signature-rules";
import type { SignatureRuleChainRow, SignatureRuleTemplateId, SignatureRulesPageData } from "../../components/admin/signature-rules";
import { Button } from "../../components/ui";
import { useI18n } from "../../i18n";

type SignatureStatus = "active" | "draft" | "inactive" | "archived";
type ActiveModal = "actions" | "create" | "delete" | "edit" | "placement" | "preview" | "templates" | null;

type SignatureStepForm = {
  id?: EntityId;
  can_finalize_document: boolean;
  is_required: boolean;
  required_position_id: string;
  required_unit_scope: string;
};

type SignatureChainForm = {
  can_be_hidden_later: boolean;
  chainMode: "parallel" | "sequential";
  document_type_id: string;
  notes: string;
  origin_unit_type_id: string;
  placement: string;
  signature_mode: string;
  status: SignatureStatus;
  steps: SignatureStepForm[];
};

const emptyData: SignatureRulesPageData = {
  documentTypes: [],
  positions: [],
  serialRules: [],
  signatureRules: [],
  unitTypes: [],
  visibilityRules: []
};

const labelClassName = "text-sm font-semibold text-slate-700";
const fieldClassName = "mt-1 block min-h-10 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-800 shadow-sm shadow-slate-900/5 outline-none transition focus:border-[#061d49] focus:ring-4 focus:ring-[#061d49]/10 disabled:bg-slate-50 disabled:text-slate-500";
const checkboxClassName = "h-4 w-4 rounded border-slate-300 text-[#061d49] focus:ring-[#061d49]/20";
const placementOptions = ["Bottom-right of the last page", "Bottom-left of the last page", "Bottom-right of every page", "Signature block after document body"];
const scopeOptions = ["same_unit", "same_department", "parent_faculty", "parent_vice_chancellery", "university"];
const statusOptions: SignatureStatus[] = ["draft", "active", "inactive", "archived"];

async function safe<T>(promise: Promise<T>, fallback: T) {
  try {
    return await promise;
  } catch {
    return fallback;
  }
}

function chooseDefaultChain(rows: ReturnType<typeof buildSignatureRuleRows>) {
  return rows.find((row) => row.status === "active" && row.warningIssues.length === 0)
    || rows.find((row) => row.status === "active")
    || rows[0]
    || null;
}

function findMatchingChain(
  rows: ReturnType<typeof buildSignatureRuleRows>,
  documentTypeId: string,
  originUnitTypeId: string,
  status: string
) {
  return rows.find((row) => {
    const matchesDocumentType = documentTypeId === "all" || String(row.documentTypeId || "") === documentTypeId;
    const matchesOrigin = originUnitTypeId === "any" || String(row.originUnitType?.id || "") === originUnitTypeId;
    const matchesStatus = status === "all" || row.status === status;
    return matchesDocumentType && matchesOrigin && matchesStatus;
  }) || null;
}

function recordString(record: JsonRecord | null | undefined, key: string, fallback = "") {
  const value = record?.[key];
  return typeof value === "string" && value.trim() ? value : fallback;
}

function recordNumber(record: JsonRecord | null | undefined, key: string) {
  const value = record?.[key];
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function recordBoolean(record: JsonRecord | null | undefined, key: string, fallback = false) {
  const value = record?.[key];
  if (value === undefined || value === null) {
    return fallback;
  }
  return value === true || value === 1 || value === "1" || value === "true";
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Request failed.";
}

function chainIdForForm(form: SignatureChainForm) {
  return `${form.document_type_id}:${form.origin_unit_type_id || "any"}:${form.status}`;
}

function chainIdForRowStatus(row: SignatureRuleChainRow, status: SignatureStatus) {
  return `${row.documentTypeId || "all"}:${row.originUnitType?.id || "any"}:${status}`;
}

function stripPlacementNote(notes: string) {
  return notes
    .split("\n")
    .filter((line) => !/^Placement:\s*/i.test(line.trim()))
    .join("\n")
    .trim();
}

function notesWithPlacement(notes: string, placement: string) {
  const stripped = stripPlacementNote(notes);
  return [stripped, `Placement: ${placement}`].filter(Boolean).join("\n");
}

function signatureFormDefaults(data: SignatureRulesPageData): SignatureChainForm {
  const firstDocumentType = data.documentTypes.find((documentType) => documentType.status === "active") || data.documentTypes[0];
  const firstPosition = data.positions.find((position) => position.status === "active" && position.is_signing_authority)
    || data.positions.find((position) => position.status === "active")
    || data.positions[0];

  return {
    can_be_hidden_later: false,
    chainMode: "sequential",
    document_type_id: firstDocumentType ? String(firstDocumentType.id) : "",
    notes: "",
    origin_unit_type_id: "",
    placement: placementOptions[0],
    signature_mode: "pin_signature_image",
    status: "draft",
    steps: firstPosition ? [{
      can_finalize_document: true,
      is_required: true,
      required_position_id: String(firstPosition.id),
      required_unit_scope: "same_unit"
    }] : []
  };
}

function signatureFormForChain(row: SignatureRuleChainRow, clone = false): SignatureChainForm {
  const firstRule = row.signatureRules[0] || {};
  const notes = recordString(firstRule, "notes");

  return {
    can_be_hidden_later: row.signatureRules.some((rule) => recordBoolean(rule, "can_be_hidden_later")),
    chainMode: row.chainMode,
    document_type_id: row.documentTypeId ? String(row.documentTypeId) : "",
    notes: clone ? `Cloned from ${row.ruleName}` : stripPlacementNote(notes),
    origin_unit_type_id: row.originUnitType?.id ? String(row.originUnitType.id) : "",
    placement: row.placement,
    signature_mode: recordString(firstRule, "signature_mode", "pin_signature_image"),
    status: clone ? "draft" : row.status as SignatureStatus,
    steps: row.signatureRules.map((rule) => ({
      id: clone ? undefined : recordNumber(rule, "id") || undefined,
      can_finalize_document: recordBoolean(rule, "can_finalize_document"),
      is_required: recordBoolean(rule, "is_required", true),
      required_position_id: String(recordNumber(rule, "required_position_id") || ""),
      required_unit_scope: recordString(rule, "required_unit_scope", "same_unit")
    }))
  };
}

function signatureFormForTemplate(templateId: SignatureRuleTemplateId, data: SignatureRulesPageData): SignatureChainForm {
  const form = signatureFormDefaults(data);
  const signingPositions = data.positions.filter((position) => position.status !== "disabled" && position.status !== "archived");
  const preferred = signingPositions.filter((position) => position.is_signing_authority);
  const pool = preferred.length ? preferred : signingPositions;
  const pick = (index: number) => pool[index] || pool[pool.length - 1] || null;
  const stepCountByTemplate: Record<SignatureRuleTemplateId, number> = {
    committee_approval: 3,
    department_upward: 2,
    faculty_letter: 3,
    internal_memo: 1,
    policy_flow: 4
  };
  const stepCount = stepCountByTemplate[templateId];

  return {
    ...form,
    chainMode: templateId === "committee_approval" ? "parallel" : "sequential",
    notes: `Created from ${templateId.replaceAll("_", " ")} template.`,
    status: "draft",
    steps: Array.from({ length: stepCount }, (_item, index) => {
      const position = pick(index);
      return {
        can_finalize_document: templateId !== "internal_memo" && index === stepCount - 1,
        is_required: templateId !== "committee_approval" || index < 2,
        required_position_id: position ? String(position.id) : "",
        required_unit_scope: index === stepCount - 1 ? "university" : "same_unit"
      };
    })
  };
}

export function AdminSignatureRulesPage() {
  const { t } = useI18n();
  const [data, setData] = useState<SignatureRulesPageData>(emptyData);
  const [loading, setLoading] = useState(true);
  const [selectedChainId, setSelectedChainId] = useState<string | null>(null);
  const [builderStatus, setBuilderStatus] = useState("all");
  const [activeModal, setActiveModal] = useState<ActiveModal>(null);
  const [modalChainId, setModalChainId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [chainForm, setChainForm] = useState<SignatureChainForm>(() => signatureFormDefaults(emptyData));
  const [placementValue, setPlacementValue] = useState(placementOptions[0]);
  const inspectorRef = useRef<HTMLDivElement | null>(null);

  const refreshSignatureRules = useCallback(async (nextSelectedChainId?: string | null) => {
    setLoading(true);
    const [signatureRules, serialRules, visibilityRules, documentTypes, unitTypes, positions] = await Promise.all([
      safe(signatureApi.listSignatureRules(), [] as JsonRecord[]),
      safe(signatureApi.listSerialRules(), [] as JsonRecord[]),
      safe(adminApi.visibilityRules.list(), [] as JsonRecord[]),
      safe(adminApi.documentTypes.list(), [] as DocumentType[]),
      safe(adminApi.unitTypes.list(), [] as UnitType[]),
      safe(adminApi.positions.list(), [] as Position[])
    ]);

    setData({ documentTypes, positions, serialRules, signatureRules, unitTypes, visibilityRules });
    setLoading(false);
    if (nextSelectedChainId !== undefined) {
      setSelectedChainId(nextSelectedChainId);
    }
  }, []);

  useEffect(() => {
    void refreshSignatureRules();
  }, [refreshSignatureRules]);

  const rows = useMemo(() => buildSignatureRuleRows(data), [data]);
  const conflictQueue = useMemo(() => buildSignatureConflicts(rows), [rows]);

  useEffect(() => {
    const selectedStillExists = selectedChainId ? rows.some((row) => row.id === selectedChainId) : false;
    if (!selectedStillExists) {
      setSelectedChainId(chooseDefaultChain(rows)?.id || null);
    }
  }, [rows, selectedChainId]);

  const selectedChain = rows.find((row) => row.id === selectedChainId) || null;
  const modalChain = modalChainId ? rows.find((row) => row.id === modalChainId) || null : selectedChain;
  const availablePositions = data.positions.filter((position) => position.status !== "disabled" && position.status !== "archived");
  const stats = {
    activeChains: rows.filter((row) => row.status === "active").length,
    documentTypes: new Set(rows.map((row) => row.documentTypeId).filter(Boolean)).size,
    finalRules: data.signatureRules.filter((rule) => rule.can_finalize_document === true || rule.can_finalize_document === 1).length,
    total: data.signatureRules.length,
    visibilityRules: data.visibilityRules.length,
    warnings: conflictQueue.length
  };

  function handleSelectScope(documentTypeId: string, originUnitTypeId: string) {
    const match = findMatchingChain(rows, documentTypeId, originUnitTypeId, builderStatus)
      || findMatchingChain(rows, documentTypeId, originUnitTypeId, "all");

    if (match) {
      setSelectedChainId(match.id);
    }
  }

  function handleSelectStatus(status: string) {
    setBuilderStatus(status);

    if (!selectedChain) {
      return;
    }

    const match = findMatchingChain(
      rows,
      selectedChain.documentTypeId ? String(selectedChain.documentTypeId) : "all",
      selectedChain.originUnitType?.id ? String(selectedChain.originUnitType.id) : "any",
      status
    ) || (status === "all" ? selectedChain : rows.find((row) => row.status === status) || null);

    if (match) {
      setSelectedChainId(match.id);
    }
  }

  function closeModal() {
    setActiveModal(null);
    setModalChainId(null);
    setBusy(false);
    setFormError(null);
  }

  function scrollToInspector() {
    window.requestAnimationFrame(() => {
      inspectorRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      inspectorRef.current?.focus({ preventScroll: true });
    });
  }

  function viewChain(row: SignatureRuleChainRow) {
    setSelectedChainId(row.id);
    scrollToInspector();
  }

  function openCreateChainModal(templateId?: SignatureRuleTemplateId) {
    setChainForm(templateId ? signatureFormForTemplate(templateId, data) : signatureFormDefaults(data));
    setModalChainId(null);
    setFormError(null);
    setActiveModal("create");
  }

  function openEditChainModal(row: SignatureRuleChainRow, addSigner = false) {
    const nextForm = signatureFormForChain(row);
    if (addSigner) {
      const nextPosition = availablePositions.find((position) => !nextForm.steps.some((step) => step.required_position_id === String(position.id))) || availablePositions[0];
      nextForm.steps = [
        ...nextForm.steps,
        {
          can_finalize_document: false,
          is_required: true,
          required_position_id: nextPosition ? String(nextPosition.id) : "",
          required_unit_scope: "same_unit"
        }
      ];
    }

    setSelectedChainId(row.id);
    setModalChainId(row.id);
    setChainForm(nextForm);
    setFormError(null);
    setActiveModal("edit");
  }

  function openCloneChainModal(row: SignatureRuleChainRow) {
    setSelectedChainId(row.id);
    setModalChainId(row.id);
    setChainForm(signatureFormForChain(row, true));
    setFormError(null);
    setActiveModal("create");
  }

  function openActionsModal(row: SignatureRuleChainRow) {
    setSelectedChainId(row.id);
    setModalChainId(row.id);
    setFormError(null);
    setActiveModal("actions");
  }

  function openDeleteModal(row: SignatureRuleChainRow) {
    setSelectedChainId(row.id);
    setModalChainId(row.id);
    setFormError(null);
    setActiveModal("delete");
  }

  function openPreviewModal(row: SignatureRuleChainRow) {
    setSelectedChainId(row.id);
    setModalChainId(row.id);
    setFormError(null);
    setActiveModal("preview");
  }

  function openPlacementModal(row: SignatureRuleChainRow) {
    setSelectedChainId(row.id);
    setModalChainId(row.id);
    setPlacementValue(row.placement);
    setFormError(null);
    setActiveModal("placement");
  }

  function updateChainForm(next: Partial<SignatureChainForm>) {
    setChainForm((form) => ({ ...form, ...next }));
  }

  function updateStep(index: number, next: Partial<SignatureStepForm>) {
    setChainForm((form) => ({
      ...form,
      steps: form.steps.map((step, stepIndex) => stepIndex === index ? { ...step, ...next } : step)
    }));
  }

  function addStep() {
    const nextPosition = availablePositions.find((position) => !chainForm.steps.some((step) => step.required_position_id === String(position.id))) || availablePositions[0];
    setChainForm((form) => ({
      ...form,
      steps: [
        ...form.steps,
        {
          can_finalize_document: false,
          is_required: true,
          required_position_id: nextPosition ? String(nextPosition.id) : "",
          required_unit_scope: "same_unit"
        }
      ]
    }));
  }

  function removeStep(index: number) {
    setChainForm((form) => ({
      ...form,
      steps: form.steps.filter((_step, stepIndex) => stepIndex !== index)
    }));
  }

  function validateChainForm(form: SignatureChainForm) {
    if (!form.document_type_id) {
      throw new Error("Document type is required.");
    }
    if (!form.steps.length) {
      throw new Error("At least one signer is required.");
    }
    if (form.steps.some((step) => !step.required_position_id || !step.required_unit_scope)) {
      throw new Error("Every signer needs a position and unit scope.");
    }
  }

  function payloadForStep(form: SignatureChainForm, step: SignatureStepForm, index: number) {
    return {
      can_be_hidden_later: form.can_be_hidden_later,
      can_finalize_document: step.can_finalize_document,
      document_type_id: Number(form.document_type_id),
      is_parallel: form.chainMode === "parallel",
      is_required: step.is_required,
      notes: notesWithPlacement(form.notes, form.placement) || null,
      origin_unit_type_id: form.origin_unit_type_id ? Number(form.origin_unit_type_id) : null,
      required_position_id: Number(step.required_position_id),
      required_unit_scope: step.required_unit_scope,
      signature_mode: form.signature_mode || "pin_signature_image",
      status: form.status,
      step_number: index + 1
    };
  }

  async function handleSaveChain(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setFormError(null);

    try {
      validateChainForm(chainForm);
      const retainedIds = new Set(chainForm.steps.map((step) => step.id).filter((id): id is EntityId => Boolean(id)));

      for (const [index, step] of chainForm.steps.entries()) {
        const payload = payloadForStep(chainForm, step, index);
        if (step.id && activeModal === "edit") {
          await signatureApi.updateSignatureRule(step.id, payload);
        } else {
          await signatureApi.createSignatureRule(payload);
        }
      }

      if (activeModal === "edit" && modalChain) {
        for (const rule of modalChain.signatureRules) {
          const ruleId = recordNumber(rule, "id");
          if (ruleId && !retainedIds.has(ruleId)) {
            await signatureApi.removeSignatureRule(ruleId);
          }
        }
      }

      await refreshSignatureRules(chainIdForForm(chainForm));
      closeModal();
    } catch (error) {
      setFormError(errorMessage(error));
      setBusy(false);
    }
  }

  async function updateChainStatus(row: SignatureRuleChainRow, status: SignatureStatus) {
    setBusy(true);
    setFormError(null);

    try {
      for (const rule of row.signatureRules) {
        const ruleId = recordNumber(rule, "id");
        if (ruleId) {
          await signatureApi.updateSignatureRuleStatus(ruleId, status);
        }
      }
      await refreshSignatureRules(chainIdForRowStatus(row, status));
      closeModal();
    } catch (error) {
      setFormError(errorMessage(error));
      setBusy(false);
    }
  }

  async function handleDeleteChain() {
    if (!modalChain) {
      return;
    }

    setBusy(true);
    setFormError(null);

    try {
      for (const rule of modalChain.signatureRules) {
        const ruleId = recordNumber(rule, "id");
        if (ruleId) {
          await signatureApi.removeSignatureRule(ruleId);
        }
      }
      await refreshSignatureRules(null);
      closeModal();
    } catch (error) {
      setFormError(errorMessage(error));
      setBusy(false);
    }
  }

  async function handleSavePlacement(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!modalChain) {
      return;
    }

    setBusy(true);
    setFormError(null);

    try {
      for (const rule of modalChain.signatureRules) {
        const ruleId = recordNumber(rule, "id");
        if (ruleId) {
          await signatureApi.updateSignatureRule(ruleId, {
            notes: notesWithPlacement(recordString(rule, "notes"), placementValue)
          });
        }
      }
      await refreshSignatureRules(modalChain.id);
      closeModal();
    } catch (error) {
      setFormError(errorMessage(error));
      setBusy(false);
    }
  }

  function handleCancelBuilder() {
    setBuilderStatus("all");
    void refreshSignatureRules(selectedChainId);
  }

  function renderChainForm(formId: string) {
    return (
      <form className="space-y-4" id={formId} onSubmit={handleSaveChain}>
        {formError ? <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm font-medium text-red-700">{formError}</p> : null}
        <div className="grid gap-4 md:grid-cols-2">
          <label className={labelClassName}>
            Document type
            <select className={fieldClassName} onChange={(event) => updateChainForm({ document_type_id: event.target.value })} required value={chainForm.document_type_id}>
              <option value="" disabled>Select document type</option>
              {data.documentTypes.map((documentType) => <option key={documentType.id} value={documentType.id}>{documentType.name}</option>)}
            </select>
          </label>
          <label className={labelClassName}>
            Origin unit type
            <select className={fieldClassName} onChange={(event) => updateChainForm({ origin_unit_type_id: event.target.value })} value={chainForm.origin_unit_type_id}>
              <option value="">Any origin unit</option>
              {data.unitTypes.map((unitType) => <option key={unitType.id} value={unitType.id}>{unitType.name}</option>)}
            </select>
          </label>
          <label className={labelClassName}>
            Status
            <select className={fieldClassName} onChange={(event) => updateChainForm({ status: event.target.value as SignatureStatus })} value={chainForm.status}>
              {statusOptions.map((status) => <option key={status} value={status}>{status}</option>)}
            </select>
          </label>
          <label className={labelClassName}>
            Signature mode
            <select className={fieldClassName} onChange={(event) => updateChainForm({ signature_mode: event.target.value })} value={chainForm.signature_mode}>
              <option value="pin_signature_image">PIN + signature image</option>
              <option value="pin_only">PIN only</option>
              <option value="external_signature">External signature</option>
            </select>
          </label>
          <label className={labelClassName}>
            Chain mode
            <select className={fieldClassName} onChange={(event) => updateChainForm({ chainMode: event.target.value as SignatureChainForm["chainMode"] })} value={chainForm.chainMode}>
              <option value="sequential">Sequential</option>
              <option value="parallel">Parallel</option>
            </select>
          </label>
          <label className={labelClassName}>
            Placement
            <select className={fieldClassName} onChange={(event) => updateChainForm({ placement: event.target.value })} value={chainForm.placement}>
              {placementOptions.map((placement) => <option key={placement} value={placement}>{placement}</option>)}
            </select>
          </label>
          <label className="flex items-center gap-2 text-sm font-semibold text-slate-700 md:col-span-2">
            <input checked={chainForm.can_be_hidden_later} className={checkboxClassName} onChange={(event) => updateChainForm({ can_be_hidden_later: event.target.checked })} type="checkbox" />
            Signatures from this step can be hidden in forwarded views
          </label>
          <label className={`${labelClassName} md:col-span-2`}>
            Notes
            <textarea className={`${fieldClassName} min-h-20 resize-y`} onChange={(event) => updateChainForm({ notes: event.target.value })} value={chainForm.notes} />
          </label>
        </div>

        <section className="space-y-3 rounded-lg border border-slate-200 bg-slate-50/60 p-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-sm font-bold text-slate-950">Signature steps</h3>
            <Button className="px-3 py-1.5 text-xs" icon="plus" onClick={addStep}>Add signer</Button>
          </div>
          <div className="space-y-2">
            {chainForm.steps.map((step, index) => (
              <article className="grid gap-3 rounded-lg border border-slate-200 bg-white p-3 md:grid-cols-[3rem_minmax(0,1fr)_minmax(0,.8fr)_auto]" key={`${step.id || "new"}-${index}`}>
                <div className="flex h-9 w-9 items-center justify-center rounded-full bg-[#061d49] text-sm font-bold text-white">{index + 1}</div>
                <label className={labelClassName}>
                  Position
                  <select className={fieldClassName} onChange={(event) => updateStep(index, { required_position_id: event.target.value })} required value={step.required_position_id}>
                    <option value="" disabled>Select signer position</option>
                    {availablePositions.map((position) => <option key={position.id} value={position.id}>{position.title}</option>)}
                  </select>
                </label>
                <label className={labelClassName}>
                  Unit scope
                  <select className={fieldClassName} onChange={(event) => updateStep(index, { required_unit_scope: event.target.value })} required value={step.required_unit_scope}>
                    {scopeOptions.map((scope) => <option key={scope} value={scope}>{scope.replaceAll("_", " ")}</option>)}
                  </select>
                </label>
                <div className="flex flex-col justify-end gap-2">
                  <label className="flex items-center gap-2 text-sm font-semibold text-slate-700">
                    <input checked={step.is_required} className={checkboxClassName} onChange={(event) => updateStep(index, { is_required: event.target.checked })} type="checkbox" />
                    Required
                  </label>
                  <label className="flex items-center gap-2 text-sm font-semibold text-slate-700">
                    <input checked={step.can_finalize_document} className={checkboxClassName} onChange={(event) => updateStep(index, { can_finalize_document: event.target.checked })} type="checkbox" />
                    Final
                  </label>
                  <Button className="px-3 py-1.5 text-xs" disabled={chainForm.steps.length <= 1} onClick={() => removeStep(index)} variant="danger">Remove</Button>
                </div>
              </article>
            ))}
          </div>
        </section>
      </form>
    );
  }

  return (
    <div className="space-y-4">
      <AdminPageHeader
        actions={(
          <>
            <Button icon="plus" onClick={() => openCreateChainModal()} variant="primary">{t("admin.signatureRules.actions.newRule")}</Button>
            <Button icon="template" onClick={() => setActiveModal("templates")}>{t("admin.signatureRules.actions.useTemplate")}</Button>
            <Button icon="settings" onClick={() => selectedChain ? openEditChainModal(selectedChain) : openCreateChainModal()} variant="primary">{t("admin.signatureRules.actions.guidedBuilder")}</Button>
          </>
        )}
        description={t("admin.signatureRules.description")}
        title={t("admin.signatureRules.title")}
      />

      <SignatureRuleStats
        labels={{
          activeChains: t("admin.signatureRules.stats.activeChains"),
          documentTypes: t("admin.signatureRules.stats.documentTypes"),
          finalRules: t("admin.signatureRules.stats.finalRules"),
          total: t("admin.signatureRules.stats.total"),
          visibilityRules: t("admin.signatureRules.stats.visibilityRules"),
          warnings: t("admin.signatureRules.stats.warnings")
        }}
        loading={loading}
        stats={stats}
      />

      <section className="min-w-0">
        <SignatureRuleDirectory
          documentTypes={data.documentTypes}
          onEditChain={openEditChainModal}
          onManageSigners={(row) => openEditChainModal(row, true)}
          onOpenActions={openActionsModal}
          onSelectChain={setSelectedChainId}
          onViewChain={viewChain}
          rows={rows}
          selectedChainId={selectedChainId}
          unitTypes={data.unitTypes}
        />
      </section>

      <section className="grid min-w-0 gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(24rem,.72fr)] min-[1800px]:grid-cols-[minmax(0,1.08fr)_minmax(24rem,.72fr)_minmax(27rem,.78fr)]">
        <div className="min-w-0">
          <EasySignatureBuilder
            documentTypes={data.documentTypes}
            onAddSigner={(row) => openEditChainModal(row, true)}
            onCancel={handleCancelBuilder}
            onSaveDraft={(row) => void updateChainStatus(row, "draft")}
            onSaveRule={(row) => void updateChainStatus(row, "active")}
            onSelectScope={handleSelectScope}
            onSelectStatus={handleSelectStatus}
            selectedChain={selectedChain}
            selectedStatus={builderStatus}
            unitTypes={data.unitTypes}
          />
        </div>
        <div className="min-w-0" ref={inspectorRef} tabIndex={-1}>
          <SignatureRuleInspector
            onCloneChain={openCloneChainModal}
            onDisableChain={(row) => void updateChainStatus(row, "inactive")}
            onEditChain={openEditChainModal}
            onPreviewChain={openPreviewModal}
            selectedChain={selectedChain}
          />
        </div>
        <div className="min-w-0 space-y-4 xl:col-span-2 min-[1800px]:col-span-1">
          <SignatureFlowPreview onFitView={openPreviewModal} selectedChain={selectedChain} />
          <SignaturePlacementPreview onChangePlacement={openPlacementModal} selectedChain={selectedChain} />
        </div>
      </section>

      <section className="min-w-0 space-y-4">
        <div className="grid min-w-0 gap-4 lg:grid-cols-2 xl:grid-cols-3">
          <SignatureRuleTemplates onUseTemplate={openCreateChainModal} />
          <SignatureRuleHelp />
          <SignatureConflictQueue onSelectChain={setSelectedChainId} rows={conflictQueue} />
        </div>
      </section>

      <AdminModal
        footer={(
          <>
            <Button disabled={busy} onClick={closeModal}>Cancel</Button>
            <Button disabled={busy} form="signature-chain-create-form" icon="plus" type="submit" variant="primary">Create chain</Button>
          </>
        )}
        onClose={closeModal}
        open={activeModal === "create"}
        size="lg"
        title="Create signature chain"
      >
        {renderChainForm("signature-chain-create-form")}
      </AdminModal>

      <AdminModal
        footer={(
          <>
            <Button disabled={busy} onClick={closeModal}>Cancel</Button>
            <Button disabled={busy} form="signature-chain-edit-form" icon="edit" type="submit" variant="primary">Save chain</Button>
          </>
        )}
        onClose={closeModal}
        open={activeModal === "edit"}
        size="lg"
        title="Edit signature chain"
      >
        {renderChainForm("signature-chain-edit-form")}
      </AdminModal>

      <AdminModal
        footer={<Button disabled={busy} onClick={closeModal}>Close</Button>}
        onClose={closeModal}
        open={activeModal === "actions"}
        title="Signature rule actions"
      >
        {modalChain ? (
          <div className="space-y-3">
            {formError ? <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm font-medium text-red-700">{formError}</p> : null}
            <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
              <p className="truncate text-sm font-bold text-[#061d49]">{modalChain.ruleName}</p>
              <p className="force-ltr mt-1 truncate text-start text-xs font-semibold text-slate-500">{modalChain.ruleCode}</p>
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
              <Button className="justify-start" icon="view" onClick={() => { closeModal(); viewChain(modalChain); }}>View</Button>
              <Button className="justify-start" icon="edit" onClick={() => openEditChainModal(modalChain)}>Edit</Button>
              <Button className="justify-start" icon="users" onClick={() => openEditChainModal(modalChain, true)}>Manage signers</Button>
              <Button className="justify-start" icon="template" onClick={() => openCloneChainModal(modalChain)}>Clone</Button>
              <Button className="justify-start" icon="view" onClick={() => openPreviewModal(modalChain)}>Preview</Button>
              <Button className="justify-start" icon="edit" onClick={() => openPlacementModal(modalChain)}>Change placement</Button>
              <Button className="justify-start" icon="userCheck" onClick={() => void updateChainStatus(modalChain, "active")}>Activate</Button>
              <Button className="justify-start" icon="document" onClick={() => void updateChainStatus(modalChain, "draft")}>Mark draft</Button>
              <Button className="justify-start" icon="pause" onClick={() => void updateChainStatus(modalChain, "inactive")}>Disable</Button>
              <Button className="justify-start" icon="document" onClick={() => void updateChainStatus(modalChain, "archived")}>Archive</Button>
              <Button className="justify-start sm:col-span-2" icon="userX" onClick={() => openDeleteModal(modalChain)} variant="danger">Delete chain</Button>
            </div>
          </div>
        ) : null}
      </AdminModal>

      <AdminModal
        footer={(
          <>
            <Button disabled={busy} onClick={closeModal}>Cancel</Button>
            <Button disabled={busy} icon="userX" onClick={() => void handleDeleteChain()} variant="danger">Delete chain</Button>
          </>
        )}
        onClose={closeModal}
        open={activeModal === "delete"}
        title="Delete signature chain"
      >
        <div className="space-y-3">
          {formError ? <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm font-medium text-red-700">{formError}</p> : null}
          <p className="text-sm leading-6 text-slate-700">This removes the configured signature-rule steps. Existing signature history remains on documents that already used them.</p>
          <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm font-bold text-red-800">{modalChain?.ruleName || "-"}</div>
        </div>
      </AdminModal>

      <AdminModal
        footer={(
          <>
            <Button disabled={busy} onClick={closeModal}>Cancel</Button>
            <Button disabled={busy} form="signature-placement-form" icon="edit" type="submit" variant="primary">Save placement</Button>
          </>
        )}
        onClose={closeModal}
        open={activeModal === "placement"}
        title="Change signature placement"
      >
        <form className="space-y-4" id="signature-placement-form" onSubmit={handleSavePlacement}>
          {formError ? <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm font-medium text-red-700">{formError}</p> : null}
          <label className={labelClassName}>
            Placement
            <select className={fieldClassName} onChange={(event) => setPlacementValue(event.target.value)} value={placementValue}>
              {placementOptions.map((placement) => <option key={placement} value={placement}>{placement}</option>)}
            </select>
          </label>
          <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm leading-6 text-amber-900">
            This screen stores placement guidance in the rule notes until document-template level signature coordinates are available.
          </p>
        </form>
      </AdminModal>

      <AdminModal
        footer={<Button onClick={closeModal}>Close</Button>}
        onClose={closeModal}
        open={activeModal === "preview"}
        size="lg"
        title="Signature chain preview"
      >
        <div className="grid gap-4 lg:grid-cols-2">
          <SignatureFlowPreview selectedChain={modalChain} />
          <SignaturePlacementPreview onChangePlacement={openPlacementModal} selectedChain={modalChain} />
        </div>
      </AdminModal>

      <AdminModal
        footer={<Button onClick={closeModal}>Close</Button>}
        onClose={closeModal}
        open={activeModal === "templates"}
        size="lg"
        title="Start from a signature template"
      >
        <SignatureRuleTemplates
          onUseTemplate={(templateId) => {
            closeModal();
            openCreateChainModal(templateId);
          }}
        />
      </AdminModal>
    </div>
  );
}
