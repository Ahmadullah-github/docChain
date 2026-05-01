import { useEffect, useMemo, useRef, useState } from "react";
import type { FormEvent, RefObject } from "react";
import { useNavigate } from "react-router-dom";
import { adminApi, ApiError } from "../../api";
import type { AdminAssignment, EntityId, Organization, Person, Position, StructureImportPreview, Unit, UnitType } from "../../api";
import {
  buildAuthorityRows,
  buildDirectoryRows,
  chooseHeadAuthority,
  formatDate,
  getActiveAssignmentsForUnit,
  OrganizationHierarchyExplorer,
  OrganizationStats,
  SelectedUnitDetails,
  StructureRulesReminder,
  UnitsDirectory
} from "../../components/admin/organizations";
import { AdminModal, AdminPageHeader } from "../../components/admin";
import { Button } from "../../components/ui";
import { useI18n } from "../../i18n";
import type { TranslationKey } from "../../i18n";
import { downloadBlob } from "../../lib/downloads";
import { downloadWorkbook } from "../../lib/workbook";

type OrganizationsPageData = {
  assignments: AdminAssignment[];
  organizations: Organization[];
  persons: Person[];
  positions: Position[];
  units: Unit[];
  unitTypes: UnitType[];
};

const emptyData: OrganizationsPageData = {
  assignments: [],
  organizations: [],
  persons: [],
  positions: [],
  units: [],
  unitTypes: []
};

async function safe<T>(promise: Promise<T>, fallback: T) {
  try {
    return await promise;
  } catch {
    return fallback;
  }
}

async function fetchOrganizationsData(): Promise<OrganizationsPageData> {
  const [organizations, unitTypes, units, positions, assignments, persons] = await Promise.all([
    safe(adminApi.organizations.list(), []),
    safe(adminApi.unitTypes.list(), []),
    safe(adminApi.units.list(), []),
    safe(adminApi.positions.list(), []),
    safe(adminApi.assignments.list(), []),
    safe(adminApi.persons.list(), [])
  ]);

  return { assignments, organizations, persons, positions, units, unitTypes };
}

function countUnits(units: Unit[], unitTypeCode: string) {
  return units.filter((unit) => unit.unitTypeCode === unitTypeCode).length;
}

function chooseDefaultUnit(units: Unit[]) {
  return units.find((unit) => unit.unitTypeCode === "faculty") || units[0] || null;
}

type ActiveModal = "organization" | "unit" | "assignHead" | "unitActions" | "import" | null;

const organizationInitialForm = {
  code: "",
  description: "",
  name: "",
  name_local: "",
  status: "active"
};

const unitInitialForm = {
  code: "",
  description: "",
  name: "",
  name_local: "",
  organization_id: "",
  parent_unit_id: "",
  status: "active",
  unit_type_id: ""
};

const assignmentInitialForm = {
  assignment_id: "",
  ends_at: "",
  mode: "existing",
  person_id: "",
  position_id: "",
  starts_at: "",
  status: "active"
};

const labelClassName = "text-sm font-semibold text-slate-700";
const fieldClassName = "mt-1 min-h-10 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 outline-none transition focus:border-[#061d49] focus:ring-4 focus:ring-[#061d49]/10";
const textareaClassName = `${fieldClassName} min-h-24 resize-y`;

function messageForError(error: unknown, defaultMessage: string) {
  if (error instanceof Error) {
    return error.message;
  }
  return defaultMessage;
}

function errorKeyForCode(code: string): TranslationKey | null {
  switch (code) {
    case "validation_failed":
      return "admin.organizations.errors.validationFailed";
    case "invalid_unit_type":
      return "admin.organizations.errors.invalidUnitType";
    case "invalid_parent_unit":
      return "admin.organizations.errors.invalidParentUnit";
    case "parent_disallows_children":
      return "admin.organizations.errors.parentDisallowsChildren";
    case "organization_mismatch":
      return "admin.organizations.errors.organizationMismatch";
    case "missing_file":
      return "admin.organizations.errors.missingFile";
    case "invalid_file_type":
      return "admin.organizations.errors.invalidFileType";
    case "structure_import_invalid":
      return "admin.organizations.errors.structureImportInvalid";
    case "invalid_import_state":
      return "admin.organizations.errors.invalidImportState";
    case "request_failed":
      return "admin.organizations.errors.requestFailed";
    default:
      return null;
  }
}

function isStructureImportPreview(value: unknown): value is StructureImportPreview {
  return Boolean(
    value &&
    typeof value === "object" &&
    "canApply" in value &&
    "summary" in value &&
    "errors" in value
  );
}

export function AdminOrganizationsPage() {
  const { t } = useI18n();
  const navigate = useNavigate();
  const detailsRef = useRef<HTMLDivElement>(null);
  const hierarchyRef = useRef<HTMLDivElement>(null);
  const [data, setData] = useState<OrganizationsPageData>(emptyData);
  const [loading, setLoading] = useState(true);
  const [selectedUnitId, setSelectedUnitId] = useState<EntityId | null>(null);
  const [activeModal, setActiveModal] = useState<ActiveModal>(null);
  const [busy, setBusy] = useState(false);
  const [actionsUnitId, setActionsUnitId] = useState<EntityId | null>(null);
  const [editingUnitId, setEditingUnitId] = useState<EntityId | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importMessage, setImportMessage] = useState<string | null>(null);
  const [importPreview, setImportPreview] = useState<StructureImportPreview | null>(null);
  const [assignmentForm, setAssignmentForm] = useState(assignmentInitialForm);
  const [organizationForm, setOrganizationForm] = useState(organizationInitialForm);
  const [unitForm, setUnitForm] = useState(unitInitialForm);

  useEffect(() => {
    let alive = true;

    async function loadOrganizations() {
      setLoading(true);
      const nextData = await fetchOrganizationsData();

      if (alive) {
        setData(nextData);
        setLoading(false);
      }
    }

    void loadOrganizations();

    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    const selectedStillExists = selectedUnitId ? data.units.some((unit) => unit.id === selectedUnitId) : false;
    if (!selectedStillExists) {
      setSelectedUnitId(chooseDefaultUnit(data.units)?.id || null);
    }
  }, [data.units, selectedUnitId]);

  const positionsById = useMemo(() => new Map(data.positions.map((position) => [position.id, position])), [data.positions]);
  const selectedUnit = data.units.find((unit) => unit.id === selectedUnitId) || null;
  const actionsUnit = data.units.find((unit) => unit.id === actionsUnitId) || null;
  const activeAssignments = selectedUnit ? getActiveAssignmentsForUnit(selectedUnit.id, data.assignments) : [];
  const authorityRows = useMemo(() => buildAuthorityRows(activeAssignments, positionsById), [activeAssignments, positionsById]);
  const headAuthority = chooseHeadAuthority(authorityRows);
  const parentUnitName = selectedUnit?.parentUnitName || t("admin.organizations.details.noParent");
  const headPosition = headAuthority?.positionTitle || t("admin.organizations.details.noHead");

  const directoryRows = useMemo(
    () => buildDirectoryRows(
      data.units,
      data.assignments,
      positionsById,
      t("admin.organizations.details.noParent"),
      t("admin.organizations.details.noHead")
    ),
    [data.assignments, data.units, positionsById, t]
  );

  const stats = {
    activePositions: data.positions.filter((position) => position.status === "active").length,
    departments: countUnits(data.units, "department"),
    faculties: countUnits(data.units, "faculty"),
    officesCommittees: data.units.filter((unit) => unit.unitTypeCode === "office" || unit.unitTypeCode === "committee").length,
    organizations: data.organizations.length,
    viceChancelleries: countUnits(data.units, "vice_chancellery")
  };

  const blockedParentUnitIds = useMemo(() => {
    if (!editingUnitId) {
      return new Set<EntityId>();
    }

    const blocked = new Set<EntityId>([editingUnitId]);
    let changed = true;
    while (changed) {
      changed = false;
      for (const unit of data.units) {
        if (unit.parent_unit_id && blocked.has(unit.parent_unit_id) && !blocked.has(unit.id)) {
          blocked.add(unit.id);
          changed = true;
        }
      }
    }

    return blocked;
  }, [data.units, editingUnitId]);

  const unitParentOptions = data.units.filter((unit) => (
    String(unit.organization_id) === unitForm.organization_id &&
    unit.status === "active" &&
    !blockedParentUnitIds.has(unit.id)
  ));

  function formErrorMessage(error: unknown) {
    if (error instanceof ApiError) {
      const key = errorKeyForCode(error.code);
      return key ? t(key) : t("admin.organizations.errors.generic");
    }
    return messageForError(error, t("admin.organizations.errors.generic"));
  }

  async function refreshOrganizations(selectUnitId?: EntityId) {
    const nextData = await fetchOrganizationsData();
    setData(nextData);
    if (selectUnitId) {
      setSelectedUnitId(selectUnitId);
    }
  }

  function closeModal() {
    if (busy) {
      return;
    }
    setActiveModal(null);
    setActionsUnitId(null);
    setEditingUnitId(null);
    setAssignmentForm(assignmentInitialForm);
    setFormError(null);
    setImportFile(null);
    setImportMessage(null);
    setImportPreview(null);
  }

  function openOrganizationModal() {
    setOrganizationForm(organizationInitialForm);
    setFormError(null);
    setActiveModal("organization");
  }

  function scrollToRef(ref: RefObject<HTMLDivElement | null>) {
    window.requestAnimationFrame(() => {
      ref.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }

  function selectUnit(unitId: EntityId, target: "details" | "hierarchy" = "details") {
    setSelectedUnitId(unitId);
    scrollToRef(target === "hierarchy" ? hierarchyRef : detailsRef);
  }

  function chooseChildUnitTypeId(parentUnit: Unit | null) {
    const activeUnitTypes = data.unitTypes.filter((unitType) => unitType.status === "active");
    if (!parentUnit) {
      return String(activeUnitTypes[0]?.id || data.unitTypes[0]?.id || "");
    }

    const parentType = data.unitTypes.find((unitType) => unitType.id === parentUnit.unit_type_id) || null;
    const childType = activeUnitTypes
      .filter((unitType) => !parentType || unitType.hierarchy_level > parentType.hierarchy_level)
      .sort((left, right) => left.hierarchy_level - right.hierarchy_level)[0];

    return String(childType?.id || activeUnitTypes.find((unitType) => unitType.id !== parentUnit.unit_type_id)?.id || activeUnitTypes[0]?.id || "");
  }

  function openCreateUnitModal(parentUnit: Unit | null = null) {
    setUnitForm({
      ...unitInitialForm,
      organization_id: String(parentUnit?.organization_id || selectedUnit?.organization_id || data.organizations[0]?.id || ""),
      parent_unit_id: parentUnit ? String(parentUnit.id) : "",
      unit_type_id: chooseChildUnitTypeId(parentUnit)
    });
    setEditingUnitId(null);
    setFormError(null);
    setActiveModal("unit");
  }

  function openEditUnitModal(unitId: EntityId) {
    const unit = data.units.find((item) => item.id === unitId);
    if (!unit) {
      return;
    }

    setSelectedUnitId(unit.id);
    setUnitForm({
      code: unit.code || "",
      description: unit.description || "",
      name: unit.name || "",
      name_local: unit.name_local || "",
      organization_id: String(unit.organization_id || ""),
      parent_unit_id: unit.parent_unit_id ? String(unit.parent_unit_id) : "",
      status: unit.status || "active",
      unit_type_id: String(unit.unit_type_id || "")
    });
    setEditingUnitId(unit.id);
    setFormError(null);
    setActiveModal("unit");
  }

  function openAddChildUnitModal(unitId: EntityId) {
    const unit = data.units.find((item) => item.id === unitId);
    if (!unit) {
      return;
    }

    setSelectedUnitId(unit.id);
    openCreateUnitModal(unit);
  }

  function openUnitActionsModal(unitId: EntityId) {
    const unit = data.units.find((item) => item.id === unitId);
    if (!unit) {
      return;
    }

    setActionsUnitId(unit.id);
    setSelectedUnitId(unit.id);
    setFormError(null);
    setActiveModal("unitActions");
  }

  function runActionsUnit(action: (unitId: EntityId) => void) {
    if (!actionsUnit) {
      return;
    }

    const unitId = actionsUnit.id;
    setActionsUnitId(null);
    action(unitId);
  }

  function assignmentOptionLabel(assignment: AdminAssignment) {
    const position = positionsById.get(assignment.position_id);
    const title = position?.title || assignment.positionTitle || "-";
    const person = assignment.personDisplayName || "-";
    return `${title} - ${person}`;
  }

  function openAssignHeadModal(unitId: EntityId) {
    const unit = data.units.find((item) => item.id === unitId);
    if (!unit) {
      return;
    }

    const unitAssignments = getActiveAssignmentsForUnit(unit.id, data.assignments);
    const currentHead = chooseHeadAuthority(buildAuthorityRows(unitAssignments, positionsById));
    setSelectedUnitId(unit.id);
    setAssignmentForm({
      ...assignmentInitialForm,
      assignment_id: String(currentHead?.assignment.id || unitAssignments[0]?.id || ""),
      mode: unitAssignments.length ? "existing" : "new",
      person_id: String(currentHead?.assignment.person_id || data.persons[0]?.id || ""),
      position_id: String(currentHead?.assignment.position_id || data.positions[0]?.id || "")
    });
    setFormError(null);
    setActiveModal("assignHead");
  }

  function openRulesForUnit(unitId: EntityId) {
    const unit = data.units.find((item) => item.id === unitId);
    if (!unit) {
      return;
    }

    navigate(`/admin/workflow-rules?originUnitTypeId=${unit.unit_type_id}`);
  }

  function openImportModal() {
    setFormError(null);
    setImportFile(null);
    setImportMessage(null);
    setImportPreview(null);
    setActiveModal("import");
  }

  async function handleCreateOrganization(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setFormError(null);
    try {
      await adminApi.organizations.create({
        code: organizationForm.code.trim(),
        description: organizationForm.description.trim() || null,
        name: organizationForm.name.trim(),
        name_local: organizationForm.name_local.trim() || null,
        status: organizationForm.status
      });
      await refreshOrganizations();
      closeModal();
    } catch (error) {
      setFormError(formErrorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  async function handleSubmitUnit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setFormError(null);
    try {
      const unitInput = {
        code: unitForm.code.trim(),
        description: unitForm.description.trim() || null,
        name: unitForm.name.trim(),
        name_local: unitForm.name_local.trim() || null,
        organization_id: Number(unitForm.organization_id),
        parent_unit_id: unitForm.parent_unit_id ? Number(unitForm.parent_unit_id) : null,
        status: unitForm.status,
        unit_type_id: Number(unitForm.unit_type_id)
      };

      if (editingUnitId) {
        await adminApi.units.update(editingUnitId, unitInput);
        await refreshOrganizations(editingUnitId);
      } else {
        const createdUnit = await adminApi.units.create(unitInput);
        await refreshOrganizations(createdUnit.id);
      }

      closeModal();
    } catch (error) {
      setFormError(formErrorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  async function handleAssignHead(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!selectedUnit) {
      return;
    }

    if (assignmentForm.mode === "existing" && !assignmentForm.assignment_id) {
      setFormError(t("admin.organizations.assignHead.chooseAssignmentError"));
      return;
    }

    if (assignmentForm.mode === "new" && (!assignmentForm.person_id || !assignmentForm.position_id)) {
      setFormError(t("admin.organizations.assignHead.choosePersonPositionError"));
      return;
    }

    setBusy(true);
    setFormError(null);
    try {
      const activeUnitAssignments = getActiveAssignmentsForUnit(selectedUnit.id, data.assignments);
      const selectedAssignmentId = assignmentForm.mode === "existing" ? Number(assignmentForm.assignment_id) : null;
      const previousHeads = activeUnitAssignments.filter((assignment) => assignment.is_primary && assignment.id !== selectedAssignmentId);

      await Promise.all(previousHeads.map((assignment) => adminApi.assignments.update(assignment.id, {
        is_primary: false,
        reason: "Unit head changed."
      })));

      if (assignmentForm.mode === "existing" && selectedAssignmentId) {
        await adminApi.assignments.update(selectedAssignmentId, {
          is_primary: true,
          reason: "Assigned as unit head.",
          status: "active",
          unit_id: selectedUnit.id
        });
      } else {
        await adminApi.assignments.create({
          ends_at: assignmentForm.ends_at || null,
          is_primary: true,
          person_id: Number(assignmentForm.person_id),
          position_id: Number(assignmentForm.position_id),
          starts_at: assignmentForm.starts_at || null,
          status: assignmentForm.status,
          unit_id: selectedUnit.id
        });
      }

      await refreshOrganizations(selectedUnit.id);
      closeModal();
    } catch (error) {
      setFormError(formErrorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  async function downloadStructureTemplate() {
    setBusy(true);
    setFormError(null);
    try {
      const response = await adminApi.structure.template();
      downloadBlob(response.blob, response.filename || "docchain-structure-template.xlsx");
    } catch (error) {
      setFormError(formErrorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  async function downloadFullStructureExport() {
    setBusy(true);
    setFormError(null);
    try {
      const response = await adminApi.structure.export();
      downloadBlob(response.blob, response.filename || "docchain-structure-export.xlsx");
    } catch (error) {
      setFormError(formErrorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  async function previewImport() {
    if (!importFile) {
      setFormError(t("admin.organizations.errors.chooseWorkbook"));
      return;
    }
    setBusy(true);
    setFormError(null);
    setImportMessage(null);
    try {
      setImportPreview(await adminApi.structure.previewImport(importFile));
    } catch (error) {
      setFormError(formErrorMessage(error));
      if (error instanceof ApiError && isStructureImportPreview(error.details)) {
        setImportPreview(error.details);
      }
    } finally {
      setBusy(false);
    }
  }

  async function applyImport() {
    if (!importFile || !importPreview?.canApply) {
      return;
    }
    setBusy(true);
    setFormError(null);
    setImportMessage(null);
    try {
      const result = await adminApi.structure.applyImport(importFile);
      setImportPreview(result);
      setImportMessage(t("admin.organizations.import.success"));
      await refreshOrganizations();
    } catch (error) {
      setFormError(formErrorMessage(error));
      if (error instanceof ApiError && isStructureImportPreview(error.details)) {
        setImportPreview(error.details);
      }
    } finally {
      setBusy(false);
    }
  }

  async function exportFilteredUnits(rows: typeof directoryRows) {
    const exportColumns = {
      code: t("admin.organizations.directory.exportColumns.code"),
      headPosition: t("admin.organizations.directory.exportColumns.headPosition"),
      localName: t("admin.organizations.directory.exportColumns.localName"),
      name: t("admin.organizations.directory.exportColumns.name"),
      parentUnit: t("admin.organizations.directory.exportColumns.parentUnit"),
      status: t("admin.organizations.directory.exportColumns.status"),
      type: t("admin.organizations.directory.exportColumns.type"),
      users: t("admin.organizations.directory.exportColumns.users")
    };

    await downloadWorkbook("docchain-units-directory.xlsx", [
      {
        name: "units",
        rows: rows.map((row) => ({
          [exportColumns.code]: row.code,
          [exportColumns.headPosition]: row.headPosition,
          [exportColumns.name]: row.name,
          [exportColumns.localName]: row.nameLocal || "",
          [exportColumns.parentUnit]: row.parentUnitName,
          [exportColumns.status]: row.status,
          [exportColumns.type]: row.typeName,
          [exportColumns.users]: row.userCount
        }))
      }
    ]);
  }

  function sheetLabel(sheet: StructureImportPreview["operations"][number]["sheet"]) {
    switch (sheet) {
      case "organizations":
        return t("admin.organizations.import.sheet.organizations");
      case "unit_types":
        return t("admin.organizations.import.sheet.unitTypes");
      case "units":
        return t("admin.organizations.import.sheet.units");
      default:
        return sheet;
    }
  }

  function operationLabel(operation: StructureImportPreview["operations"][number]["operation"]) {
    switch (operation) {
      case "create":
        return t("admin.organizations.import.operation.create");
      case "update":
        return t("admin.organizations.import.operation.update");
      case "unchanged":
        return t("admin.organizations.import.operation.unchanged");
      default:
        return operation;
    }
  }

  return (
    <div className="min-w-0 space-y-4">
      <AdminPageHeader
        actions={(
          <>
            <Button icon="plus" onClick={openOrganizationModal} variant="primary">{t("admin.organizations.actions.newOrganization")}</Button>
            <Button icon="plus" onClick={() => openCreateUnitModal()}>{t("admin.organizations.actions.newUnit")}</Button>
            <Button icon="upload" onClick={openImportModal}>{t("admin.organizations.actions.importStructure")}</Button>
          </> 
        )}
        description={t("admin.organizations.description")}
        title={t("admin.organizations.title")}
      />

      <OrganizationStats
        labels={{
          activePositions: t("admin.organizations.stats.activePositions"),
          departments: t("admin.organizations.stats.departments"),
          faculties: t("admin.organizations.stats.faculties"),
          officesCommittees: t("admin.organizations.stats.officesCommittees"),
          organizations: t("admin.organizations.stats.organizations"),
          viceChancelleries: t("admin.organizations.stats.viceChancelleries")
        }}
        loading={loading}
        stats={stats}
      />

      <section className="grid min-w-0 gap-4 xl:grid-cols-[minmax(0,.85fr)_minmax(0,1.35fr)]">
        <div className="min-w-0" ref={hierarchyRef}>
          <OrganizationHierarchyExplorer
            onSelectUnit={(unitId) => selectUnit(unitId)}
            selectedUnitId={selectedUnitId}
            units={data.units}
          />
        </div>
        <div className="min-w-0" ref={detailsRef}>
          <SelectedUnitDetails
            authorityRows={authorityRows}
            createdLabel={formatDate(selectedUnit?.created_at)}
            headPosition={headPosition}
            onAddChildUnit={() => selectedUnit && openAddChildUnitModal(selectedUnit.id)}
            onAssignHead={() => selectedUnit && openAssignHeadModal(selectedUnit.id)}
            onEditUnit={() => selectedUnit && openEditUnitModal(selectedUnit.id)}
            onViewRules={() => selectedUnit && openRulesForUnit(selectedUnit.id)}
            parentUnitName={parentUnitName}
            selectedUnit={selectedUnit}
          />
        </div>
      </section>

      <section className="min-w-0 space-y-4">
        <UnitsDirectory
          onEditUnit={openEditUnitModal}
          onExportRows={(rows) => void exportFilteredUnits(rows)}
          onOpenActions={openUnitActionsModal}
          onSelectUnit={(unitId) => selectUnit(unitId)}
          onViewHierarchy={(unitId) => selectUnit(unitId, "hierarchy")}
          rows={directoryRows}
          unitTypes={data.unitTypes.map((unitType) => ({ code: unitType.code, id: unitType.id, name: unitType.name }))}
        />
        <div className="grid min-w-0 gap-4 lg:grid-cols-2 xl:grid-cols-3">
          <StructureRulesReminder />
        </div>
      </section>

      <AdminModal
        footer={(
          <>
            <Button disabled={busy} onClick={closeModal}>{t("admin.organizations.form.cancel")}</Button>
            <Button disabled={busy} form="organization-create-form" icon="plus" type="submit" variant="primary">{t("admin.organizations.form.createOrganization")}</Button>
          </>
        )}
        onClose={closeModal}
        open={activeModal === "organization"}
        title={t("admin.organizations.actions.newOrganization")}
      >
        <form className="grid gap-4 md:grid-cols-2" id="organization-create-form" onSubmit={handleCreateOrganization}>
          {formError ? <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm font-medium text-red-700 md:col-span-2">{formError}</p> : null}
          <label className={labelClassName}>
            {t("admin.organizations.form.code")}
            <input className={fieldClassName} onChange={(event) => setOrganizationForm((form) => ({ ...form, code: event.target.value }))} required value={organizationForm.code} />
          </label>
          <label className={labelClassName}>
            {t("admin.organizations.form.status")}
            <select className={fieldClassName} onChange={(event) => setOrganizationForm((form) => ({ ...form, status: event.target.value }))} value={organizationForm.status}>
              <option value="active">{t("admin.organizations.form.active")}</option>
              <option value="inactive">{t("admin.organizations.form.inactive")}</option>
            </select>
          </label>
          <label className={labelClassName}>
            {t("admin.organizations.form.name")}
            <input className={fieldClassName} onChange={(event) => setOrganizationForm((form) => ({ ...form, name: event.target.value }))} required value={organizationForm.name} />
          </label>
          <label className={labelClassName}>
            {t("admin.organizations.form.localName")}
            <input className={fieldClassName} onChange={(event) => setOrganizationForm((form) => ({ ...form, name_local: event.target.value }))} value={organizationForm.name_local} />
          </label>
          <label className={`${labelClassName} md:col-span-2`}>
            {t("admin.organizations.form.description")}
            <textarea className={textareaClassName} onChange={(event) => setOrganizationForm((form) => ({ ...form, description: event.target.value }))} value={organizationForm.description} />
          </label>
        </form>
      </AdminModal>

      <AdminModal
        footer={<Button disabled={busy} onClick={closeModal}>{t("admin.organizations.form.close")}</Button>}
        onClose={closeModal}
        open={activeModal === "unitActions"}
        title={t("admin.organizations.directory.more")}
      >
        <div className="space-y-3">
          <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
            <p className="truncate text-sm font-bold text-[#061d49]">{actionsUnit?.name || "-"}</p>
            <p className="force-ltr mt-1 text-xs font-semibold text-slate-500">{actionsUnit?.code || ""}</p>
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            <Button className="justify-start" icon="view" onClick={() => runActionsUnit((unitId) => {
              setActiveModal(null);
              selectUnit(unitId);
            })}>{t("admin.organizations.directory.view")}</Button>
            <Button className="justify-start" icon="edit" onClick={() => runActionsUnit(openEditUnitModal)}>{t("admin.organizations.details.edit")}</Button>
            <Button className="justify-start" icon="users" onClick={() => runActionsUnit(openAssignHeadModal)}>{t("admin.organizations.details.assignHead")}</Button>
            <Button className="justify-start" icon="hierarchy" onClick={() => runActionsUnit(openAddChildUnitModal)}>{t("admin.organizations.details.addChildUnit")}</Button>
            <Button className="justify-start sm:col-span-2" icon="shield" onClick={() => runActionsUnit(openRulesForUnit)}>{t("admin.organizations.details.viewRules")}</Button>
          </div>
        </div>
      </AdminModal>

      <AdminModal
        footer={(
          <>
            <Button disabled={busy} onClick={closeModal}>{t("admin.organizations.form.cancel")}</Button>
            <Button disabled={busy} form="unit-form" icon={editingUnitId ? "edit" : "plus"} type="submit" variant="primary">
              {editingUnitId ? t("admin.organizations.form.saveUnit") : t("admin.organizations.form.createUnit")}
            </Button>
          </>
        )}
        onClose={closeModal}
        open={activeModal === "unit"}
        title={editingUnitId ? t("admin.organizations.form.editUnitTitle") : t("admin.organizations.actions.newUnit")}
      >
        <form className="grid gap-4 md:grid-cols-2" id="unit-form" onSubmit={handleSubmitUnit}>
          {formError ? <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm font-medium text-red-700 md:col-span-2">{formError}</p> : null}
          <label className={labelClassName}>
            {t("admin.organizations.form.organization")}
            <select
              className={fieldClassName}
              onChange={(event) => setUnitForm((form) => ({ ...form, organization_id: event.target.value, parent_unit_id: "" }))}
              required
              value={unitForm.organization_id}
            >
              <option value="" disabled>{t("admin.organizations.form.selectOrganization")}</option>
              {data.organizations.map((organization) => (
                <option key={organization.id} value={organization.id}>{organization.name}</option>
              ))}
            </select>
          </label>
          <label className={labelClassName}>
            {t("admin.organizations.form.unitType")}
            <select className={fieldClassName} onChange={(event) => setUnitForm((form) => ({ ...form, unit_type_id: event.target.value }))} required value={unitForm.unit_type_id}>
              <option value="" disabled>{t("admin.organizations.form.selectUnitType")}</option>
              {data.unitTypes.map((unitType) => (
                <option key={unitType.id} value={unitType.id}>{unitType.name}</option>
              ))}
            </select>
          </label>
          <label className={labelClassName}>
            {t("admin.organizations.form.parentUnit")}
            <select className={fieldClassName} onChange={(event) => setUnitForm((form) => ({ ...form, parent_unit_id: event.target.value }))} value={unitForm.parent_unit_id}>
              <option value="">{t("admin.organizations.details.noParent")}</option>
              {unitParentOptions.map((unit) => (
                <option key={unit.id} value={unit.id}>{unit.name}</option>
              ))}
            </select>
          </label>
          <label className={labelClassName}>
            {t("admin.organizations.form.status")}
            <select className={fieldClassName} onChange={(event) => setUnitForm((form) => ({ ...form, status: event.target.value }))} value={unitForm.status}>
              <option value="active">{t("admin.organizations.form.active")}</option>
              <option value="inactive">{t("admin.organizations.form.inactive")}</option>
            </select>
          </label>
          <label className={labelClassName}>
            {t("admin.organizations.form.code")}
            <input className={fieldClassName} onChange={(event) => setUnitForm((form) => ({ ...form, code: event.target.value }))} required value={unitForm.code} />
          </label>
          <label className={labelClassName}>
            {t("admin.organizations.form.name")}
            <input className={fieldClassName} onChange={(event) => setUnitForm((form) => ({ ...form, name: event.target.value }))} required value={unitForm.name} />
          </label>
          <label className={labelClassName}>
            {t("admin.organizations.form.localName")}
            <input className={fieldClassName} onChange={(event) => setUnitForm((form) => ({ ...form, name_local: event.target.value }))} value={unitForm.name_local} />
          </label>
          <label className={`${labelClassName} md:col-span-2`}>
            {t("admin.organizations.form.description")}
            <textarea className={textareaClassName} onChange={(event) => setUnitForm((form) => ({ ...form, description: event.target.value }))} value={unitForm.description} />
          </label>
        </form>
      </AdminModal>

      <AdminModal
        footer={(
          <>
            <Button disabled={busy} onClick={closeModal}>{t("admin.organizations.form.cancel")}</Button>
            <Button disabled={busy} form="unit-head-form" icon="users" type="submit" variant="primary">{t("admin.organizations.assignHead.save")}</Button>
          </>
        )}
        onClose={closeModal}
        open={activeModal === "assignHead"}
        title={t("admin.organizations.assignHead.title")}
      >
        <form className="grid gap-4 md:grid-cols-2" id="unit-head-form" onSubmit={handleAssignHead}>
          {formError ? <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm font-medium text-red-700 md:col-span-2">{formError}</p> : null}
          <label className={labelClassName}>
            {t("admin.organizations.assignHead.unit")}
            <input className={fieldClassName} disabled readOnly value={selectedUnit?.name || ""} />
          </label>
          <label className={labelClassName}>
            {t("admin.organizations.assignHead.mode")}
            <select
              className={fieldClassName}
              onChange={(event) => setAssignmentForm((form) => ({ ...form, assignment_id: "", mode: event.target.value }))}
              value={assignmentForm.mode}
            >
              <option disabled={!activeAssignments.length} value="existing">{t("admin.organizations.assignHead.existingAssignment")}</option>
              <option value="new">{t("admin.organizations.assignHead.newAssignment")}</option>
            </select>
          </label>

          {assignmentForm.mode === "existing" ? (
            <label className={`${labelClassName} md:col-span-2`}>
              {t("admin.organizations.assignHead.assignment")}
              <select
                className={fieldClassName}
                disabled={!activeAssignments.length}
                onChange={(event) => setAssignmentForm((form) => ({ ...form, assignment_id: event.target.value }))}
                required
                value={assignmentForm.assignment_id}
              >
                <option value="" disabled>{t("admin.organizations.assignHead.selectAssignment")}</option>
                {activeAssignments.map((assignment) => (
                  <option key={assignment.id} value={assignment.id}>{assignmentOptionLabel(assignment)}</option>
                ))}
              </select>
            </label>
          ) : (
            <>
              <label className={labelClassName}>
                {t("admin.organizations.assignHead.person")}
                <select
                  className={fieldClassName}
                  onChange={(event) => setAssignmentForm((form) => ({ ...form, person_id: event.target.value }))}
                  required
                  value={assignmentForm.person_id}
                >
                  <option value="" disabled>{t("admin.organizations.assignHead.selectPerson")}</option>
                  {data.persons.map((person) => (
                    <option key={person.id} value={person.id}>{person.display_name}</option>
                  ))}
                </select>
              </label>
              <label className={labelClassName}>
                {t("admin.organizations.assignHead.position")}
                <select
                  className={fieldClassName}
                  onChange={(event) => setAssignmentForm((form) => ({ ...form, position_id: event.target.value }))}
                  required
                  value={assignmentForm.position_id}
                >
                  <option value="" disabled>{t("admin.organizations.assignHead.selectPosition")}</option>
                  {data.positions.map((position) => (
                    <option key={position.id} value={position.id}>{position.title}</option>
                  ))}
                </select>
              </label>
              <label className={labelClassName}>
                {t("admin.organizations.form.status")}
                <select className={fieldClassName} onChange={(event) => setAssignmentForm((form) => ({ ...form, status: event.target.value }))} value={assignmentForm.status}>
                  <option value="active">{t("admin.organizations.form.active")}</option>
                  <option value="inactive">{t("admin.organizations.form.inactive")}</option>
                </select>
              </label>
              <label className={labelClassName}>
                {t("admin.organizations.assignHead.startDate")}
                <input className={fieldClassName} onChange={(event) => setAssignmentForm((form) => ({ ...form, starts_at: event.target.value }))} type="date" value={assignmentForm.starts_at} />
              </label>
              <label className={labelClassName}>
                {t("admin.organizations.assignHead.endDate")}
                <input className={fieldClassName} onChange={(event) => setAssignmentForm((form) => ({ ...form, ends_at: event.target.value }))} type="date" value={assignmentForm.ends_at} />
              </label>
            </>
          )}
        </form>
      </AdminModal>

      <AdminModal
        description={t("admin.organizations.import.description")}
        footer={(
          <>
            <Button disabled={busy} onClick={closeModal}>{t("admin.organizations.form.close")}</Button>
            <Button disabled={busy || !importFile} onClick={() => void previewImport()}>{t("admin.organizations.import.preview")}</Button>
            <Button disabled={busy || !importFile || !importPreview?.canApply} onClick={() => void applyImport()} variant="primary">{t("admin.organizations.import.apply")}</Button>
          </>
        )}
        onClose={closeModal}
        open={activeModal === "import"}
        size="lg"
        title={t("admin.organizations.actions.importStructure")}
      >
        <div className="space-y-4">
          {formError ? <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm font-medium text-red-700">{formError}</p> : null}
          {importMessage ? <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-medium text-emerald-700">{importMessage}</p> : null}
          <div className="flex flex-wrap gap-2">
            <Button disabled={busy} icon="export" onClick={() => void downloadStructureTemplate()}>{t("admin.organizations.import.downloadTemplate")}</Button>
            <Button disabled={busy} icon="export" onClick={() => void downloadFullStructureExport()}>{t("admin.organizations.import.exportCurrentStructure")}</Button>
          </div>
          <label className={labelClassName}>
            {t("admin.organizations.import.excelWorkbook")}
            <input
              accept=".xlsx,.xlsm"
              className="mt-1 block w-full rounded-lg border border-dashed border-slate-300 bg-slate-50 px-3 py-3 text-sm text-slate-700 file:me-3 file:rounded-md file:border-0 file:bg-white file:px-3 file:py-1.5 file:text-sm file:font-semibold file:text-[#061d49]"
              disabled={busy}
              onChange={(event) => {
                setImportFile(event.target.files?.[0] || null);
                setImportPreview(null);
                setImportMessage(null);
                setFormError(null);
              }}
              type="file"
            />
          </label>
          {importPreview ? (
            <div className="space-y-4">
              <div className="grid gap-3 md:grid-cols-3">
                <ImportSummaryCard label={t("admin.organizations.import.summary.organizations")} section={importPreview.summary.organizations} />
                <ImportSummaryCard label={t("admin.organizations.import.summary.unitTypes")} section={importPreview.summary.unitTypes} />
                <ImportSummaryCard label={t("admin.organizations.import.summary.units")} section={importPreview.summary.units} />
              </div>
              {importPreview.errors.length ? (
                <div className="rounded-lg border border-red-200 bg-red-50 p-3">
                  <h3 className="text-sm font-bold text-red-800">{t("admin.organizations.import.errorsTitle")}</h3>
                  <ul className="mt-2 space-y-1 text-sm text-red-700">
                    {importPreview.errors.slice(0, 8).map((error) => (
                      <li key={`${error.sheet}-${error.row}-${error.code}`}>
                        {t("admin.organizations.import.errorItem", { message: error.message, row: error.row, sheet: sheetLabel(error.sheet) })}
                      </li>
                    ))}
                  </ul>
                  {importPreview.errors.length > 8 ? <p className="mt-2 text-xs font-semibold text-red-700">{t("admin.organizations.import.errorsShown", { count: importPreview.errors.length })}</p> : null}
                </div>
              ) : null}
              {importPreview.operations.length ? (
                <div className="rounded-lg border border-slate-200">
                  <div className="border-b border-slate-200 px-3 py-2 text-sm font-bold text-slate-900">{t("admin.organizations.import.previewTitle")}</div>
                  <div className="max-h-56 overflow-y-auto">
                    <table className="w-full min-w-[560px] text-left text-sm">
                      <thead className="bg-slate-50 text-xs uppercase text-slate-500">
                        <tr>
                          <th className="px-3 py-2">{t("admin.organizations.import.columns.sheet")}</th>
                          <th className="px-3 py-2">{t("admin.organizations.import.columns.row")}</th>
                          <th className="px-3 py-2">{t("admin.organizations.import.columns.operation")}</th>
                          <th className="px-3 py-2">{t("admin.organizations.import.columns.code")}</th>
                          <th className="px-3 py-2">{t("admin.organizations.import.columns.name")}</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {importPreview.operations.slice(0, 12).map((operation) => (
                          <tr key={`${operation.sheet}-${operation.row}`}>
                            <td className="px-3 py-2">{sheetLabel(operation.sheet)}</td>
                            <td className="px-3 py-2">{operation.row}</td>
                            <td className="px-3 py-2 font-semibold">{operationLabel(operation.operation)}</td>
                            <td className="px-3 py-2">{operation.code}</td>
                            <td className="px-3 py-2">{operation.label}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  {importPreview.operations.length > 12 ? <p className="border-t border-slate-200 px-3 py-2 text-xs font-semibold text-slate-500">{t("admin.organizations.import.previewShown", { count: importPreview.operations.length })}</p> : null}
                </div>
              ) : null}
            </div>
          ) : null}
        </div>
      </AdminModal>
    </div>
  );
}

function ImportSummaryCard({ label, section }: { label: string; section: StructureImportPreview["summary"]["organizations"] }) {
  const { t } = useI18n();

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-3">
      <h3 className="text-sm font-bold text-slate-950">{label}</h3>
      <dl className="mt-2 grid grid-cols-3 gap-2 text-center text-xs text-slate-600">
        <div>
          <dt>{t("admin.organizations.import.summary.create")}</dt>
          <dd className="mt-1 text-base font-bold text-slate-950">{section.create}</dd>
        </div>
        <div>
          <dt>{t("admin.organizations.import.summary.update")}</dt>
          <dd className="mt-1 text-base font-bold text-slate-950">{section.update}</dd>
        </div>
        <div>
          <dt>{t("admin.organizations.import.summary.same")}</dt>
          <dd className="mt-1 text-base font-bold text-slate-950">{section.unchanged}</dd>
        </div>
      </dl>
    </div>
  );
}
