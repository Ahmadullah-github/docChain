import { type FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { adminApi } from "../../api";
import type { AdminAssignment, EntityId, Person, Position, Unit } from "../../api";
import { AdminModal, AdminPageHeader } from "../../components/admin";
import {
  buildPositionRows,
  PositionDirectory,
  PositionHierarchyPreview,
  PositionInspector,
  PositionRegistry,
  PositionStats
} from "../../components/admin/positions";
import type { PositionAdminRow } from "../../components/admin/positions/types";
import { Button } from "../../components/ui";
import { downloadWorkbook } from "../../lib/workbook";
import { useI18n } from "../../i18n";

type PositionsPageData = {
  assignments: AdminAssignment[];
  persons: Person[];
  positions: Position[];
  units: Unit[];
};

type ActiveModal = "create" | "edit" | "assign" | "actions" | "delete" | null;

type PositionForm = {
  unit_id: string;
  code: string;
  title: string;
  title_local: string;
  authority_level: string;
  is_signing_authority: boolean;
  allows_multiple_active_assignments: boolean;
  description: string;
  status: string;
};

type HolderAssignmentForm = {
  person_id: string;
  position_id: string;
  status: string;
  is_primary: boolean;
  starts_at: string;
  ends_at: string;
};

const emptyData: PositionsPageData = {
  assignments: [],
  persons: [],
  positions: [],
  units: []
};

const labelClassName = "text-sm font-semibold text-slate-700";
const fieldClassName = "mt-1 block min-h-10 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-800 shadow-sm shadow-slate-900/5 outline-none transition focus:border-[#061d49] focus:ring-4 focus:ring-[#061d49]/10 disabled:bg-slate-50 disabled:text-slate-500";
const checkboxClassName = "h-4 w-4 rounded border-slate-300 text-[#061d49] focus:ring-[#061d49]/20";

async function safe<T>(promise: Promise<T>, fallback: T) {
  try {
    return await promise;
  } catch {
    return fallback;
  }
}

function chooseDefaultPosition(rows: ReturnType<typeof buildPositionRows>) {
  return rows.find((row) => row.status === "active") || rows.find((row) => row.status === "vacant") || rows[0] || null;
}

function firstActiveUnit(units: Unit[]) {
  return units.find((unit) => unit.status === "active") || units[0] || null;
}

function unitLabel(unit: Unit | null | undefined) {
  return unit ? [unit.name, unit.code ? `(${unit.code})` : ""].filter(Boolean).join(" ") : "";
}

function positionOptionLabel(position: Position, unitsById: Map<EntityId, Unit>) {
  const unit = unitsById.get(position.unit_id);
  const unitName = unit?.name || position.unitName || position.unitCode || "";
  return unitName ? `${position.title} - ${unitName}` : position.title;
}

function positionFormDefaults(unitId = ""): PositionForm {
  return {
    allows_multiple_active_assignments: false,
    authority_level: "20",
    code: "",
    description: "",
    is_signing_authority: false,
    status: "active",
    title: "",
    title_local: "",
    unit_id: unitId
  };
}

function positionFormFor(row: PositionAdminRow): PositionForm {
  return {
    allows_multiple_active_assignments: Boolean(row.position.allows_multiple_active_assignments),
    authority_level: String(row.position.authority_level ?? 0),
    code: row.position.code,
    description: row.position.description || "",
    is_signing_authority: Boolean(row.position.is_signing_authority),
    status: row.position.status || "active",
    title: row.position.title,
    title_local: row.position.title_local || "",
    unit_id: row.position.unit_id ? String(row.position.unit_id) : ""
  };
}

function clonedPositionFormFor(row: PositionAdminRow): PositionForm {
  return {
    ...positionFormFor(row),
    code: `${row.position.code}-COPY`,
    status: "draft",
    title: `${row.position.title} Copy`
  };
}

function assignmentFormFor(row: PositionAdminRow | null, persons: Person[], positions: Position[]): HolderAssignmentForm {
  const firstPerson = persons.find((person) => person.status === "active") || persons[0];
  const firstPosition = positions.find((position) => position.status === "active") || positions[0];

  return {
    ends_at: "",
    is_primary: false,
    person_id: firstPerson ? String(firstPerson.id) : "",
    position_id: String(row?.position.id || firstPosition?.id || ""),
    starts_at: "",
    status: "active"
  };
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Request failed.";
}

function normalizeAuthorityLevel(value: string) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function AdminPositionsPage() {
  const { t } = useI18n();
  const [data, setData] = useState<PositionsPageData>(emptyData);
  const [loading, setLoading] = useState(true);
  const [selectedPositionId, setSelectedPositionId] = useState<EntityId | null>(null);
  const [activeModal, setActiveModal] = useState<ActiveModal>(null);
  const [modalPositionId, setModalPositionId] = useState<EntityId | null>(null);
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [positionForm, setPositionForm] = useState<PositionForm>(positionFormDefaults);
  const [assignmentForm, setAssignmentForm] = useState<HolderAssignmentForm>(() => assignmentFormFor(null, [], []));
  const inspectorRef = useRef<HTMLDivElement | null>(null);

  const refreshPositions = useCallback(async (nextSelectedPositionId?: EntityId | null) => {
    setLoading(true);
    const [positions, assignments, units, persons] = await Promise.all([
      safe(adminApi.positions.list(), [] as Position[]),
      safe(adminApi.assignments.list(), [] as AdminAssignment[]),
      safe(adminApi.units.list(), [] as Unit[]),
      safe(adminApi.persons.list(), [] as Person[])
    ]);

    setData({ assignments, persons, positions, units });
    setLoading(false);
    if (nextSelectedPositionId !== undefined) {
      setSelectedPositionId(nextSelectedPositionId);
    }
  }, []);

  useEffect(() => {
    void refreshPositions();
  }, [refreshPositions]);

  const rows = useMemo(() => buildPositionRows(data), [data]);

  useEffect(() => {
    const selectedStillExists = selectedPositionId ? rows.some((row) => row.id === selectedPositionId) : false;
    if (!selectedStillExists) {
      setSelectedPositionId(chooseDefaultPosition(rows)?.id || null);
    }
  }, [rows, selectedPositionId]);

  const selectedPosition = rows.find((row) => row.id === selectedPositionId) || null;
  const modalPosition = modalPositionId ? rows.find((row) => row.id === modalPositionId) || null : null;
  const activePersons = data.persons.filter((person) => person.status === "active");
  const activeUnits = data.units.filter((unit) => unit.status === "active");
  const assignablePositions = data.positions.filter((position) => !["disabled"].includes(position.status));
  const unitsById = useMemo(() => new Map<EntityId, Unit>(data.units.map((unit) => [unit.id, unit])), [data.units]);
  const stats = {
    active: rows.filter((row) => row.status === "active").length,
    canSign: rows.filter((row) => row.canSign).length,
    multiUnit: rows.filter((row) => row.multiUnit).length,
    pending: rows.filter((row) => row.status === "pending" || row.status === "draft").length,
    total: rows.length,
    vacant: rows.filter((row) => row.status === "vacant").length
  };
  const positionStatusOptions = [
    { label: t("admin.positions.status.active"), value: "active" },
    { label: t("admin.positions.status.draft"), value: "draft" },
    { label: t("admin.positions.status.pending"), value: "pending" },
    { label: t("admin.positions.status.suspended"), value: "suspended" },
    { label: t("admin.positions.status.disabled"), value: "disabled" }
  ];
  const assignmentStatusOptions = [
    { label: t("admin.positions.status.active"), value: "active" },
    { label: t("admin.positions.status.pending"), value: "pending" },
    { label: t("admin.positions.status.suspended"), value: "suspended" }
  ];

  function closeModal() {
    setActiveModal(null);
    setModalPositionId(null);
    setFormError(null);
    setBusy(false);
  }

  function scrollToInspector() {
    window.requestAnimationFrame(() => {
      inspectorRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      inspectorRef.current?.focus({ preventScroll: true });
    });
  }

  function viewPosition(row: PositionAdminRow) {
    setSelectedPositionId(row.id);
    scrollToInspector();
  }

  function openCreatePositionModal() {
    setPositionForm(positionFormDefaults(String(firstActiveUnit(data.units)?.id || "")));
    setModalPositionId(null);
    setFormError(null);
    setActiveModal("create");
  }

  function openClonePositionModal(row: PositionAdminRow) {
    setSelectedPositionId(row.id);
    setPositionForm(clonedPositionFormFor(row));
    setModalPositionId(row.id);
    setFormError(null);
    setActiveModal("create");
  }

  function openEditPositionModal(row: PositionAdminRow) {
    setSelectedPositionId(row.id);
    setModalPositionId(row.id);
    setPositionForm(positionFormFor(row));
    setFormError(null);
    setActiveModal("edit");
  }

  function openAssignPositionModal(row?: PositionAdminRow | null) {
    const target = row || selectedPosition || chooseDefaultPosition(rows);
    if (target) {
      setSelectedPositionId(target.id);
      setModalPositionId(target.id);
    } else {
      setModalPositionId(null);
    }
    setAssignmentForm(assignmentFormFor(target || null, data.persons, data.positions));
    setFormError(null);
    setActiveModal("assign");
  }

  function openActionsModal(row: PositionAdminRow) {
    setSelectedPositionId(row.id);
    setModalPositionId(row.id);
    setFormError(null);
    setActiveModal("actions");
  }

  function openDeleteModal(row: PositionAdminRow) {
    setSelectedPositionId(row.id);
    setModalPositionId(row.id);
    setFormError(null);
    setActiveModal("delete");
  }

  async function handleCreatePosition(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setFormError(null);

    try {
      const createdPosition = await adminApi.positions.create({
        allows_multiple_active_assignments: positionForm.allows_multiple_active_assignments,
        authority_level: normalizeAuthorityLevel(positionForm.authority_level),
        code: positionForm.code,
        description: positionForm.description || null,
        is_signing_authority: positionForm.is_signing_authority,
        status: positionForm.status,
        title: positionForm.title,
        title_local: positionForm.title_local || null,
        unit_id: Number(positionForm.unit_id)
      });
      await refreshPositions(createdPosition.id);
      closeModal();
    } catch (error) {
      setFormError(errorMessage(error));
      setBusy(false);
    }
  }

  async function handleEditPosition(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!modalPosition) {
      return;
    }

    setBusy(true);
    setFormError(null);

    try {
      const updatedPosition = await adminApi.positions.update(modalPosition.id, {
        allows_multiple_active_assignments: positionForm.allows_multiple_active_assignments,
        authority_level: normalizeAuthorityLevel(positionForm.authority_level),
        code: positionForm.code,
        description: positionForm.description || null,
        is_signing_authority: positionForm.is_signing_authority,
        status: positionForm.status,
        title: positionForm.title,
        title_local: positionForm.title_local || null,
        unit_id: Number(positionForm.unit_id)
      });
      await refreshPositions(updatedPosition.id);
      closeModal();
    } catch (error) {
      setFormError(errorMessage(error));
      setBusy(false);
    }
  }

  async function handleAssignHolder(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setFormError(null);

    try {
      if (!assignmentForm.person_id || !assignmentForm.position_id) {
        throw new Error(t("admin.positions.form.assignmentRequired"));
      }

      await adminApi.assignments.create({
        ends_at: assignmentForm.ends_at || null,
        is_primary: assignmentForm.is_primary,
        person_id: Number(assignmentForm.person_id),
        position_id: Number(assignmentForm.position_id),
        starts_at: assignmentForm.starts_at || null,
        status: assignmentForm.status
      });
      await refreshPositions(Number(assignmentForm.position_id));
      closeModal();
    } catch (error) {
      setFormError(errorMessage(error));
      setBusy(false);
    }
  }

  async function updatePositionStatus(row: PositionAdminRow, status: string) {
    setBusy(true);
    setFormError(null);

    try {
      await adminApi.positions.update(row.id, { status });
      await refreshPositions(row.id);
      closeModal();
    } catch (error) {
      setFormError(errorMessage(error));
      setBusy(false);
    }
  }

  async function handleDeletePosition() {
    if (!modalPosition) {
      return;
    }

    setBusy(true);
    setFormError(null);

    try {
      await adminApi.positions.remove(modalPosition.id);
      await refreshPositions(null);
      closeModal();
    } catch (error) {
      setFormError(errorMessage(error));
      setBusy(false);
    }
  }

  async function downloadPositions() {
    await downloadWorkbook("docchain-positions-directory.xlsx", [
      {
        name: "Positions",
        rows: rows.map((row) => ({
          Authority: row.authorityBand,
          "Authority Level": row.position.authority_level,
          "Can Sign": row.canSign ? "Yes" : "No",
          Code: row.position.code,
          "Current Holder": row.currentHolder || "",
          "Last Updated": row.lastUpdated,
          "Local Name": row.position.title_local || "",
          Position: row.position.title,
          Status: row.status,
          "Unit Scope": row.unitScope || ""
        }))
      }
    ]);
  }

  function renderPositionFields(value: PositionForm, onChange: (next: PositionForm) => void) {
    const selectedUnit = value.unit_id ? data.units.find((unit) => String(unit.id) === value.unit_id) : null;
    const selectableUnits = selectedUnit && !activeUnits.some((unit) => unit.id === selectedUnit.id)
      ? [...activeUnits, selectedUnit]
      : activeUnits;

    return (
      <>
        <label className={labelClassName}>
          {t("admin.positions.form.code")}
          <input className={`${fieldClassName} force-ltr text-start`} maxLength={80} onChange={(event) => onChange({ ...value, code: event.target.value })} required value={value.code} />
        </label>
        <label className={labelClassName}>
          {t("admin.positions.form.title")}
          <input className={fieldClassName} maxLength={140} onChange={(event) => onChange({ ...value, title: event.target.value })} required value={value.title} />
        </label>
        <label className={labelClassName}>
          {t("admin.positions.form.titleLocal")}
          <input className={fieldClassName} maxLength={140} onChange={(event) => onChange({ ...value, title_local: event.target.value })} value={value.title_local} />
        </label>
        <label className={labelClassName}>
          {t("admin.positions.form.unit")}
          <select className={fieldClassName} onChange={(event) => onChange({ ...value, unit_id: event.target.value })} required value={value.unit_id}>
            <option value="" disabled>{t("admin.positions.form.selectUnit")}</option>
            {selectableUnits.map((unit) => (
              <option key={unit.id} value={unit.id}>{unitLabel(unit)}</option>
            ))}
          </select>
        </label>
        <label className={labelClassName}>
          {t("admin.positions.form.authorityLevel")}
          <input className={`${fieldClassName} force-ltr text-start`} min={0} onChange={(event) => onChange({ ...value, authority_level: event.target.value })} required type="number" value={value.authority_level} />
        </label>
        <label className={labelClassName}>
          {t("admin.positions.form.status")}
          <select className={fieldClassName} onChange={(event) => onChange({ ...value, status: event.target.value })} value={value.status}>
            {positionStatusOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
          </select>
        </label>
        <label className="flex items-center gap-2 text-sm font-semibold text-slate-700 md:col-span-2">
          <input checked={value.is_signing_authority} className={checkboxClassName} onChange={(event) => onChange({ ...value, is_signing_authority: event.target.checked })} type="checkbox" />
          {t("admin.positions.form.canSign")}
        </label>
        <label className="flex items-center gap-2 text-sm font-semibold text-slate-700 md:col-span-2">
          <input checked={value.allows_multiple_active_assignments} className={checkboxClassName} onChange={(event) => onChange({ ...value, allows_multiple_active_assignments: event.target.checked })} type="checkbox" />
          {t("admin.positions.form.allowsMultipleActiveAssignments")}
        </label>
        <label className={`${labelClassName} md:col-span-2`}>
          {t("admin.positions.form.description")}
          <textarea className={`${fieldClassName} min-h-24 resize-y`} onChange={(event) => onChange({ ...value, description: event.target.value })} value={value.description} />
        </label>
      </>
    );
  }

  return (
    <div className="space-y-4">
      <AdminPageHeader
        actions={(
          <>
            <Button icon="plus" onClick={openCreatePositionModal} variant="primary">{t("admin.positions.actions.newPosition")}</Button>
            <Button icon="hierarchy" onClick={() => openAssignPositionModal()}>{t("admin.positions.actions.assignPosition")}</Button>
          </>
        )}
        description={t("admin.positions.description")}
        title={t("admin.positions.title")}
      />

      <PositionStats
        labels={{
          active: t("admin.positions.stats.active"),
          canSign: t("admin.positions.stats.canSign"),
          multiUnit: t("admin.positions.stats.multiUnit"),
          pending: t("admin.positions.stats.pending"),
          total: t("admin.positions.stats.total"),
          vacant: t("admin.positions.stats.vacant")
        }}
        loading={loading}
        stats={stats}
      />

      <section className="min-w-0">
        <PositionDirectory
          onAssignPosition={openAssignPositionModal}
          onEditPosition={openEditPositionModal}
          onOpenPositionActions={openActionsModal}
          onSelectPosition={setSelectedPositionId}
          onViewPosition={viewPosition}
          rows={rows}
          selectedPositionId={selectedPositionId}
        />
      </section>

      <section className="grid min-w-0 gap-4 xl:grid-cols-[minmax(0,.9fr)_minmax(0,1.1fr)]">
        <PositionHierarchyPreview
          onSelectPosition={setSelectedPositionId}
          rows={rows}
          selectedPositionId={selectedPositionId}
        />
        <div ref={inspectorRef} tabIndex={-1}>
          <PositionInspector
            onAssignPosition={openAssignPositionModal}
            onClonePosition={openClonePositionModal}
            onEditPosition={openEditPositionModal}
            selectedPosition={selectedPosition}
          />
        </div>
      </section>

      <section className="min-w-0 space-y-4">
        <PositionRegistry
          onAssignPosition={openAssignPositionModal}
          onEditPosition={openEditPositionModal}
          onExportPositions={() => void downloadPositions()}
          onOpenPositionActions={openActionsModal}
          onSelectPosition={setSelectedPositionId}
          onViewPosition={viewPosition}
          rows={rows}
          selectedPositionId={selectedPositionId}
          units={data.units}
        />
      </section>

      <AdminModal
        footer={(
          <>
            <Button disabled={busy} onClick={closeModal}>{t("admin.organizations.form.cancel")}</Button>
            <Button disabled={busy} form="position-create-form" icon="plus" type="submit" variant="primary">{t("admin.positions.form.createPosition")}</Button>
          </>
        )}
        onClose={closeModal}
        open={activeModal === "create"}
        size="lg"
        title={t("admin.positions.form.createTitle")}
      >
        <form className="grid gap-4 md:grid-cols-2" id="position-create-form" onSubmit={handleCreatePosition}>
          {formError ? <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm font-medium text-red-700 md:col-span-2">{formError}</p> : null}
          {renderPositionFields(positionForm, setPositionForm)}
        </form>
      </AdminModal>

      <AdminModal
        footer={(
          <>
            <Button disabled={busy} onClick={closeModal}>{t("admin.organizations.form.cancel")}</Button>
            <Button disabled={busy} form="position-edit-form" icon="edit" type="submit" variant="primary">{t("admin.positions.form.savePosition")}</Button>
          </>
        )}
        onClose={closeModal}
        open={activeModal === "edit"}
        size="lg"
        title={t("admin.positions.form.editTitle")}
      >
        <form className="grid gap-4 md:grid-cols-2" id="position-edit-form" onSubmit={handleEditPosition}>
          {formError ? <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm font-medium text-red-700 md:col-span-2">{formError}</p> : null}
          {renderPositionFields(positionForm, setPositionForm)}
        </form>
      </AdminModal>

      <AdminModal
        footer={(
          <>
            <Button disabled={busy} onClick={closeModal}>{t("admin.organizations.form.cancel")}</Button>
            <Button disabled={busy} form="position-assign-form" icon="users" type="submit" variant="primary">{t("admin.positions.form.saveAssignment")}</Button>
          </>
        )}
        onClose={closeModal}
        open={activeModal === "assign"}
        size="lg"
        title={t("admin.positions.form.assignTitle")}
      >
        <form className="grid gap-4 md:grid-cols-2" id="position-assign-form" onSubmit={handleAssignHolder}>
          {formError ? <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm font-medium text-red-700 md:col-span-2">{formError}</p> : null}
          <label className={labelClassName}>
            {t("admin.positions.form.person")}
            <select className={fieldClassName} onChange={(event) => setAssignmentForm((form) => ({ ...form, person_id: event.target.value }))} required value={assignmentForm.person_id}>
              <option value="" disabled>{t("admin.positions.form.selectPerson")}</option>
              {activePersons.map((person) => <option key={person.id} value={person.id}>{person.display_name}</option>)}
            </select>
          </label>
          <label className={labelClassName}>
            {t("admin.positions.form.position")}
            <select className={fieldClassName} onChange={(event) => setAssignmentForm((form) => ({ ...form, position_id: event.target.value }))} required value={assignmentForm.position_id}>
              <option value="" disabled>{t("admin.positions.form.selectPosition")}</option>
              {assignablePositions.map((position) => <option key={position.id} value={position.id}>{positionOptionLabel(position, unitsById)}</option>)}
            </select>
          </label>
          <label className={labelClassName}>
            {t("admin.positions.form.assignmentStatus")}
            <select className={fieldClassName} onChange={(event) => setAssignmentForm((form) => ({ ...form, status: event.target.value }))} value={assignmentForm.status}>
              {assignmentStatusOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
            </select>
          </label>
          <label className={labelClassName}>
            {t("admin.positions.form.startsAt")}
            <input className={`${fieldClassName} force-ltr text-start`} onChange={(event) => setAssignmentForm((form) => ({ ...form, starts_at: event.target.value }))} type="date" value={assignmentForm.starts_at} />
          </label>
          <label className={labelClassName}>
            {t("admin.positions.form.endsAt")}
            <input className={`${fieldClassName} force-ltr text-start`} onChange={(event) => setAssignmentForm((form) => ({ ...form, ends_at: event.target.value }))} type="date" value={assignmentForm.ends_at} />
          </label>
          <label className="flex items-center gap-2 text-sm font-semibold text-slate-700 md:col-span-2">
            <input checked={assignmentForm.is_primary} className={checkboxClassName} onChange={(event) => setAssignmentForm((form) => ({ ...form, is_primary: event.target.checked }))} type="checkbox" />
            {t("admin.positions.form.primaryAssignment")}
          </label>
        </form>
      </AdminModal>

      <AdminModal
        footer={<Button disabled={busy} onClick={closeModal}>{t("admin.organizations.form.close")}</Button>}
        onClose={closeModal}
        open={activeModal === "actions"}
        title={t("admin.positions.form.actionsTitle")}
      >
        {modalPosition ? (
          <div className="space-y-3">
            {formError ? <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm font-medium text-red-700">{formError}</p> : null}
            <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
              <p className="truncate text-sm font-bold text-[#061d49]">{modalPosition.position.title}</p>
              <p className="force-ltr mt-1 text-xs font-semibold text-slate-500">{modalPosition.position.code}</p>
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
              <Button className="justify-start" icon="view" onClick={() => { closeModal(); viewPosition(modalPosition); }}>{t("admin.positions.directory.view")}</Button>
              <Button className="justify-start" icon="edit" onClick={() => openEditPositionModal(modalPosition)}>{t("admin.positions.directory.edit")}</Button>
              <Button className="justify-start" icon="users" onClick={() => openAssignPositionModal(modalPosition)}>{t("admin.positions.directory.assign")}</Button>
              <Button className="justify-start" icon="document" onClick={() => openClonePositionModal(modalPosition)}>{t("admin.positions.inspector.clonePosition")}</Button>
              <Button className="justify-start" icon="userCheck" onClick={() => void updatePositionStatus(modalPosition, "active")}>{t("admin.positions.form.activate")}</Button>
              <Button className="justify-start" icon="document" onClick={() => void updatePositionStatus(modalPosition, "draft")}>{t("admin.positions.form.markDraft")}</Button>
              <Button className="justify-start" icon="pause" onClick={() => void updatePositionStatus(modalPosition, "suspended")}>{t("admin.positions.form.suspend")}</Button>
              <Button className="justify-start" icon="userX" onClick={() => void updatePositionStatus(modalPosition, "disabled")}>{t("admin.positions.form.disable")}</Button>
              <Button className="justify-start sm:col-span-2" icon="userX" onClick={() => openDeleteModal(modalPosition)} variant="danger">{t("admin.positions.form.deletePosition")}</Button>
            </div>
          </div>
        ) : null}
      </AdminModal>

      <AdminModal
        footer={(
          <>
            <Button disabled={busy} onClick={closeModal}>{t("admin.organizations.form.cancel")}</Button>
            <Button disabled={busy} icon="userX" onClick={() => void handleDeletePosition()} variant="danger">{t("admin.positions.form.deletePosition")}</Button>
          </>
        )}
        onClose={closeModal}
        open={activeModal === "delete"}
        title={t("admin.positions.form.deleteTitle")}
      >
        <div className="space-y-3">
          {formError ? <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm font-medium text-red-700">{formError}</p> : null}
          <p className="text-sm leading-6 text-slate-700">{t("admin.positions.form.deleteDescription")}</p>
          <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm font-bold text-red-800">{modalPosition?.position.title || "-"}</div>
        </div>
      </AdminModal>
    </div>
  );
}
