import { useCallback, useEffect, useMemo, useState } from "react";
import type { FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { adminApi, documentApi, signatureApi, templateApi } from "../../api";
import type { DocumentListItem, DocumentTemplateBinding, DocumentType, DocumentWriteMode, DocumentWriteRule, EntityId, JsonRecord, Position, Role, UnitType } from "../../api";
import { useAuth } from "../../app/AuthContext";
import { AdminModal, AdminPageHeader } from "../../components/admin";
import { buildDocumentTypeRows } from "../../components/admin/document-types";
import type { DocumentTypePageData } from "../../components/admin/document-types";
import { Button, Icon, MetricCard, PanelCard, SearchInput, SelectFilter, StatusBadge, Toolbar } from "../../components/ui";
import { useI18n } from "../../i18n";
import { cx } from "../../lib/classNames";

const emptyData: DocumentTypePageData = {
  documentTypes: [],
  documents: [],
  serialRules: [],
  templateBindings: []
};

async function safe<T>(promise: Promise<T>, fallback: T) {
  try {
    return await promise;
  } catch {
    return fallback;
  }
}

function chooseDefaultType(rows: ReturnType<typeof buildDocumentTypeRows>) {
  return rows.find((row) => row.status === "active" && row.warningIssues.length === 0)
    || rows.find((row) => row.status === "active")
    || rows[0]
    || null;
}

type DocumentTypeRow = ReturnType<typeof buildDocumentTypeRows>[number];
type ActiveModal = "actions" | "create" | "delete" | "edit" | null;
type TFunction = ReturnType<typeof useI18n>["t"];

type DocumentTypeForm = {
  code: string;
  create_first_write_rule: boolean;
  description: string;
  first_rule_mode: DocumentWriteMode;
  first_rule_notes: string;
  first_rule_position_id: string;
  first_rule_role_id: string;
  first_rule_unit_type_id: string;
  name: string;
  status: string;
};

type WriteRuleFormState = {
  mode: DocumentWriteMode;
  notes: string;
  position_id: string;
  role_id: string;
  unit_type_id: string;
};

const labelClassName = "text-sm font-semibold text-slate-700";
const fieldClassName = "mt-1 block min-h-10 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-800 shadow-sm shadow-slate-900/5 outline-none transition focus:border-[#061d49] focus:ring-4 focus:ring-[#061d49]/10 disabled:bg-slate-50 disabled:text-slate-500";
const checkboxClassName = "h-4 w-4 rounded border-slate-300 text-[#061d49] focus:ring-[#061d49]/20";
const documentTypeStatuses = ["active", "draft", "inactive", "archived"];

function documentTypeFormDefaults(): DocumentTypeForm {
  return {
    code: "",
    create_first_write_rule: true,
    description: "",
    first_rule_mode: "locked",
    first_rule_notes: "",
    first_rule_position_id: "",
    first_rule_role_id: "",
    first_rule_unit_type_id: "",
    name: "",
    status: "active"
  };
}

function documentTypeFormFor(row: DocumentTypeRow): DocumentTypeForm {
  return {
    ...documentTypeFormDefaults(),
    code: row.type.code,
    description: row.type.description || "",
    name: row.type.name,
    status: row.type.status || "draft"
  };
}

function clonedDocumentTypeFormFor(row: DocumentTypeRow): DocumentTypeForm {
  return {
    ...documentTypeFormFor(row),
    code: `${row.type.code}_COPY`.slice(0, 80),
    name: `${row.type.name} Copy`,
    status: "draft"
  };
}

function writeRuleFormDefaults(rule?: DocumentWriteRule | null): WriteRuleFormState {
  return {
    mode: rule?.mode || "locked",
    notes: rule?.notes || "",
    position_id: rule?.position_id ? String(rule.position_id) : "",
    role_id: rule?.role_id ? String(rule.role_id) : "",
    unit_type_id: rule?.unit_type_id ? String(rule.unit_type_id) : ""
  };
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Request failed.";
}

function roleLabel(role: Role) {
  return role.displayName || role.display_name || role.name;
}

function normalizedSearch(value: string) {
  return value.trim().toLowerCase();
}

function rowMatchesSearch(row: DocumentTypeRow, search: string) {
  if (!search) {
    return true;
  }

  return [row.name, row.code, row.description, row.status].some((value) => value.toLowerCase().includes(search));
}

function writeRuleAudienceLabel(rule: DocumentWriteRule, t: TFunction) {
  const parts = [
    rule.unitTypeName ? `${t("admin.documentTypes.writeRules.unitType")}: ${rule.unitTypeName}` : "",
    rule.positionTitle ? `${t("admin.documentTypes.writeRules.position")}: ${rule.positionTitle}` : "",
    rule.roleDisplayName || rule.roleName ? `${t("admin.documentTypes.writeRules.role")}: ${rule.roleDisplayName || rule.roleName}` : ""
  ].filter(Boolean);

  return parts.length ? parts.join(" / ") : t("admin.documentTypes.writeRules.everyone");
}

function hasActiveWriteRule(typeId: EntityId, writeRules: DocumentWriteRule[]) {
  return writeRules.some((rule) => Number(rule.document_type_id) === Number(typeId) && rule.status === "active");
}

function isReady(row: DocumentTypeRow) {
  return row.checks.activeType
    && row.checks.templateReady
    && row.checks.serialReady;
}

function ModeSegment({
  disabled,
  onChange,
  value
}: {
  disabled?: boolean;
  onChange: (mode: DocumentWriteMode) => void;
  value: DocumentWriteMode;
}) {
  const { t } = useI18n();

  return (
    <div className="mt-1 grid grid-cols-2 rounded-lg border border-slate-200 bg-slate-50 p-1">
      {(["locked", "free"] as DocumentWriteMode[]).map((mode) => (
        <button
          aria-pressed={value === mode}
          className={cx(
            "min-h-9 rounded-md px-3 text-sm font-bold transition focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#061d49]/15 disabled:cursor-not-allowed disabled:opacity-60",
            value === mode ? "bg-[#061d49] text-white shadow-sm" : "text-slate-600 hover:bg-white"
          )}
          disabled={disabled}
          key={mode}
          onClick={() => onChange(mode)}
          type="button"
        >
          {mode === "locked" ? t("admin.documentTypes.writeRules.locked") : t("admin.documentTypes.writeRules.free")}
        </button>
      ))}
    </div>
  );
}

function DocumentTypeDirectoryPanel({
  onEditType,
  onOpenTypeActions,
  onSelectType,
  rows,
  selectedTypeId,
  writeRules
}: {
  onEditType?: (row: DocumentTypeRow) => void;
  onOpenTypeActions?: (row: DocumentTypeRow) => void;
  onSelectType: (typeId: EntityId) => void;
  rows: DocumentTypeRow[];
  selectedTypeId: EntityId | null;
  writeRules: DocumentWriteRule[];
}) {
  const { t } = useI18n();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");

  const filteredRows = useMemo(() => {
    const searchValue = normalizedSearch(search);
    return rows.filter((row) => {
      const matchesSearch = rowMatchesSearch(row, searchValue);
      const matchesStatus = statusFilter === "all" || row.status === statusFilter;
      return matchesSearch && matchesStatus;
    });
  }, [rows, search, statusFilter]);

  return (
    <PanelCard bodyClassName="space-y-3" className="h-full" title={t("admin.documentTypes.directory.title")}>
      <Toolbar>
        <SearchInput
          onChange={(event) => setSearch(event.target.value)}
          placeholder={t("admin.documentTypes.directory.search")}
          value={search}
          wrapperClassName="min-w-[12rem] flex-[1_1_14rem]"
        />
        <SelectFilter aria-label={t("admin.documentTypes.directory.statusFilter")} onChange={(event) => setStatusFilter(event.target.value)} value={statusFilter}>
          <option value="all">{t("admin.documentTypes.directory.statusAll")}</option>
          <option value="active">{t("admin.documentTypes.status.active")}</option>
          <option value="draft">{t("admin.documentTypes.status.draft")}</option>
          <option value="inactive">{t("admin.documentTypes.status.inactive")}</option>
          <option value="archived">{t("admin.documentTypes.status.archived")}</option>
        </SelectFilter>
      </Toolbar>

      <div className="max-h-[44rem] space-y-2 overflow-y-auto pe-1">
        {filteredRows.length ? filteredRows.map((row) => {
          const selected = row.id === selectedTypeId;
          const writeEnabled = hasActiveWriteRule(row.id, writeRules);
          return (
            <article
              className={cx(
                "rounded-lg border bg-white p-3 shadow-sm transition",
                selected ? "border-[#061d49] ring-2 ring-[#061d49]/10" : "border-slate-200 hover:border-slate-300"
              )}
              key={row.id}
            >
              <button className="block w-full text-start" onClick={() => onSelectType(row.id)} type="button">
                <div className="flex min-w-0 items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="break-words text-sm font-bold leading-5 text-[#061d49]">{row.name}</p>
                    <p className="force-ltr mt-1 truncate text-start font-mono text-xs font-bold text-slate-500" title={row.code}>{row.code}</p>
                  </div>
                  <StatusBadge tone={row.status === "active" ? "green" : "slate"}>{row.status}</StatusBadge>
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  <StatusBadge tone={writeEnabled ? "green" : "amber"}>
                    {writeEnabled ? t("admin.documentTypes.writeRules.writeEnabled") : t("admin.documentTypes.writeRules.noWriteAccess")}
                  </StatusBadge>
                  <StatusBadge tone={isReady(row) ? "green" : "amber"}>
                    {isReady(row) ? t("admin.documentTypes.readiness.ready") : t("admin.documentTypes.readiness.needsReview")}
                  </StatusBadge>
                </div>
              </button>
              <div className="mt-3 flex flex-wrap gap-2">
                <Button className="min-h-8 px-3 py-1.5 text-xs" disabled={!onEditType} icon="edit" onClick={() => onEditType?.(row)}>
                  {t("admin.documentTypes.directory.edit")}
                </Button>
                <Button className="min-h-8 px-3 py-1.5 text-xs" disabled={!onOpenTypeActions} icon="more" onClick={() => onOpenTypeActions?.(row)}>
                  {t("admin.documentTypes.directory.more")}
                </Button>
              </div>
            </article>
          );
        }) : (
          <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-8 text-center text-sm font-semibold text-slate-500">
            {t("admin.documentTypes.directory.empty")}
          </div>
        )}
      </div>
    </PanelCard>
  );
}

function ReadinessChecklist({
  canManage,
  onActivate,
  onOpenSerial,
  onOpenTemplateBindings,
  selectedType
}: {
  canManage: boolean;
  onActivate: () => void;
  onOpenSerial: () => void;
  onOpenTemplateBindings: () => void;
  selectedType: DocumentTypeRow;
}) {
  const { t } = useI18n();
  const items = [
    {
      actionLabel: canManage ? t("admin.documentTypes.readiness.activate") : "",
      label: t("admin.documentTypes.readiness.activeType"),
      ok: selectedType.checks.activeType,
      onAction: onActivate
    },
    {
      actionLabel: t("admin.documentTypes.actions.templateBindings"),
      label: t("admin.documentTypes.readiness.template"),
      ok: selectedType.checks.templateReady,
      onAction: onOpenTemplateBindings
    },
    {
      actionLabel: t("admin.documentTypes.readiness.openSerial"),
      label: t("admin.documentTypes.readiness.serial"),
      ok: selectedType.checks.serialReady,
      onAction: onOpenSerial
    }
  ];
  const readyCount = items.filter((item) => item.ok).length;

  return (
    <PanelCard
      actions={<StatusBadge tone={readyCount === items.length ? "green" : "amber"}>{`${readyCount}/${items.length}`}</StatusBadge>}
      bodyClassName="space-y-3"
      title={t("admin.documentTypes.readiness.title")}
    >
      <div className="grid gap-2 sm:grid-cols-2">
        {items.map((item) => (
          <div className="flex min-w-0 items-center justify-between gap-3 rounded-lg border border-slate-200 bg-slate-50/70 px-3 py-2" key={item.label}>
            <div className="flex min-w-0 items-center gap-2">
              <span className={cx("grid h-8 w-8 shrink-0 place-items-center rounded-lg", item.ok ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700")}>
                <Icon className="h-4 w-4" name={item.ok ? "userCheck" : "audit"} />
              </span>
              <div className="min-w-0">
                <p className="truncate text-sm font-bold text-slate-900">{item.label}</p>
                <p className={cx("text-xs font-semibold", item.ok ? "text-emerald-700" : "text-amber-700")}>
                  {item.ok ? t("admin.documentTypes.readiness.ready") : t("admin.documentTypes.readiness.needsReview")}
                </p>
              </div>
            </div>
            {!item.ok && item.actionLabel ? (
              <Button className="min-h-8 shrink-0 px-3 py-1.5 text-xs" onClick={item.onAction}>{item.actionLabel}</Button>
            ) : null}
          </div>
        ))}
      </div>
      <div className="flex flex-wrap gap-2 border-t border-slate-100 pt-3">
        <Button className="min-h-9 px-3 py-1.5 text-xs" icon="template" onClick={onOpenTemplateBindings}>{t("admin.documentTypes.actions.templateBindings")}</Button>
        <Button className="min-h-9 px-3 py-1.5 text-xs" icon="serial" onClick={onOpenSerial}>{t("admin.documentTypes.readiness.openSerial")}</Button>
      </div>
    </PanelCard>
  );
}

function WriteRulesManager({
  canManage,
  editingRuleId,
  error,
  form,
  onCancelEdit,
  onChangeForm,
  onEditRule,
  onSaveRule,
  onShowArchivedChange,
  onUpdateStatus,
  positions,
  roles,
  rules,
  saving,
  selectedType,
  showArchived,
  unitTypes
}: {
  canManage: boolean;
  editingRuleId: EntityId | null;
  error: string | null;
  form: WriteRuleFormState;
  onCancelEdit: () => void;
  onChangeForm: (next: WriteRuleFormState | ((current: WriteRuleFormState) => WriteRuleFormState)) => void;
  onEditRule: (rule: DocumentWriteRule) => void;
  onSaveRule: (event: FormEvent<HTMLFormElement>) => void;
  onShowArchivedChange: (showArchived: boolean) => void;
  onUpdateStatus: (rule: DocumentWriteRule, status: string) => void;
  positions: Position[];
  roles: Role[];
  rules: DocumentWriteRule[];
  saving: boolean;
  selectedType: DocumentTypeRow | null;
  showArchived: boolean;
  unitTypes: UnitType[];
}) {
  const { t } = useI18n();
  const activeCount = rules.filter((rule) => rule.status === "active").length;
  const visibleRules = showArchived ? rules : rules.filter((rule) => rule.status !== "archived");

  return (
    <PanelCard
      actions={<StatusBadge tone={activeCount ? "green" : "amber"}>{t("admin.documentTypes.writeRules.activeCount", { count: activeCount })}</StatusBadge>}
      bodyClassName="space-y-4"
      title={t("admin.documentTypes.writeRules.title")}
    >
      <div className="rounded-lg border border-blue-100 bg-blue-50 px-4 py-3 text-sm leading-6 text-[#061d49]">
        {t("admin.documentTypes.writeRules.help")}
      </div>
      {error ? <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm font-semibold text-red-700">{error}</div> : null}

      <form className="rounded-lg border border-slate-200 bg-slate-50/70 p-3" onSubmit={onSaveRule}>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-bold text-slate-950">
              {editingRuleId ? t("admin.documentTypes.writeRules.editRule") : t("admin.documentTypes.writeRules.addRule")}
            </p>
            <p className="mt-1 text-xs font-semibold text-slate-500">
              {selectedType ? selectedType.name : t("admin.documentTypes.builder.empty")}
            </p>
          </div>
          {editingRuleId ? <Button className="min-h-8 px-3 py-1.5 text-xs" onClick={onCancelEdit}>{t("admin.documentTypes.writeRules.cancelEdit")}</Button> : null}
        </div>

        <div className="mt-3 grid gap-3 lg:grid-cols-3">
          <label className={labelClassName}>
            {t("admin.documentTypes.writeRules.unitType")}
            <SelectFilter className="mt-1 w-full" disabled={!selectedType || saving || !canManage} onChange={(event) => onChangeForm((current) => ({ ...current, unit_type_id: event.target.value }))} value={form.unit_type_id}>
              <option value="">{t("admin.documentTypes.writeRules.everyone")}</option>
              {unitTypes.map((unitType) => <option key={unitType.id} value={unitType.id}>{unitType.name}</option>)}
            </SelectFilter>
          </label>
          <label className={labelClassName}>
            {t("admin.documentTypes.writeRules.position")}
            <SelectFilter className="mt-1 w-full" disabled={!selectedType || saving || !canManage} onChange={(event) => onChangeForm((current) => ({ ...current, position_id: event.target.value }))} value={form.position_id}>
              <option value="">{t("common.any")}</option>
              {positions.map((position) => <option key={position.id} value={position.id}>{position.title}</option>)}
            </SelectFilter>
          </label>
          <label className={labelClassName}>
            {t("admin.documentTypes.writeRules.role")}
            <SelectFilter className="mt-1 w-full" disabled={!selectedType || saving || !canManage} onChange={(event) => onChangeForm((current) => ({ ...current, role_id: event.target.value }))} value={form.role_id}>
              <option value="">{t("common.any")}</option>
              {roles.map((role) => <option key={role.id} value={role.id}>{roleLabel(role)}</option>)}
            </SelectFilter>
          </label>
          <label className={labelClassName}>
            {t("admin.documentTypes.writeRules.mode")}
            <ModeSegment disabled={!selectedType || saving || !canManage} onChange={(mode) => onChangeForm((current) => ({ ...current, mode }))} value={form.mode} />
          </label>
          <label className={`${labelClassName} lg:col-span-2`}>
            {t("admin.documentTypes.writeRules.notes")}
            <input
              className={fieldClassName}
              disabled={!selectedType || saving || !canManage}
              onChange={(event) => onChangeForm((current) => ({ ...current, notes: event.target.value }))}
              value={form.notes}
            />
          </label>
        </div>
        <div className="mt-3 flex flex-wrap justify-end gap-2">
          <Button disabled={!selectedType || saving || !canManage} icon={editingRuleId ? "save" : "plus"} type="submit" variant="primary">
            {saving ? t("admin.documentTypes.writeRules.saving") : editingRuleId ? t("admin.documentTypes.writeRules.saveRule") : t("admin.documentTypes.writeRules.addRule")}
          </Button>
        </div>
      </form>

      <div className="flex items-center justify-between gap-3">
        <p className="text-sm font-bold text-slate-950">{t("admin.documentTypes.writeRules.configuredRules")}</p>
        <label className="flex items-center gap-2 text-sm font-semibold text-slate-600">
          <input checked={showArchived} className={checkboxClassName} onChange={(event) => onShowArchivedChange(event.target.checked)} type="checkbox" />
          {t("admin.documentTypes.writeRules.showArchived")}
        </label>
      </div>

      <div className="space-y-2">
        {visibleRules.length ? visibleRules.map((rule) => (
          <article className="grid gap-3 rounded-lg border border-slate-200 bg-white p-3 lg:grid-cols-[minmax(0,1fr)_auto]" key={rule.id}>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <StatusBadge tone={rule.mode === "free" ? "blue" : "slate"}>{rule.mode}</StatusBadge>
                <StatusBadge tone={rule.status === "active" ? "green" : "slate"}>{rule.status}</StatusBadge>
              </div>
              <p className="mt-2 break-words text-sm font-bold text-slate-950">{writeRuleAudienceLabel(rule, t)}</p>
              {rule.notes ? <p className="mt-1 break-words text-sm text-slate-600">{rule.notes}</p> : null}
            </div>
            <div className="flex flex-wrap items-center gap-2 lg:justify-end">
              <Button className="min-h-8 px-3 py-1.5 text-xs" disabled={saving || !canManage} icon="edit" onClick={() => onEditRule(rule)}>
                {t("admin.documentTypes.writeRules.editRule")}
              </Button>
              <Button
                className="min-h-8 px-3 py-1.5 text-xs"
                disabled={saving || !canManage}
                icon={rule.status === "active" ? "pause" : "userCheck"}
                onClick={() => onUpdateStatus(rule, rule.status === "active" ? "archived" : "active")}
                variant={rule.status === "active" ? "danger" : "secondary"}
              >
                {rule.status === "active" ? t("admin.documentTypes.writeRules.archive") : t("admin.documentTypes.writeRules.activate")}
              </Button>
            </div>
          </article>
        )) : (
          <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-8 text-center text-sm font-semibold text-slate-500">
            {rules.length && !showArchived ? t("admin.documentTypes.writeRules.noVisibleRules") : t("admin.documentTypes.writeRules.noRules")}
          </div>
        )}
      </div>
    </PanelCard>
  );
}

export function AdminDocumentTypesPage() {
  const { t } = useI18n();
  const auth = useAuth();
  const navigate = useNavigate();
  const [data, setData] = useState<DocumentTypePageData>(emptyData);
  const [writeRules, setWriteRules] = useState<DocumentWriteRule[]>([]);
  const [unitTypes, setUnitTypes] = useState<UnitType[]>([]);
  const [positions, setPositions] = useState<Position[]>([]);
  const [roles, setRoles] = useState<Role[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeModal, setActiveModal] = useState<ActiveModal>(null);
  const [modalTypeId, setModalTypeId] = useState<EntityId | null>(null);
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [savingRule, setSavingRule] = useState(false);
  const [ruleError, setRuleError] = useState<string | null>(null);
  const [selectedTypeId, setSelectedTypeId] = useState<EntityId | null>(null);
  const [typeForm, setTypeForm] = useState<DocumentTypeForm>(documentTypeFormDefaults);
  const [codeManuallyEdited, setCodeManuallyEdited] = useState(false);
  const [ruleForm, setRuleForm] = useState<WriteRuleFormState>(writeRuleFormDefaults);
  const [editingRuleId, setEditingRuleId] = useState<EntityId | null>(null);
  const [showArchivedRules, setShowArchivedRules] = useState(false);
  const canManageDocumentTypes = auth.roles.some((role) => role.name === "system_admin");

  const refreshDocumentTypes = useCallback(async (nextSelectedTypeId?: EntityId | null) => {
    setLoading(true);

    const [documentTypes, templateBindings, serialRules, documents, nextWriteRules, nextUnitTypes, nextPositions, nextRoles] = await Promise.all([
      safe(adminApi.documentTypes.list(), [] as DocumentType[]),
      safe(templateApi.admin.listBindings(), [] as DocumentTemplateBinding[]),
      safe(signatureApi.listSerialRules(), [] as JsonRecord[]),
      safe(documentApi.list({ limit: 200 }), [] as DocumentListItem[]),
      safe(adminApi.documentWriteRules.list(), [] as DocumentWriteRule[]),
      safe(adminApi.unitTypes.list(), [] as UnitType[]),
      safe(adminApi.positions.list(), [] as Position[]),
      safe(adminApi.roles.list(), [] as Role[])
    ]);

    setData({ documentTypes, documents, serialRules, templateBindings });
    setWriteRules(nextWriteRules);
    setUnitTypes(nextUnitTypes);
    setPositions(nextPositions);
    setRoles(nextRoles);
    setLoading(false);
    if (nextSelectedTypeId !== undefined) {
      setSelectedTypeId(nextSelectedTypeId);
    }
  }, []);

  useEffect(() => {
    void refreshDocumentTypes();
  }, [refreshDocumentTypes]);

  const rows = useMemo(() => buildDocumentTypeRows(data), [data]);

  useEffect(() => {
    const selectedStillExists = selectedTypeId ? rows.some((row) => row.id === selectedTypeId) : false;
    if (!selectedStillExists) {
      setSelectedTypeId(chooseDefaultType(rows)?.id || null);
    }
  }, [rows, selectedTypeId]);

  useEffect(() => {
    if (activeModal !== "create" || codeManuallyEdited || !typeForm.name.trim()) {
      return;
    }

    let alive = true;
    const timeoutId = window.setTimeout(async () => {
      try {
        const suggestion = await adminApi.codeSuggestions.create({
          entity_type: "document_type",
          name: typeForm.name
        });
        if (alive) {
          setTypeForm((current) => ({ ...current, code: suggestion.code }));
        }
      } catch {
        // Code generation is a convenience; final create can still ask the server to generate.
      }
    }, 250);

    return () => {
      alive = false;
      window.clearTimeout(timeoutId);
    };
  }, [activeModal, codeManuallyEdited, typeForm.name]);

  useEffect(() => {
    setEditingRuleId(null);
    setRuleForm(writeRuleFormDefaults());
    setShowArchivedRules(false);
  }, [selectedTypeId]);

  const selectedType = rows.find((row) => row.id === selectedTypeId) || null;
  const modalType = modalTypeId ? rows.find((row) => row.id === modalTypeId) || null : null;
  const selectedWriteRules = selectedType ? writeRules.filter((rule) => Number(rule.document_type_id) === Number(selectedType.id)) : [];
  const stats = {
    active: rows.filter((row) => row.status === "active").length,
    needsReview: rows.filter((row) => !isReady(row)).length,
    serialReady: rows.filter((row) => row.checks.serialReady).length,
    templateReady: rows.filter((row) => row.checks.templateReady).length,
    total: rows.length
  };

  function closeModal() {
    setActiveModal(null);
    setModalTypeId(null);
    setFormError(null);
    setBusy(false);
    setCodeManuallyEdited(false);
  }

  function openCreateTypeModal() {
    setTypeForm(documentTypeFormDefaults());
    setCodeManuallyEdited(false);
    setModalTypeId(null);
    setFormError(null);
    setActiveModal("create");
  }

  function openEditTypeModal(row: DocumentTypeRow) {
    setSelectedTypeId(row.id);
    setModalTypeId(row.id);
    setTypeForm(documentTypeFormFor(row));
    setCodeManuallyEdited(true);
    setFormError(null);
    setActiveModal("edit");
  }

  function openCloneTypeModal(row: DocumentTypeRow) {
    setSelectedTypeId(row.id);
    setModalTypeId(row.id);
    setTypeForm(clonedDocumentTypeFormFor(row));
    setCodeManuallyEdited(false);
    setFormError(null);
    setActiveModal("create");
  }

  function openActionsModal(row: DocumentTypeRow) {
    setSelectedTypeId(row.id);
    setModalTypeId(row.id);
    setFormError(null);
    setActiveModal("actions");
  }

  function openDeleteModal(row: DocumentTypeRow) {
    setSelectedTypeId(row.id);
    setModalTypeId(row.id);
    setFormError(null);
    setActiveModal("delete");
  }

  function openTemplateBindings() {
    closeModal();
    navigate("/admin/templates/admin");
  }

  function openSerialSettings() {
    closeModal();
    navigate("/admin/serial-settings");
  }

  function updateTypeName(name: string) {
    setTypeForm((current) => ({
      ...current,
      name
    }));
  }

  function updateTypeCode(code: string) {
    setCodeManuallyEdited(true);
    setTypeForm((current) => ({ ...current, code: code.toUpperCase() }));
  }

  async function regenerateTypeCode() {
    if (!typeForm.name.trim()) {
      return;
    }

    try {
      const suggestion = await adminApi.codeSuggestions.create({
        entity_type: "document_type",
        exclude_id: modalTypeId || undefined,
        name: typeForm.name
      });
      setTypeForm((current) => ({ ...current, code: suggestion.code }));
      setCodeManuallyEdited(false);
    } catch (error) {
      setFormError(errorMessage(error));
    }
  }

  async function handleCreateType(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setFormError(null);
    setRuleError(null);

    try {
      const createdType = await adminApi.documentTypes.create({
        code: typeForm.code.trim().toUpperCase(),
        description: typeForm.description.trim() || null,
        name: typeForm.name.trim(),
        requires_serial: true,
        status: typeForm.status
      });

      let firstRuleError: string | null = null;
      if (typeForm.create_first_write_rule) {
        try {
          await adminApi.documentWriteRules.create({
            document_type_id: createdType.id,
            mode: typeForm.first_rule_mode,
            notes: typeForm.first_rule_notes.trim() || null,
            position_id: typeForm.first_rule_position_id ? Number(typeForm.first_rule_position_id) : null,
            role_id: typeForm.first_rule_role_id ? Number(typeForm.first_rule_role_id) : null,
            status: "active",
            unit_type_id: typeForm.first_rule_unit_type_id ? Number(typeForm.first_rule_unit_type_id) : null
          });
        } catch (error) {
          firstRuleError = t("admin.documentTypes.writeRules.firstRuleFailed", { message: errorMessage(error) });
        }
      }

      await refreshDocumentTypes(createdType.id);
      closeModal();
      if (firstRuleError) {
        setRuleError(firstRuleError);
      }
    } catch (error) {
      setFormError(errorMessage(error));
      setBusy(false);
    }
  }

  async function handleEditType(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!modalType) {
      return;
    }

    setBusy(true);
    setFormError(null);

    try {
      const updatedType = await adminApi.documentTypes.update(modalType.id, {
        code: typeForm.code.trim().toUpperCase(),
        description: typeForm.description.trim() || null,
        name: typeForm.name.trim(),
        requires_serial: true,
        status: typeForm.status
      });
      await refreshDocumentTypes(updatedType.id);
      closeModal();
    } catch (error) {
      setFormError(errorMessage(error));
      setBusy(false);
    }
  }

  async function updateTypeStatus(row: DocumentTypeRow, status: string) {
    setBusy(true);
    setFormError(null);

    try {
      await adminApi.documentTypes.update(row.id, { status });
      await refreshDocumentTypes(row.id);
      closeModal();
    } catch (error) {
      setFormError(errorMessage(error));
      setBusy(false);
    }
  }

  async function handleRemoveType() {
    if (!modalType) {
      return;
    }

    setBusy(true);
    setFormError(null);

    try {
      await adminApi.documentTypes.remove(modalType.id);
      await refreshDocumentTypes(null);
      closeModal();
    } catch (error) {
      setFormError(errorMessage(error));
      setBusy(false);
    }
  }

  function renderDocumentTypeFields(includeFirstRule: boolean) {
    return (
      <div className="space-y-4">
        <section className="grid gap-4 md:grid-cols-2">
          <label className={labelClassName}>
            {t("admin.documentTypes.form.name")}
            <input className={fieldClassName} maxLength={140} onChange={(event) => updateTypeName(event.target.value)} required value={typeForm.name} />
          </label>
          <label className={labelClassName}>
            {t("admin.documentTypes.form.code")}
            <div className="flex gap-2">
              <input className={`${fieldClassName} force-ltr text-start uppercase`} maxLength={80} onChange={(event) => updateTypeCode(event.target.value)} required value={typeForm.code} />
              <Button className="mt-1 min-h-10 px-3" disabled={!typeForm.name.trim()} icon="reset" onClick={() => void regenerateTypeCode()}>{t("admin.code.generate")}</Button>
            </div>
          </label>
          <label className={labelClassName}>
            {t("admin.documentTypes.form.status")}
            <select className={fieldClassName} onChange={(event) => setTypeForm((current) => ({ ...current, status: event.target.value }))} value={typeForm.status}>
              {documentTypeStatuses.map((status) => <option key={status} value={status}>{status}</option>)}
            </select>
          </label>
          <div className="rounded-lg border border-emerald-100 bg-emerald-50 px-3 py-2 text-sm font-semibold text-emerald-800">
            <span className="block text-xs uppercase tracking-wide text-emerald-700">{t("admin.documentTypes.form.requiresSerial")}</span>
            <span className="mt-1 block">{t("common.yes")}</span>
          </div>
          <label className={`${labelClassName} md:col-span-2`}>
            {t("admin.documentTypes.form.description")}
            <textarea className={`${fieldClassName} min-h-24 resize-y`} onChange={(event) => setTypeForm((current) => ({ ...current, description: event.target.value }))} value={typeForm.description} />
          </label>
        </section>

        {includeFirstRule ? (
          <section className="space-y-3 rounded-lg border border-slate-200 bg-slate-50/70 p-3">
            <label className="flex items-start gap-3 text-sm font-semibold text-slate-700">
              <input checked={typeForm.create_first_write_rule} className={`${checkboxClassName} mt-1`} onChange={(event) => setTypeForm((current) => ({ ...current, create_first_write_rule: event.target.checked }))} type="checkbox" />
              <span>
                <span className="block font-bold text-slate-950">{t("admin.documentTypes.form.firstRuleTitle")}</span>
                <span className="mt-1 block text-xs leading-5 text-slate-500">{t("admin.documentTypes.form.firstRuleHelp")}</span>
              </span>
            </label>
            {typeForm.create_first_write_rule ? (
              <div className="grid gap-3 md:grid-cols-3">
                <label className={labelClassName}>
                  {t("admin.documentTypes.writeRules.unitType")}
                  <SelectFilter className="mt-1 w-full" onChange={(event) => setTypeForm((current) => ({ ...current, first_rule_unit_type_id: event.target.value }))} value={typeForm.first_rule_unit_type_id}>
                    <option value="">{t("admin.documentTypes.writeRules.everyone")}</option>
                    {unitTypes.map((unitType) => <option key={unitType.id} value={unitType.id}>{unitType.name}</option>)}
                  </SelectFilter>
                </label>
                <label className={labelClassName}>
                  {t("admin.documentTypes.writeRules.position")}
                  <SelectFilter className="mt-1 w-full" onChange={(event) => setTypeForm((current) => ({ ...current, first_rule_position_id: event.target.value }))} value={typeForm.first_rule_position_id}>
                    <option value="">{t("common.any")}</option>
                    {positions.map((position) => <option key={position.id} value={position.id}>{position.title}</option>)}
                  </SelectFilter>
                </label>
                <label className={labelClassName}>
                  {t("admin.documentTypes.writeRules.role")}
                  <SelectFilter className="mt-1 w-full" onChange={(event) => setTypeForm((current) => ({ ...current, first_rule_role_id: event.target.value }))} value={typeForm.first_rule_role_id}>
                    <option value="">{t("common.any")}</option>
                    {roles.map((role) => <option key={role.id} value={role.id}>{roleLabel(role)}</option>)}
                  </SelectFilter>
                </label>
                <label className={labelClassName}>
                  {t("admin.documentTypes.writeRules.mode")}
                  <ModeSegment onChange={(mode) => setTypeForm((current) => ({ ...current, first_rule_mode: mode }))} value={typeForm.first_rule_mode} />
                </label>
                <label className={`${labelClassName} md:col-span-2`}>
                  {t("admin.documentTypes.writeRules.notes")}
                  <input className={fieldClassName} onChange={(event) => setTypeForm((current) => ({ ...current, first_rule_notes: event.target.value }))} value={typeForm.first_rule_notes} />
                </label>
              </div>
            ) : null}
          </section>
        ) : null}
      </div>
    );
  }

  async function refreshWriteRules() {
    setWriteRules(await adminApi.documentWriteRules.list());
  }

  function startCreateWriteRule() {
    setEditingRuleId(null);
    setRuleForm(writeRuleFormDefaults());
    setRuleError(null);
  }

  function startEditWriteRule(rule: DocumentWriteRule) {
    setEditingRuleId(rule.id);
    setRuleForm(writeRuleFormDefaults(rule));
    setRuleError(null);
  }

  async function saveWriteRule(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedType) {
      return;
    }

    setSavingRule(true);
    setRuleError(null);
    try {
      const payload = {
        document_type_id: selectedType.id,
        mode: ruleForm.mode,
        notes: ruleForm.notes.trim() || null,
        position_id: ruleForm.position_id ? Number(ruleForm.position_id) : null,
        role_id: ruleForm.role_id ? Number(ruleForm.role_id) : null,
        status: "active",
        unit_type_id: ruleForm.unit_type_id ? Number(ruleForm.unit_type_id) : null
      };

      if (editingRuleId) {
        await adminApi.documentWriteRules.update(editingRuleId, payload);
      } else {
        await adminApi.documentWriteRules.create(payload);
      }
      setEditingRuleId(null);
      setRuleForm(writeRuleFormDefaults());
      await refreshWriteRules();
    } catch (caught) {
      setRuleError(caught instanceof Error ? caught.message : t("admin.documentTypes.writeRules.saveFailed"));
    } finally {
      setSavingRule(false);
    }
  }

  async function updateWriteRuleStatus(rule: DocumentWriteRule, status: string) {
    setSavingRule(true);
    setRuleError(null);
    try {
      await adminApi.documentWriteRules.update(rule.id, { status });
      if (editingRuleId === rule.id) {
        setEditingRuleId(null);
        setRuleForm(writeRuleFormDefaults());
      }
      await refreshWriteRules();
    } catch (caught) {
      setRuleError(caught instanceof Error ? caught.message : t("admin.documentTypes.writeRules.updateFailed"));
    } finally {
      setSavingRule(false);
    }
  }

  return (
    <div className="space-y-4">
      <AdminPageHeader
        actions={(
          <>
            <Button disabled={!canManageDocumentTypes} icon="plus" onClick={openCreateTypeModal} title={canManageDocumentTypes ? t("admin.documentTypes.actions.newType") : t("admin.documentTypes.actions.adminRequired")} variant="primary">
              {t("admin.documentTypes.actions.newType")}
            </Button>
            <Button icon="template" onClick={openTemplateBindings}>{t("admin.documentTypes.actions.templateBindings")}</Button>
          </>
        )}
        description={t("admin.documentTypes.description")}
        title={t("admin.documentTypes.title")}
      />

      {!activeModal && formError ? <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">{formError}</div> : null}

      <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
        <MetricCard icon="document" label={t("admin.documentTypes.stats.total")} value={loading ? "..." : stats.total} />
        <MetricCard icon="activity" label={t("admin.documentTypes.stats.active")} tone="green" value={loading ? "..." : stats.active} />
        <MetricCard icon="template" label={t("admin.documentTypes.stats.templateReady")} tone={stats.templateReady ? "green" : "amber"} value={loading ? "..." : stats.templateReady} />
        <MetricCard icon="serial" label={t("admin.documentTypes.stats.serialReady")} tone={stats.serialReady ? "green" : "amber"} value={loading ? "..." : stats.serialReady} />
        <MetricCard icon="audit" label={t("admin.documentTypes.stats.needsReview")} tone={stats.needsReview ? "amber" : "green"} value={loading ? "..." : stats.needsReview} />
      </section>

      <section className="grid min-w-0 gap-4 xl:grid-cols-[minmax(18rem,.38fr)_minmax(0,1fr)]">
        <div className="min-w-0">
          <DocumentTypeDirectoryPanel
            onEditType={canManageDocumentTypes ? openEditTypeModal : undefined}
            onOpenTypeActions={canManageDocumentTypes ? openActionsModal : undefined}
            onSelectType={(typeId) => {
              setSelectedTypeId(typeId);
              setRuleError(null);
            }}
            rows={rows}
            selectedTypeId={selectedTypeId}
            writeRules={writeRules}
          />
        </div>

        <div className="min-w-0 space-y-4">
          {selectedType ? (
            <>
              <PanelCard bodyClassName="space-y-4" title={t("admin.documentTypes.workspace.title")}>
                <section className="rounded-lg border border-blue-100 bg-[linear-gradient(135deg,#f8fbff,#eef6ff)] p-4">
                  <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                    <div className="min-w-0">
                      <p className="text-xs font-bold uppercase tracking-wide text-blue-700">{t("admin.documentTypes.workspace.selectedType")}</p>
                      <h2 className="mt-2 break-words text-2xl font-black leading-8 text-[#061d49]">{selectedType.name}</h2>
                      <p className="force-ltr mt-1 truncate text-start font-mono text-sm font-bold text-slate-500" title={selectedType.code}>{selectedType.code}</p>
                      <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-700">
                        {selectedType.description === "-" ? t("admin.documentTypes.workspace.noDescription") : selectedType.description}
                      </p>
                    </div>
                    <div className="flex shrink-0 flex-wrap gap-2">
                      <StatusBadge tone={selectedType.status === "active" ? "green" : "slate"}>{selectedType.status}</StatusBadge>
                      <StatusBadge tone="green">{t("admin.documentTypes.builder.serialRequired")}</StatusBadge>
                    </div>
                  </div>
                  <dl className="mt-4 grid gap-3 sm:grid-cols-3">
                    <div className="rounded-lg border border-white/70 bg-white/80 px-3 py-2">
                      <dt className="text-xs font-bold uppercase tracking-wide text-slate-500">{t("admin.documentTypes.inspector.documents")}</dt>
                      <dd className="mt-1 text-lg font-black text-slate-950">{selectedType.documentCount}</dd>
                    </div>
                    <div className="rounded-lg border border-white/70 bg-white/80 px-3 py-2">
                      <dt className="text-xs font-bold uppercase tracking-wide text-slate-500">{t("admin.documentTypes.inspector.templateBindings")}</dt>
                      <dd className="mt-1 text-lg font-black text-slate-950">{selectedType.templateBindingsCount}</dd>
                    </div>
                    <div className="rounded-lg border border-white/70 bg-white/80 px-3 py-2">
                      <dt className="text-xs font-bold uppercase tracking-wide text-slate-500">{t("admin.documentTypes.inspector.serialRequired")}</dt>
                      <dd className="mt-1 text-lg font-black text-slate-950">{t("common.yes")}</dd>
                    </div>
                  </dl>
                </section>
                <div className="flex flex-wrap gap-2">
                  <Button disabled={!canManageDocumentTypes} icon="edit" onClick={() => openEditTypeModal(selectedType)} variant="primary">{t("admin.documentTypes.inspector.editType")}</Button>
                  <Button disabled={!canManageDocumentTypes} icon="template" onClick={() => openCloneTypeModal(selectedType)}>{t("admin.documentTypes.inspector.cloneType")}</Button>
                  <Button icon="template" onClick={openTemplateBindings}>{t("admin.documentTypes.actions.templateBindings")}</Button>
                  <Button disabled={!canManageDocumentTypes || selectedType.status !== "active"} icon="pause" onClick={() => void updateTypeStatus(selectedType, "inactive")} variant="danger">{t("admin.documentTypes.inspector.disableType")}</Button>
                </div>
              </PanelCard>

              <ReadinessChecklist
                canManage={canManageDocumentTypes}
                onActivate={() => void updateTypeStatus(selectedType, "active")}
                onOpenSerial={openSerialSettings}
                onOpenTemplateBindings={openTemplateBindings}
                selectedType={selectedType}
              />

              <WriteRulesManager
                canManage={canManageDocumentTypes}
                editingRuleId={editingRuleId}
                error={ruleError}
                form={ruleForm}
                onCancelEdit={startCreateWriteRule}
                onChangeForm={setRuleForm}
                onEditRule={startEditWriteRule}
                onSaveRule={saveWriteRule}
                onShowArchivedChange={setShowArchivedRules}
                onUpdateStatus={(rule, status) => void updateWriteRuleStatus(rule, status)}
                positions={positions}
                roles={roles}
                rules={selectedWriteRules}
                saving={savingRule}
                selectedType={selectedType}
                showArchived={showArchivedRules}
                unitTypes={unitTypes}
              />
            </>
          ) : (
            <PanelCard title={t("admin.documentTypes.workspace.title")}>
              <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-10 text-center text-sm font-semibold text-slate-500">
                {t("admin.documentTypes.builder.empty")}
              </div>
            </PanelCard>
          )}
        </div>
      </section>

      <AdminModal
        footer={(
          <>
            <Button disabled={busy} onClick={closeModal}>{t("admin.documentTypes.form.cancel")}</Button>
            <Button disabled={busy} form="document-type-create-form" icon="plus" type="submit" variant="primary">{busy ? t("admin.documentTypes.form.creating") : t("admin.documentTypes.form.createType")}</Button>
          </>
        )}
        onClose={closeModal}
        open={activeModal === "create"}
        size="lg"
        title={t("admin.documentTypes.form.newTitle")}
      >
        <form id="document-type-create-form" onSubmit={handleCreateType}>
          {formError ? <p className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm font-medium text-red-700">{formError}</p> : null}
          {renderDocumentTypeFields(true)}
        </form>
      </AdminModal>

      <AdminModal
        footer={(
          <>
            <Button disabled={busy} onClick={closeModal}>{t("admin.documentTypes.form.cancel")}</Button>
            <Button disabled={busy} form="document-type-edit-form" icon="save" type="submit" variant="primary">{busy ? t("admin.documentTypes.form.saving") : t("admin.documentTypes.form.saveType")}</Button>
          </>
        )}
        onClose={closeModal}
        open={activeModal === "edit"}
        size="lg"
        title={t("admin.documentTypes.form.editTitle")}
      >
        <form id="document-type-edit-form" onSubmit={handleEditType}>
          {formError ? <p className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm font-medium text-red-700">{formError}</p> : null}
          {renderDocumentTypeFields(false)}
        </form>
      </AdminModal>

      <AdminModal
        footer={<Button disabled={busy} onClick={closeModal}>{t("admin.documentTypes.form.close")}</Button>}
        onClose={closeModal}
        open={activeModal === "actions"}
        title={t("admin.documentTypes.form.actionsTitle")}
      >
        {modalType ? (
          <div className="space-y-3">
            {formError ? <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm font-medium text-red-700">{formError}</p> : null}
            <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
              <p className="truncate text-sm font-bold text-[#061d49]">{modalType.name}</p>
              <p className="force-ltr mt-1 text-xs font-semibold text-slate-500">{modalType.code}</p>
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
              <Button className="justify-start" icon="view" onClick={() => { closeModal(); setSelectedTypeId(modalType.id); }}>{t("admin.documentTypes.directory.view")}</Button>
              <Button className="justify-start" icon="edit" onClick={() => openEditTypeModal(modalType)}>{t("admin.documentTypes.directory.edit")}</Button>
              <Button className="justify-start" icon="template" onClick={() => openCloneTypeModal(modalType)}>{t("admin.documentTypes.inspector.cloneType")}</Button>
              <Button className="justify-start" icon="template" onClick={openTemplateBindings}>{t("admin.documentTypes.actions.templateBindings")}</Button>
              <Button className="justify-start" icon="userCheck" onClick={() => void updateTypeStatus(modalType, "active")}>{t("admin.documentTypes.form.activate")}</Button>
              <Button className="justify-start" icon="document" onClick={() => void updateTypeStatus(modalType, "draft")}>{t("admin.documentTypes.form.markDraft")}</Button>
              <Button className="justify-start" icon="pause" onClick={() => void updateTypeStatus(modalType, "inactive")}>{t("admin.documentTypes.form.deactivate")}</Button>
              <Button className="justify-start sm:col-span-2" icon="x" onClick={() => openDeleteModal(modalType)} variant="danger">{t("admin.documentTypes.form.removeType")}</Button>
            </div>
          </div>
        ) : null}
      </AdminModal>

      <AdminModal
        footer={(
          <>
            <Button disabled={busy} onClick={closeModal}>{t("admin.documentTypes.form.cancel")}</Button>
            <Button disabled={busy} icon="x" onClick={() => void handleRemoveType()} variant="danger">{busy ? t("admin.documentTypes.form.removing") : t("admin.documentTypes.form.removeType")}</Button>
          </>
        )}
        onClose={closeModal}
        open={activeModal === "delete"}
        title={t("admin.documentTypes.form.removeTitle")}
      >
        <div className="space-y-3">
          {formError ? <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm font-medium text-red-700">{formError}</p> : null}
          <p className="text-sm leading-6 text-slate-700">
            {t("admin.documentTypes.form.removeDescription")}
          </p>
          <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm font-bold text-red-800">{modalType?.name || "-"}</div>
        </div>
      </AdminModal>
    </div>
  );
}
