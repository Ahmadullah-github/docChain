import { useCallback, useEffect, useMemo, useState } from "react";
import type { FormEvent } from "react";
import { adminApi } from "../../api";
import type { ConfidentialityLevel, EntityId, PriorityLevel } from "../../api";
import { AdminModal, AdminPageHeader } from "../../components/admin";
import { Button, DataTable, MetricCard, PanelCard, SearchInput, SelectFilter, StatusBadge, Toolbar } from "../../components/ui";
import type { DataTableColumn } from "../../components/ui";
import { useI18n } from "../../i18n";

type SettingKind = "confidentiality" | "priority";

type LevelRecord = {
  id: EntityId;
  uuid: string;
  code: string;
  name: string;
  rank: number;
  is_default?: boolean | number | string;
  default_due_days?: number | null;
  color?: string | null;
  requires_access_log?: boolean | number | string;
  description?: string | null;
  status: string;
};

type LevelForm = {
  code: string;
  color: string;
  default_due_days: string;
  description: string;
  is_default: boolean;
  name: string;
  rank: string;
  requires_access_log: boolean;
  status: string;
};

type ActiveModal = {
  kind: SettingKind;
  mode: "create" | "edit";
  recordId?: EntityId;
} | null;

const labelClassName = "text-sm font-semibold text-slate-700";
const fieldClassName = "mt-1 block min-h-10 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-800 shadow-sm shadow-slate-900/5 outline-none transition focus:border-[#061d49] focus:ring-4 focus:ring-[#061d49]/10";
const checkboxClassName = "h-4 w-4 rounded border-slate-300 text-[#061d49] focus:ring-[#061d49]/20";

function booleanValue(value: unknown) {
  return value === true || value === 1 || value === "1";
}

function normalizeSearch(value: string) {
  return value.trim().toLowerCase();
}

function nextRank(rows: LevelRecord[]) {
  if (!rows.length) {
    return 10;
  }

  return Math.max(...rows.map((row) => Number(row.rank) || 0)) + 10;
}

function sortedLevels<T extends LevelRecord>(rows: T[]) {
  return [...rows].sort((left, right) => (
    (Number(left.rank) || 0) - (Number(right.rank) || 0)
    || left.name.localeCompare(right.name)
  ));
}

function rowMatchesSearch(row: LevelRecord, search: string) {
  if (!search) {
    return true;
  }

  return [row.name, row.code, row.description || "", row.status].some((value) => value.toLowerCase().includes(search));
}

function formDefaults(kind: SettingKind, rows: LevelRecord[]): LevelForm {
  const hasDefault = rows.some((row) => booleanValue(row.is_default));
  return {
    code: "",
    color: kind === "priority" ? "#2563eb" : "",
    default_due_days: kind === "priority" ? "7" : "",
    description: "",
    is_default: !hasDefault,
    name: "",
    rank: String(nextRank(rows)),
    requires_access_log: false,
    status: "active"
  };
}

function formFor(row: LevelRecord, kind: SettingKind): LevelForm {
  return {
    code: row.code,
    color: kind === "priority" ? row.color || "#2563eb" : "",
    default_due_days: row.default_due_days ? String(row.default_due_days) : "",
    description: row.description || "",
    is_default: booleanValue(row.is_default),
    name: row.name,
    rank: String(row.rank ?? 0),
    requires_access_log: booleanValue(row.requires_access_log),
    status: row.status || "active"
  };
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Request failed.";
}

function LevelDetails({ kind, row }: { kind: SettingKind; row: LevelRecord }) {
  const { t } = useI18n();

  if (kind === "priority") {
    return (
      <div className="space-y-1">
        <div className="flex items-center gap-2">
          {row.color ? <span className="h-3 w-3 rounded-full border border-slate-200" style={{ backgroundColor: row.color }} /> : null}
          <span>{row.default_due_days ? t("admin.documentSettings.priority.dueDays", { count: row.default_due_days }) : t("admin.documentSettings.priority.noDueDays")}</span>
        </div>
        {row.description ? <p className="max-w-md truncate text-xs text-slate-500">{row.description}</p> : null}
      </div>
    );
  }

  return (
    <div className="space-y-1">
      <span>{booleanValue(row.requires_access_log) ? t("admin.documentSettings.confidentiality.accessLogged") : t("admin.documentSettings.confidentiality.noAccessLog")}</span>
      {row.description ? <p className="max-w-md truncate text-xs text-slate-500">{row.description}</p> : null}
    </div>
  );
}

function SettingsPanel({
  busy,
  kind,
  onCreate,
  onEdit,
  onMakeDefault,
  onToggleStatus,
  rows
}: {
  busy: boolean;
  kind: SettingKind;
  onCreate: (kind: SettingKind) => void;
  onEdit: (kind: SettingKind, row: LevelRecord) => void;
  onMakeDefault: (kind: SettingKind, row: LevelRecord) => void;
  onToggleStatus: (kind: SettingKind, row: LevelRecord) => void;
  rows: LevelRecord[];
}) {
  const { t } = useI18n();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");

  const filteredRows = useMemo(() => {
    const searchValue = normalizeSearch(search);
    return sortedLevels(rows).filter((row) => {
      const matchesStatus = statusFilter === "all" || row.status === statusFilter;
      return matchesStatus && rowMatchesSearch(row, searchValue);
    });
  }, [rows, search, statusFilter]);

  const columns: Array<DataTableColumn<LevelRecord>> = [
    {
      cell: (row) => (
        <div className="min-w-0">
          <p className="break-words font-bold text-slate-950">{row.name}</p>
          <p className="force-ltr mt-1 truncate text-start font-mono text-xs font-bold text-slate-500">{row.code}</p>
        </div>
      ),
      header: t("admin.documentSettings.table.name"),
      key: "name"
    },
    {
      cell: (row) => <span className="font-mono text-xs font-bold text-slate-600">{row.rank}</span>,
      className: "w-20",
      header: t("admin.documentSettings.table.rank"),
      key: "rank",
      hideOnMobile: true
    },
    {
      cell: (row) => (
        <StatusBadge tone={booleanValue(row.is_default) ? "green" : "slate"}>
          {booleanValue(row.is_default) ? t("admin.documentSettings.table.default") : t("admin.documentSettings.table.available")}
        </StatusBadge>
      ),
      className: "w-32",
      header: t("admin.documentSettings.table.default"),
      key: "default"
    },
    {
      cell: (row) => <StatusBadge tone={row.status === "active" ? "green" : "slate"}>{row.status}</StatusBadge>,
      className: "w-28",
      header: t("admin.documentSettings.table.status"),
      key: "status"
    },
    {
      cell: (row) => <LevelDetails kind={kind} row={row} />,
      header: t("admin.documentSettings.table.details"),
      key: "details",
      hideOnMobile: true
    },
    {
      cell: (row) => (
        <div className="flex flex-wrap justify-end gap-2">
          <Button className="min-h-8 px-3 py-1.5 text-xs" disabled={busy || booleanValue(row.is_default)} icon="shield" onClick={() => onMakeDefault(kind, row)}>
            {t("admin.documentSettings.actions.setDefault")}
          </Button>
          <Button className="min-h-8 px-3 py-1.5 text-xs" disabled={busy} icon="edit" onClick={() => onEdit(kind, row)}>
            {t("admin.documentSettings.actions.edit")}
          </Button>
          <Button
            className="min-h-8 px-3 py-1.5 text-xs"
            disabled={busy}
            icon={row.status === "active" ? "pause" : "userCheck"}
            onClick={() => onToggleStatus(kind, row)}
            variant={row.status === "active" ? "danger" : "secondary"}
          >
            {row.status === "active" ? t("admin.documentSettings.actions.inactivate") : t("admin.documentSettings.actions.activate")}
          </Button>
        </div>
      ),
      className: "w-[18rem]",
      header: t("admin.documentSettings.table.actions"),
      key: "actions"
    }
  ];

  return (
    <PanelCard
      actions={<Button icon="plus" onClick={() => onCreate(kind)} variant="primary">{kind === "priority" ? t("admin.documentSettings.actions.newPriority") : t("admin.documentSettings.actions.newConfidentiality")}</Button>}
      bodyClassName="space-y-3"
      title={kind === "priority" ? t("admin.documentSettings.priority.title") : t("admin.documentSettings.confidentiality.title")}
    >
      <Toolbar>
        <SearchInput
          onChange={(event) => setSearch(event.target.value)}
          placeholder={kind === "priority" ? t("admin.documentSettings.priority.search") : t("admin.documentSettings.confidentiality.search")}
          value={search}
          wrapperClassName="min-w-[12rem] flex-[1_1_14rem]"
        />
        <SelectFilter aria-label={t("admin.documentSettings.table.statusFilter")} onChange={(event) => setStatusFilter(event.target.value)} value={statusFilter}>
          <option value="all">{t("admin.documentSettings.status.all")}</option>
          <option value="active">{t("admin.documentSettings.status.active")}</option>
          <option value="inactive">{t("admin.documentSettings.status.inactive")}</option>
        </SelectFilter>
      </Toolbar>

      <DataTable
        columns={columns}
        emptyLabel={kind === "priority" ? t("admin.documentSettings.priority.empty") : t("admin.documentSettings.confidentiality.empty")}
        getRowKey={(row) => row.id}
        rows={filteredRows}
      />
    </PanelCard>
  );
}

export function AdminDocumentSettingsPage() {
  const { t } = useI18n();
  const [priorityLevels, setPriorityLevels] = useState<PriorityLevel[]>([]);
  const [confidentialityLevels, setConfidentialityLevels] = useState<ConfidentialityLevel[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [pageError, setPageError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [modal, setModal] = useState<ActiveModal>(null);
  const [form, setForm] = useState<LevelForm>(() => formDefaults("priority", []));
  const [codeManuallyEdited, setCodeManuallyEdited] = useState(false);

  const refreshSettings = useCallback(async () => {
    setLoading(true);
    setPageError(null);
    try {
      const [nextPriorityLevels, nextConfidentialityLevels] = await Promise.all([
        adminApi.priorityLevels.list(),
        adminApi.confidentialityLevels.list()
      ]);
      setPriorityLevels(nextPriorityLevels);
      setConfidentialityLevels(nextConfidentialityLevels);
    } catch (error) {
      setPageError(errorMessage(error));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refreshSettings();
  }, [refreshSettings]);

  useEffect(() => {
    if (!modal || modal.mode !== "create" || codeManuallyEdited || !form.name.trim()) {
      return;
    }

    let alive = true;
    const timeoutId = window.setTimeout(async () => {
      try {
        const suggestion = await adminApi.codeSuggestions.create({
          entity_type: modal.kind === "priority" ? "priority_level" : "confidentiality_level",
          name: form.name
        });
        if (alive) {
          setForm((current) => ({ ...current, code: suggestion.code }));
        }
      } catch {
        // Code generation is a convenience; final create can still ask the server to generate.
      }
    }, 250);

    return () => {
      alive = false;
      window.clearTimeout(timeoutId);
    };
  }, [codeManuallyEdited, form.name, modal]);

  const rowsForKind = useCallback((kind: SettingKind): LevelRecord[] => (
    kind === "priority" ? priorityLevels : confidentialityLevels
  ), [confidentialityLevels, priorityLevels]);

  const stats = {
    activeConfidentiality: confidentialityLevels.filter((row) => row.status === "active").length,
    activePriority: priorityLevels.filter((row) => row.status === "active").length,
    defaultConfidentiality: confidentialityLevels.find((row) => booleanValue(row.is_default))?.name || t("admin.documentSettings.stats.none"),
    defaultPriority: priorityLevels.find((row) => booleanValue(row.is_default))?.name || t("admin.documentSettings.stats.none")
  };

  function closeModal() {
    setModal(null);
    setFormError(null);
    setBusy(false);
    setCodeManuallyEdited(false);
  }

  function openCreateModal(kind: SettingKind) {
    setForm(formDefaults(kind, rowsForKind(kind)));
    setFormError(null);
    setCodeManuallyEdited(false);
    setModal({ kind, mode: "create" });
  }

  function openEditModal(kind: SettingKind, row: LevelRecord) {
    setForm(formFor(row, kind));
    setFormError(null);
    setCodeManuallyEdited(true);
    setModal({ kind, mode: "edit", recordId: row.id });
  }

  function patchForm(next: Partial<LevelForm>) {
    setForm((current) => ({ ...current, ...next }));
  }

  function handleNameChange(name: string) {
    setForm((current) => ({
      ...current,
      name
    }));
  }

  async function regenerateCode() {
    if (!modal || !form.name.trim()) {
      return;
    }

    try {
      const suggestion = await adminApi.codeSuggestions.create({
        entity_type: modal.kind === "priority" ? "priority_level" : "confidentiality_level",
        exclude_id: modal.recordId,
        name: form.name
      });
      patchForm({ code: suggestion.code });
      setCodeManuallyEdited(false);
    } catch (error) {
      setFormError(errorMessage(error));
    }
  }

  async function updateLevel(kind: SettingKind, row: LevelRecord, payload: Partial<PriorityLevel> | Partial<ConfidentialityLevel>) {
    setBusy(true);
    setPageError(null);
    try {
      if (kind === "priority") {
        await adminApi.priorityLevels.update(row.id, payload as Partial<PriorityLevel>);
      } else {
        await adminApi.confidentialityLevels.update(row.id, payload as Partial<ConfidentialityLevel>);
      }
      await refreshSettings();
    } catch (error) {
      setPageError(errorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  function handleMakeDefault(kind: SettingKind, row: LevelRecord) {
    void updateLevel(kind, row, { is_default: true, status: "active" });
  }

  function handleToggleStatus(kind: SettingKind, row: LevelRecord) {
    const nextStatus = row.status === "active" ? "inactive" : "active";
    void updateLevel(kind, row, {
      is_default: nextStatus === "inactive" && booleanValue(row.is_default) ? false : undefined,
      status: nextStatus
    });
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!modal) {
      return;
    }

    setBusy(true);
    setFormError(null);
    const rank = Math.max(0, Number.parseInt(form.rank, 10) || 0);
    const basePayload = {
      code: form.code.trim(),
      description: form.description.trim() || null,
      is_default: form.is_default,
      name: form.name.trim(),
      rank,
      status: form.status
    };

    try {
      if (modal.kind === "priority") {
        const payload = {
          ...basePayload,
          color: form.color.trim() || null,
          default_due_days: form.default_due_days ? Math.max(1, Number.parseInt(form.default_due_days, 10) || 1) : null
        };
        if (modal.mode === "create") {
          await adminApi.priorityLevels.create(payload);
        } else if (modal.recordId) {
          await adminApi.priorityLevels.update(modal.recordId, payload);
        }
      } else {
        const payload = {
          ...basePayload,
          requires_access_log: form.requires_access_log
        };
        if (modal.mode === "create") {
          await adminApi.confidentialityLevels.create(payload);
        } else if (modal.recordId) {
          await adminApi.confidentialityLevels.update(modal.recordId, payload);
        }
      }

      await refreshSettings();
      closeModal();
    } catch (error) {
      setFormError(errorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <AdminPageHeader
        actions={(
          <>
            <Button icon="plus" onClick={() => openCreateModal("priority")} variant="primary">{t("admin.documentSettings.actions.newPriority")}</Button>
            <Button icon="shield" onClick={() => openCreateModal("confidentiality")}>{t("admin.documentSettings.actions.newConfidentiality")}</Button>
          </>
        )}
        description={t("admin.documentSettings.description")}
        title={t("admin.documentSettings.title")}
      />

      {pageError ? <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">{pageError}</div> : null}

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard icon="filter" label={t("admin.documentSettings.stats.activePriorities")} tone="green" value={loading ? "..." : stats.activePriority} />
        <MetricCard icon="shield" label={t("admin.documentSettings.stats.defaultPriority")} tone="navy" value={loading ? "..." : stats.defaultPriority} />
        <MetricCard icon="lock" label={t("admin.documentSettings.stats.activeConfidentiality")} tone="amber" value={loading ? "..." : stats.activeConfidentiality} />
        <MetricCard icon="shield" label={t("admin.documentSettings.stats.defaultConfidentiality")} tone="slate" value={loading ? "..." : stats.defaultConfidentiality} />
      </div>

      <div className="grid gap-4 2xl:grid-cols-2">
        <SettingsPanel
          busy={busy}
          kind="priority"
          onCreate={openCreateModal}
          onEdit={openEditModal}
          onMakeDefault={handleMakeDefault}
          onToggleStatus={handleToggleStatus}
          rows={priorityLevels}
        />
        <SettingsPanel
          busy={busy}
          kind="confidentiality"
          onCreate={openCreateModal}
          onEdit={openEditModal}
          onMakeDefault={handleMakeDefault}
          onToggleStatus={handleToggleStatus}
          rows={confidentialityLevels}
        />
      </div>

      <AdminModal
        footer={(
          <>
            <Button disabled={busy} onClick={closeModal}>{t("admin.documentSettings.form.cancel")}</Button>
            <Button disabled={busy} form="document-setting-form" icon="save" type="submit" variant="primary">
              {busy ? t("admin.documentSettings.form.saving") : t("admin.documentSettings.form.save")}
            </Button>
          </>
        )}
        onClose={closeModal}
        open={Boolean(modal)}
        title={modal?.mode === "create" ? t("admin.documentSettings.form.createTitle") : t("admin.documentSettings.form.editTitle")}
      >
        <form className="space-y-4" id="document-setting-form" onSubmit={handleSubmit}>
          {formError ? <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm font-semibold text-red-700">{formError}</div> : null}

          <div className="grid gap-3 sm:grid-cols-2">
            <label className={labelClassName}>
              {t("admin.documentSettings.form.name")}
              <input className={fieldClassName} onChange={(event) => handleNameChange(event.target.value)} required value={form.name} />
            </label>
            <label className={labelClassName}>
              {t("admin.documentSettings.form.code")}
              <div className="flex gap-2">
                <input
                  className={`${fieldClassName} force-ltr w-full text-start font-mono uppercase`}
                  maxLength={80}
                  onChange={(event) => {
                    setCodeManuallyEdited(true);
                    patchForm({ code: event.target.value.toUpperCase() });
                  }}
                  required
                  value={form.code}
                />
                <Button className="min-h-10 px-3" disabled={!form.name.trim()} icon="reset" onClick={() => void regenerateCode()}>{t("admin.code.generate")}</Button>
              </div>
            </label>
            <label className={labelClassName}>
              {t("admin.documentSettings.form.rank")}
              <input className={fieldClassName} min={0} onChange={(event) => patchForm({ rank: event.target.value })} required type="number" value={form.rank} />
            </label>
            <label className={labelClassName}>
              {t("admin.documentSettings.form.status")}
              <SelectFilter className="mt-1 w-full" onChange={(event) => patchForm({ status: event.target.value })} value={form.status}>
                <option value="active">{t("admin.documentSettings.status.active")}</option>
                <option value="inactive">{t("admin.documentSettings.status.inactive")}</option>
              </SelectFilter>
            </label>
          </div>

          {modal?.kind === "priority" ? (
            <div className="grid gap-3 sm:grid-cols-2">
              <label className={labelClassName}>
                {t("admin.documentSettings.form.defaultDueDays")}
                <input className={fieldClassName} min={1} onChange={(event) => patchForm({ default_due_days: event.target.value })} type="number" value={form.default_due_days} />
              </label>
              <label className={labelClassName}>
                {t("admin.documentSettings.form.color")}
                <input className={`${fieldClassName} h-10 p-1`} onChange={(event) => patchForm({ color: event.target.value })} type="color" value={form.color || "#2563eb"} />
              </label>
            </div>
          ) : (
            <label className="flex items-center gap-2 text-sm font-semibold text-slate-700">
              <input checked={form.requires_access_log} className={checkboxClassName} onChange={(event) => patchForm({ requires_access_log: event.target.checked })} type="checkbox" />
              {t("admin.documentSettings.form.requiresAccessLog")}
            </label>
          )}

          <label className="flex items-center gap-2 text-sm font-semibold text-slate-700">
            <input checked={form.is_default} className={checkboxClassName} onChange={(event) => patchForm({ is_default: event.target.checked })} type="checkbox" />
            {t("admin.documentSettings.form.defaultValue")}
          </label>

          <label className={labelClassName}>
            {t("admin.documentSettings.form.description")}
            <textarea className={`${fieldClassName} min-h-24`} onChange={(event) => patchForm({ description: event.target.value })} value={form.description} />
          </label>
        </form>
      </AdminModal>
    </div>
  );
}
