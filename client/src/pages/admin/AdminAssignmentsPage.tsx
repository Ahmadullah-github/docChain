import type { FormEvent } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import { adminApi } from "../../api";
import type { AdminAssignment, EntityId, Person, Position, Unit } from "../../api";
import { AdminModal, AdminPageHeader } from "../../components/admin";
import {
  AssignmentDirectory,
  AssignmentInspector,
  AssignmentRegistry,
  AssignmentRelationshipPreview,
  AssignmentStats,
  buildAssignmentRows
} from "../../components/admin/assignments";
import {
  assignmentTypeText,
  signText,
  statusText
} from "../../components/admin/assignments/AssignmentDirectory";
import type { AssignmentAdminRow } from "../../components/admin/assignments/types";
import { Button } from "../../components/ui";
import { useI18n } from "../../i18n";
import { downloadWorkbook } from "../../lib/workbook";

type AssignmentsPageData = {
  assignments: AdminAssignment[];
  persons: Person[];
  positions: Position[];
  units: Unit[];
};

type AssignmentForm = {
  ends_at: string;
  is_primary: boolean;
  person_id: string;
  position_id: string;
  reason: string;
  starts_at: string;
  status: string;
};

type BulkAssignmentForm = Omit<AssignmentForm, "person_id"> & {
  person_ids: string[];
};

type ActiveModal = "create" | "edit" | "transfer" | "access" | "bulk" | "actions" | "delete" | "rules" | null;

const emptyData: AssignmentsPageData = {
  assignments: [],
  persons: [],
  positions: [],
  units: []
};

const fieldClassName = "min-h-10 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm outline-none transition focus:border-[#061d49] focus:ring-4 focus:ring-[#061d49]/10";
const labelClassName = "space-y-1 text-sm font-semibold text-slate-700";

async function safe<T>(promise: Promise<T>, fallback: T) {
  try {
    return await promise;
  } catch {
    return fallback;
  }
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Request failed.";
}

function chooseDefaultAssignment(rows: ReturnType<typeof buildAssignmentRows>) {
  return rows.find((row) => row.status === "active") || rows[0] || null;
}

function dateTimeInput(value?: string | null) {
  return value ? String(value).replace(" ", "T").slice(0, 16) : "";
}

function currentDateTimeInput() {
  return new Date().toISOString().slice(0, 16);
}

function firstActive<T extends { status?: string }>(items: T[]) {
  return items.find((item) => item.status === "active") || items[0];
}

function positionOptionLabel(position: Position, unitsById: Map<EntityId, Unit>) {
  const unit = unitsById.get(position.unit_id);
  const unitName = unit?.name || position.unitName || position.unitCode || "";
  return unitName ? `${position.title} - ${unitName}` : position.title;
}

function assignmentFormDefaults(data: AssignmentsPageData, row?: AssignmentAdminRow | null): AssignmentForm {
  const firstPerson = firstActive(data.persons);
  const firstPosition = firstActive(data.positions);

  return {
    ends_at: dateTimeInput(row?.assignment.ends_at),
    is_primary: Boolean(row?.assignment.is_primary),
    person_id: String(row?.assignment.person_id || firstPerson?.id || ""),
    position_id: String(row?.assignment.position_id || firstPosition?.id || ""),
    reason: "",
    starts_at: dateTimeInput(row?.assignment.starts_at),
    status: row?.status || "active"
  };
}

function bulkAssignmentDefaults(data: AssignmentsPageData): BulkAssignmentForm {
  const firstPosition = firstActive(data.positions);

  return {
    ends_at: "",
    is_primary: false,
    person_ids: [],
    position_id: String(firstPosition?.id || ""),
    reason: "",
    starts_at: "",
    status: "active"
  };
}

function assignmentPayload(form: AssignmentForm) {
  return {
    ends_at: form.ends_at ? form.ends_at : null,
    is_primary: form.is_primary,
    person_id: Number(form.person_id),
    position_id: Number(form.position_id),
    reason: form.reason.trim() || null,
    starts_at: form.starts_at ? form.starts_at : null,
    status: form.status
  };
}

function hasInvalidDateRange(startsAt: string, endsAt: string) {
  return Boolean(startsAt && endsAt && new Date(startsAt).getTime() > new Date(endsAt).getTime());
}

export function AdminAssignmentsPage() {
  const { t } = useI18n();
  const [data, setData] = useState<AssignmentsPageData>(emptyData);
  const [loading, setLoading] = useState(true);
  const [selectedAssignmentId, setSelectedAssignmentId] = useState<EntityId | null>(null);
  const [activeModal, setActiveModal] = useState<ActiveModal>(null);
  const [modalAssignmentId, setModalAssignmentId] = useState<EntityId | null>(null);
  const [assignmentForm, setAssignmentForm] = useState<AssignmentForm>(() => assignmentFormDefaults(emptyData));
  const [bulkForm, setBulkForm] = useState<BulkAssignmentForm>(() => bulkAssignmentDefaults(emptyData));
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const inspectorRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    let alive = true;

    async function loadAssignments() {
      setLoading(true);
      const [assignments, positions, units, persons] = await Promise.all([
        safe(adminApi.assignments.list(), []),
        safe(adminApi.positions.list(), []),
        safe(adminApi.units.list(), []),
        safe(adminApi.persons.list(), [])
      ]);

      if (alive) {
        setData({ assignments, persons, positions, units });
        setLoading(false);
      }
    }

    void loadAssignments();

    return () => {
      alive = false;
    };
  }, []);

  const rows = useMemo(() => buildAssignmentRows(data), [data]);

  useEffect(() => {
    const selectedStillExists = selectedAssignmentId ? rows.some((row) => row.id === selectedAssignmentId) : false;
    if (!selectedStillExists) {
      setSelectedAssignmentId(chooseDefaultAssignment(rows)?.id || null);
    }
  }, [rows, selectedAssignmentId]);

  const selectedAssignment = rows.find((row) => row.id === selectedAssignmentId) || null;
  const modalAssignment = rows.find((row) => row.id === modalAssignmentId) || selectedAssignment;
  const unitsById = useMemo(() => new Map<EntityId, Unit>(data.units.map((unit) => [unit.id, unit])), [data.units]);
  const stats = {
    active: rows.filter((row) => row.status === "active").length,
    canSign: rows.filter((row) => row.signEligibility !== "no").length,
    delegated: rows.filter((row) => row.assignmentType === "delegated").length,
    endingSoon: rows.filter((row) => row.endingSoon).length,
    pending: rows.filter((row) => row.assignmentType === "pending" || row.status.includes("pending")).length,
    total: rows.length
  };

  async function refreshAssignments(nextSelectedId?: EntityId | null) {
    setLoading(true);
    const [assignments, positions, units, persons] = await Promise.all([
      adminApi.assignments.list(),
      adminApi.positions.list(),
      adminApi.units.list(),
      adminApi.persons.list()
    ]);
    setData({ assignments, persons, positions, units });
    if (nextSelectedId !== undefined) {
      setSelectedAssignmentId(nextSelectedId);
    }
    setLoading(false);
  }

  function closeModal() {
    setActiveModal(null);
    setModalAssignmentId(null);
    setFormError(null);
    setBusy(false);
  }

  function openCreateModal() {
    setAssignmentForm(assignmentFormDefaults(data));
    setFormError(null);
    setActiveModal("create");
  }

  function openBulkModal() {
    setBulkForm(bulkAssignmentDefaults(data));
    setFormError(null);
    setActiveModal("bulk");
  }

  function openEditModal(row: AssignmentAdminRow) {
    setModalAssignmentId(row.id);
    setAssignmentForm(assignmentFormDefaults(data, row));
    setFormError(null);
    setActiveModal("edit");
  }

  function openTransferModal(row: AssignmentAdminRow) {
    setModalAssignmentId(row.id);
    setAssignmentForm({ ...assignmentFormDefaults(data, row), reason: t("admin.assignments.form.transferReasonDefault") });
    setFormError(null);
    setActiveModal("transfer");
  }

  function openAccessModal(row: AssignmentAdminRow) {
    setModalAssignmentId(row.id);
    setAssignmentForm(assignmentFormDefaults(data, row));
    setFormError(null);
    setActiveModal("access");
  }

  function openActionsModal(row: AssignmentAdminRow) {
    setModalAssignmentId(row.id);
    setFormError(null);
    setActiveModal("actions");
  }

  function openDeleteModal(row: AssignmentAdminRow) {
    setModalAssignmentId(row.id);
    setFormError(null);
    setActiveModal("delete");
  }

  function openRulesModal(row: AssignmentAdminRow) {
    setModalAssignmentId(row.id);
    setFormError(null);
    setActiveModal("rules");
  }

  function validateForm(form: AssignmentForm) {
    if (!form.person_id || !form.position_id || !form.status) {
      setFormError(t("admin.assignments.form.requiredFields"));
      return false;
    }

    if (hasInvalidDateRange(form.starts_at, form.ends_at)) {
      setFormError(t("admin.assignments.form.invalidDateRange"));
      return false;
    }

    return true;
  }

  function validateBulkForm(form: BulkAssignmentForm) {
    if (!form.person_ids.length || !form.position_id || !form.status) {
      setFormError(t("admin.assignments.form.noPeopleSelected"));
      return false;
    }

    if (hasInvalidDateRange(form.starts_at, form.ends_at)) {
      setFormError(t("admin.assignments.form.invalidDateRange"));
      return false;
    }

    return true;
  }

  async function handleCreateAssignment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!validateForm(assignmentForm)) {
      return;
    }

    setBusy(true);
    setFormError(null);
    try {
      const created = await adminApi.assignments.create(assignmentPayload(assignmentForm));
      await refreshAssignments(created.id);
      closeModal();
    } catch (error) {
      setFormError(errorMessage(error));
      setBusy(false);
    }
  }

  async function handleEditAssignment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!modalAssignment || !validateForm(assignmentForm)) {
      return;
    }

    setBusy(true);
    setFormError(null);
    try {
      await adminApi.assignments.update(modalAssignment.id, assignmentPayload(assignmentForm));
      await refreshAssignments(modalAssignment.id);
      closeModal();
    } catch (error) {
      setFormError(errorMessage(error));
      setBusy(false);
    }
  }

  async function handleTransferAssignment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!modalAssignment || !validateForm(assignmentForm)) {
      return;
    }

    setBusy(true);
    setFormError(null);
    try {
      await adminApi.assignments.update(modalAssignment.id, {
        ...assignmentPayload(assignmentForm),
        reason: assignmentForm.reason.trim() || t("admin.assignments.form.transferReasonDefault")
      });
      await refreshAssignments(modalAssignment.id);
      closeModal();
    } catch (error) {
      setFormError(errorMessage(error));
      setBusy(false);
    }
  }

  async function handleManageAccess(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!modalAssignment || !validateForm(assignmentForm)) {
      return;
    }

    setBusy(true);
    setFormError(null);
    try {
      await adminApi.assignments.update(modalAssignment.id, assignmentPayload(assignmentForm));
      await refreshAssignments(modalAssignment.id);
      closeModal();
    } catch (error) {
      setFormError(errorMessage(error));
      setBusy(false);
    }
  }

  async function handleBulkAssign(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!validateBulkForm(bulkForm)) {
      return;
    }

    setBusy(true);
    setFormError(null);
    try {
      const created = await Promise.all(bulkForm.person_ids.map((personId) => adminApi.assignments.create({
        ends_at: bulkForm.ends_at ? bulkForm.ends_at : null,
        is_primary: bulkForm.is_primary,
        person_id: Number(personId),
        position_id: Number(bulkForm.position_id),
        reason: bulkForm.reason.trim() || null,
        starts_at: bulkForm.starts_at ? bulkForm.starts_at : null,
        status: bulkForm.status
      })));
      await refreshAssignments(created[0]?.id || null);
      closeModal();
    } catch (error) {
      setFormError(errorMessage(error));
      setBusy(false);
    }
  }

  async function updateAssignmentStatus(row: AssignmentAdminRow, status: string, reason?: string) {
    setBusy(true);
    setFormError(null);
    try {
      await adminApi.assignments.update(row.id, { reason: reason || `Assignment status set to ${status}.`, status });
      await refreshAssignments(row.id);
      closeModal();
    } catch (error) {
      setFormError(errorMessage(error));
      setBusy(false);
    }
  }

  async function endAssignment(row: AssignmentAdminRow) {
    setBusy(true);
    setFormError(null);
    try {
      await adminApi.assignments.update(row.id, {
        ends_at: currentDateTimeInput(),
        reason: t("admin.assignments.form.endReasonDefault"),
        status: "suspended"
      });
      await refreshAssignments(row.id);
      closeModal();
    } catch (error) {
      setFormError(errorMessage(error));
      setBusy(false);
    }
  }

  async function deleteAssignment() {
    if (!modalAssignment) {
      return;
    }

    setBusy(true);
    setFormError(null);
    try {
      await adminApi.assignments.remove(modalAssignment.id);
      await refreshAssignments(null);
      closeModal();
    } catch (error) {
      setFormError(errorMessage(error));
      setBusy(false);
    }
  }

  async function exportAssignments(exportRows: AssignmentAdminRow[]) {
    await downloadWorkbook("docchain-assignments-registry.xlsx", [
      {
        name: "Assignments",
        rows: exportRows.map((row) => ({
          "Assignment Code": row.assignmentCode,
          "Assignment Type": assignmentTypeText(row.assignmentType, t),
          "Can Sign": signText(row.signEligibility, t),
          "End Date": row.assignment.ends_at || "",
          Holder: row.displayName,
          "Last Updated": row.lastUpdated,
          "Local Name": row.localName,
          Position: row.position?.title || row.assignment.positionTitle || "",
          "Start Date": row.assignment.starts_at || "",
          Status: statusText(row.status, t),
          Unit: row.unit?.name || row.assignment.unitName || ""
        }))
      }
    ]);
  }

  function viewAssignment(assignmentId: EntityId) {
    setSelectedAssignmentId(assignmentId);
    window.setTimeout(() => {
      inspectorRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 0);
  }

  function renderError() {
    return formError ? (
      <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm font-semibold text-red-700">
        {formError}
      </div>
    ) : null;
  }

  function renderAssignmentFields(value: AssignmentForm, onChange: (next: AssignmentForm) => void, options?: { accessOnly?: boolean; transferOnly?: boolean }) {
    const accessOnly = options?.accessOnly;
    const transferOnly = options?.transferOnly;

    return (
      <div className="grid gap-4 sm:grid-cols-2">
        {!accessOnly ? (
          <label className={labelClassName}>
            {t("admin.assignments.form.person")}
            <select className={fieldClassName} onChange={(event) => onChange({ ...value, person_id: event.target.value })} required value={value.person_id}>
              <option value="">{t("admin.assignments.form.selectPerson")}</option>
              {data.persons.map((person) => (
                <option key={person.id} value={person.id}>{person.display_name}</option>
              ))}
            </select>
          </label>
        ) : null}

        {!accessOnly && !transferOnly ? (
          <label className={labelClassName}>
            {t("admin.assignments.form.position")}
            <select className={fieldClassName} onChange={(event) => onChange({ ...value, position_id: event.target.value })} required value={value.position_id}>
              <option value="">{t("admin.assignments.form.selectPosition")}</option>
              {data.positions.map((position) => (
                <option key={position.id} value={position.id}>{positionOptionLabel(position, unitsById)}</option>
              ))}
            </select>
          </label>
        ) : null}

        <label className={labelClassName}>
          {t("admin.assignments.form.status")}
          <select className={fieldClassName} onChange={(event) => onChange({ ...value, status: event.target.value })} required value={value.status}>
            <option value="active">{t("admin.assignments.status.active")}</option>
            <option value="pending_approval">{t("admin.assignments.status.pendingApproval")}</option>
            <option value="suspended">{t("admin.assignments.status.suspended")}</option>
            <option value="draft">{t("admin.assignments.status.draft")}</option>
            <option value="disabled">{t("admin.assignments.status.disabled")}</option>
          </select>
        </label>

        <label className={labelClassName}>
          {t("admin.assignments.form.startDate")}
          <input className={`${fieldClassName} force-ltr text-start`} onChange={(event) => onChange({ ...value, starts_at: event.target.value })} type="datetime-local" value={value.starts_at} />
        </label>
        <label className={labelClassName}>
          {t("admin.assignments.form.endDate")}
          <input className={`${fieldClassName} force-ltr text-start`} onChange={(event) => onChange({ ...value, ends_at: event.target.value })} type="datetime-local" value={value.ends_at} />
        </label>
        <label className="flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-semibold text-slate-700">
          <input checked={value.is_primary} onChange={(event) => onChange({ ...value, is_primary: event.target.checked })} type="checkbox" />
          {t("admin.assignments.form.primaryAssignment")}
        </label>
        <label className={`${labelClassName} sm:col-span-2`}>
          {t("admin.assignments.form.reason")}
          <textarea className={`${fieldClassName} min-h-24`} onChange={(event) => onChange({ ...value, reason: event.target.value })} value={value.reason} />
        </label>
      </div>
    );
  }

  function renderBulkFields() {
    return (
      <div className="grid gap-4 sm:grid-cols-2">
        <label className={`${labelClassName} sm:col-span-2`}>
          {t("admin.assignments.form.people")}
          <select
            className={`${fieldClassName} min-h-40`}
            multiple
            onChange={(event) => setBulkForm({
              ...bulkForm,
              person_ids: Array.from(event.currentTarget.selectedOptions).map((option) => option.value)
            })}
            value={bulkForm.person_ids}
          >
            {data.persons.map((person) => (
              <option key={person.id} value={person.id}>{person.display_name}</option>
            ))}
          </select>
        </label>
        <label className={labelClassName}>
          {t("admin.assignments.form.position")}
          <select className={fieldClassName} onChange={(event) => setBulkForm({ ...bulkForm, position_id: event.target.value })} required value={bulkForm.position_id}>
            <option value="">{t("admin.assignments.form.selectPosition")}</option>
            {data.positions.map((position) => (
              <option key={position.id} value={position.id}>{positionOptionLabel(position, unitsById)}</option>
            ))}
          </select>
        </label>
        <label className={labelClassName}>
          {t("admin.assignments.form.status")}
          <select className={fieldClassName} onChange={(event) => setBulkForm({ ...bulkForm, status: event.target.value })} required value={bulkForm.status}>
            <option value="active">{t("admin.assignments.status.active")}</option>
            <option value="pending_approval">{t("admin.assignments.status.pendingApproval")}</option>
            <option value="suspended">{t("admin.assignments.status.suspended")}</option>
            <option value="draft">{t("admin.assignments.status.draft")}</option>
            <option value="disabled">{t("admin.assignments.status.disabled")}</option>
          </select>
        </label>
        <label className={labelClassName}>
          {t("admin.assignments.form.startDate")}
          <input className={`${fieldClassName} force-ltr text-start`} onChange={(event) => setBulkForm({ ...bulkForm, starts_at: event.target.value })} type="datetime-local" value={bulkForm.starts_at} />
        </label>
        <label className={labelClassName}>
          {t("admin.assignments.form.endDate")}
          <input className={`${fieldClassName} force-ltr text-start`} onChange={(event) => setBulkForm({ ...bulkForm, ends_at: event.target.value })} type="datetime-local" value={bulkForm.ends_at} />
        </label>
        <label className="flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-semibold text-slate-700">
          <input checked={bulkForm.is_primary} onChange={(event) => setBulkForm({ ...bulkForm, is_primary: event.target.checked })} type="checkbox" />
          {t("admin.assignments.form.primaryAssignment")}
        </label>
        <label className={`${labelClassName} sm:col-span-2`}>
          {t("admin.assignments.form.reason")}
          <textarea className={`${fieldClassName} min-h-24`} onChange={(event) => setBulkForm({ ...bulkForm, reason: event.target.value })} value={bulkForm.reason} />
        </label>
      </div>
    );
  }

  function renderActionButton(label: string, onClick: () => void, variant: "secondary" | "primary" | "danger" = "secondary") {
    return (
      <Button className="justify-start" disabled={busy} onClick={onClick} variant={variant}>
        {label}
      </Button>
    );
  }

  return (
    <div className="space-y-4">
      <AdminPageHeader
        actions={(
          <>
            <Button icon="plus" onClick={openCreateModal} variant="primary">{t("admin.assignments.actions.newAssignment")}</Button>
            <Button disabled={!selectedAssignment} icon="move" onClick={() => selectedAssignment && openTransferModal(selectedAssignment)}>{t("admin.assignments.actions.transferAssignment")}</Button>
          </>
        )}
        description={t("admin.assignments.description")}
        title={t("admin.assignments.title")}
      />

      <AssignmentStats
        labels={{
          active: t("admin.assignments.stats.active"),
          canSign: t("admin.assignments.stats.canSign"),
          delegated: t("admin.assignments.stats.delegated"),
          endingSoon: t("admin.assignments.stats.endingSoon"),
          pending: t("admin.assignments.stats.pending"),
          total: t("admin.assignments.stats.total")
        }}
        loading={loading}
        stats={stats}
      />

      <section className="min-w-0">
        <AssignmentDirectory
          onEditAssignment={openEditModal}
          onOpenAssignmentActions={openActionsModal}
          onSelectAssignment={setSelectedAssignmentId}
          onViewAssignment={viewAssignment}
          rows={rows}
          selectedAssignmentId={selectedAssignmentId}
          units={data.units}
        />
      </section>

      <section className="grid min-w-0 gap-4 xl:grid-cols-[minmax(18rem,.45fr)_minmax(0,1fr)]">
        <AssignmentRelationshipPreview
          onSelectAssignment={setSelectedAssignmentId}
          rows={rows}
          selectedAssignmentId={selectedAssignmentId}
        />
        <div ref={inspectorRef}>
          <AssignmentInspector
            onEditAssignment={openEditModal}
            onManageAccess={openAccessModal}
            onTransferAssignment={openTransferModal}
            onViewRules={openRulesModal}
            selectedAssignment={selectedAssignment}
          />
        </div>
      </section>

      <section className="min-w-0 space-y-4">
        <AssignmentRegistry
          onEditAssignment={openEditModal}
          onExportRows={(exportRows) => void exportAssignments(exportRows)}
          onOpenAssignmentActions={openActionsModal}
          onSelectAssignment={setSelectedAssignmentId}
          onViewAssignment={viewAssignment}
          rows={rows}
          selectedAssignmentId={selectedAssignmentId}
          units={data.units}
        />
      </section>

      <AdminModal
        footer={(
          <>
            <Button disabled={busy} onClick={closeModal}>{t("admin.assignments.form.close")}</Button>
            <Button disabled={busy} form="assignment-create-form" type="submit" variant="primary">{t("admin.assignments.form.createAssignment")}</Button>
          </>
        )}
        onClose={closeModal}
        open={activeModal === "create"}
        size="lg"
        title={t("admin.assignments.form.createTitle")}
      >
        <form className="space-y-4" id="assignment-create-form" onSubmit={handleCreateAssignment}>
          {renderError()}
          {renderAssignmentFields(assignmentForm, setAssignmentForm)}
        </form>
      </AdminModal>

      <AdminModal
        footer={(
          <>
            <Button disabled={busy} onClick={closeModal}>{t("admin.assignments.form.close")}</Button>
            <Button disabled={busy} form="assignment-edit-form" type="submit" variant="primary">{t("admin.assignments.form.saveAssignment")}</Button>
          </>
        )}
        onClose={closeModal}
        open={activeModal === "edit"}
        size="lg"
        title={t("admin.assignments.form.editTitle")}
      >
        <form className="space-y-4" id="assignment-edit-form" onSubmit={handleEditAssignment}>
          {renderError()}
          {renderAssignmentFields(assignmentForm, setAssignmentForm)}
        </form>
      </AdminModal>

      <AdminModal
        footer={(
          <>
            <Button disabled={busy} onClick={closeModal}>{t("admin.assignments.form.close")}</Button>
            <Button disabled={busy} form="assignment-transfer-form" icon="move" type="submit" variant="primary">{t("admin.assignments.form.transferAssignment")}</Button>
          </>
        )}
        onClose={closeModal}
        open={activeModal === "transfer"}
        size="lg"
        title={t("admin.assignments.form.transferTitle")}
      >
        <form className="space-y-4" id="assignment-transfer-form" onSubmit={handleTransferAssignment}>
          {renderError()}
          {renderAssignmentFields(assignmentForm, setAssignmentForm, { transferOnly: true })}
        </form>
      </AdminModal>

      <AdminModal
        footer={(
          <>
            <Button disabled={busy} onClick={closeModal}>{t("admin.assignments.form.close")}</Button>
            <Button disabled={busy} form="assignment-access-form" icon="shield" type="submit" variant="primary">{t("admin.assignments.form.saveAccess")}</Button>
          </>
        )}
        onClose={closeModal}
        open={activeModal === "access"}
        size="lg"
        title={t("admin.assignments.form.accessTitle")}
      >
        <form className="space-y-4" id="assignment-access-form" onSubmit={handleManageAccess}>
          {renderError()}
          {renderAssignmentFields(assignmentForm, setAssignmentForm, { accessOnly: true })}
        </form>
      </AdminModal>

      <AdminModal
        footer={(
          <>
            <Button disabled={busy} onClick={closeModal}>{t("admin.assignments.form.close")}</Button>
            <Button disabled={busy} form="assignment-bulk-form" icon="users" type="submit" variant="primary">{t("admin.assignments.form.bulkAssign")}</Button>
          </>
        )}
        onClose={closeModal}
        open={activeModal === "bulk"}
        size="lg"
        title={t("admin.assignments.form.bulkTitle")}
      >
        <form className="space-y-4" id="assignment-bulk-form" onSubmit={handleBulkAssign}>
          {renderError()}
          {renderBulkFields()}
        </form>
      </AdminModal>

      <AdminModal
        description={modalAssignment ? `${modalAssignment.displayName} · ${modalAssignment.assignmentCode}` : undefined}
        footer={<Button disabled={busy} onClick={closeModal}>{t("admin.assignments.form.close")}</Button>}
        onClose={closeModal}
        open={activeModal === "actions"}
        title={t("admin.assignments.form.actionsTitle")}
      >
        {modalAssignment ? (
          <div className="grid gap-2 sm:grid-cols-2">
            {renderError()}
            {renderActionButton(t("admin.assignments.form.viewAssignment"), () => { viewAssignment(modalAssignment.id); closeModal(); }, "primary")}
            {renderActionButton(t("admin.assignments.form.editAssignment"), () => openEditModal(modalAssignment))}
            {renderActionButton(t("admin.assignments.form.transferAssignment"), () => openTransferModal(modalAssignment))}
            {renderActionButton(t("admin.assignments.form.manageAccess"), () => openAccessModal(modalAssignment))}
            {renderActionButton(t("admin.assignments.form.viewRules"), () => openRulesModal(modalAssignment))}
            {renderActionButton(t("admin.assignments.form.activate"), () => void updateAssignmentStatus(modalAssignment, "active"))}
            {renderActionButton(t("admin.assignments.form.suspend"), () => void updateAssignmentStatus(modalAssignment, "suspended"))}
            {renderActionButton(t("admin.assignments.form.saveDraft"), () => void updateAssignmentStatus(modalAssignment, "draft"))}
            {renderActionButton(t("admin.assignments.form.endAssignment"), () => void endAssignment(modalAssignment))}
            {renderActionButton(t("admin.assignments.form.deleteAssignment"), () => openDeleteModal(modalAssignment), "danger")}
          </div>
        ) : null}
      </AdminModal>

      <AdminModal
        description={t("admin.assignments.form.deleteDescription")}
        footer={(
          <>
            <Button disabled={busy} onClick={closeModal}>{t("admin.assignments.form.close")}</Button>
            <Button disabled={busy} onClick={() => void deleteAssignment()} variant="danger">{t("admin.assignments.form.deleteAssignment")}</Button>
          </>
        )}
        onClose={closeModal}
        open={activeModal === "delete"}
        title={t("admin.assignments.form.deleteTitle")}
      >
        <div className="space-y-3">
          {renderError()}
          <p className="text-sm font-semibold text-slate-700">{modalAssignment?.displayName}</p>
          <p className="force-ltr text-start text-sm text-slate-500">{modalAssignment?.assignmentCode}</p>
        </div>
      </AdminModal>

      <AdminModal
        footer={<Button onClick={closeModal}>{t("admin.assignments.form.close")}</Button>}
        onClose={closeModal}
        open={activeModal === "rules"}
        title={t("admin.assignments.form.rulesTitle")}
      >
        {modalAssignment ? (
          <dl className="space-y-3 text-sm">
            <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
              <dt className="font-bold text-slate-500">{t("admin.assignments.rules.basis")}</dt>
              <dd className="mt-1 text-slate-900">{modalAssignment.position?.title || modalAssignment.assignment.positionTitle || "-"}</dd>
            </div>
            <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
              <dt className="font-bold text-slate-500">{t("admin.assignments.rules.signEligibility")}</dt>
              <dd className="mt-1 text-slate-900">{signText(modalAssignment.signEligibility, t)}</dd>
            </div>
            <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
              <dt className="font-bold text-slate-500">{t("admin.assignments.inspector.authorityScope")}</dt>
              <dd className="mt-1 text-slate-900">{modalAssignment.authorityScope}</dd>
            </div>
            <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
              <dt className="font-bold text-slate-500">{t("admin.assignments.rules.auditTracking")}</dt>
              <dd className="mt-1 text-slate-900">{t("admin.assignments.rules.allLogged")}</dd>
            </div>
          </dl>
        ) : null}
      </AdminModal>
    </div>
  );
}
