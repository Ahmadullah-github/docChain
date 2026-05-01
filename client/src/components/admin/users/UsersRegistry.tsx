import { useMemo, useState } from "react";
import type { EntityId, Unit } from "../../../api";
import { useI18n } from "../../../i18n";
import { Button, DataTable, IconButton, SearchInput, SelectFilter, StatusBadge, Toolbar } from "../../ui";
import { formatDate, formatDateTime, normalizeSearch, rowMatchesSearch, statusLabel } from "./userUtils";
import type { UserAdminRow } from "./types";

type UsersRegistryProps = {
  onSelectUser: (userId: EntityId) => void;
  rows: UserAdminRow[];
  units: Unit[];
};

export function UsersRegistry({ onSelectUser, rows, units }: UsersRegistryProps) {
  const { t } = useI18n();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [roleFilter, setRoleFilter] = useState("all");
  const [canSignFilter, setCanSignFilter] = useState("all");
  const [unitFilter, setUnitFilter] = useState("all");

  const roleOptions = useMemo(() => Array.from(new Set(rows.map((row) => row.roleLabel))).sort(), [rows]);
  const filteredRows = useMemo(() => {
    const normalized = normalizeSearch(search);

    return rows.filter((row) => {
      const matchesSearch = rowMatchesSearch(row, normalized);
      const matchesStatus = statusFilter === "all" || row.user.status === statusFilter;
      const matchesRole = roleFilter === "all" || row.roleLabel === roleFilter;
      const matchesCanSign = canSignFilter === "all" || (canSignFilter === "yes" ? row.canSign : !row.canSign);
      const matchesUnit = unitFilter === "all" || String(row.unit?.id || "") === unitFilter;
      return matchesSearch && matchesStatus && matchesRole && matchesCanSign && matchesUnit;
    });
  }, [canSignFilter, roleFilter, rows, search, statusFilter, unitFilter]);

  return (
    <section className="rounded-xl border border-slate-200 bg-white shadow-sm">
      <header className="border-b border-slate-200 px-4 py-3">
        <h2 className="text-base font-bold text-slate-950">{t("admin.users.registry.title")}</h2>
      </header>
      <div className="space-y-3 p-4">
        <Toolbar>
          <SearchInput
            onChange={(event) => setSearch(event.target.value)}
            placeholder={t("admin.users.registry.search")}
            value={search}
            wrapperClassName="min-w-[14rem] flex-1"
          />
          <IconButton icon="filter" label={t("admin.users.registry.filter")} />
          <SelectFilter aria-label={t("admin.users.registry.statusFilter")} onChange={(event) => setStatusFilter(event.target.value)} value={statusFilter}>
            <option value="all">{t("admin.users.directory.statusAll")}</option>
            <option value="active">{t("admin.users.status.active")}</option>
            <option value="pending_activation">{t("admin.users.status.pendingActivation")}</option>
            <option value="suspended">{t("admin.users.status.suspended")}</option>
            <option value="disabled">{t("admin.users.status.disabled")}</option>
          </SelectFilter>
          <SelectFilter aria-label={t("admin.users.registry.roleFilter")} onChange={(event) => setRoleFilter(event.target.value)} value={roleFilter}>
            <option value="all">{t("admin.users.directory.roleAll")}</option>
            {roleOptions.map((role) => (
              <option key={role} value={role}>{role}</option>
            ))}
          </SelectFilter>
          <SelectFilter aria-label={t("admin.users.registry.canSignFilter")} onChange={(event) => setCanSignFilter(event.target.value)} value={canSignFilter}>
            <option value="all">{t("admin.users.registry.canSignAll")}</option>
            <option value="yes">{t("common.yes")}</option>
            <option value="no">{t("common.no")}</option>
          </SelectFilter>
          <SelectFilter aria-label={t("admin.users.registry.unitFilter")} onChange={(event) => setUnitFilter(event.target.value)} value={unitFilter}>
            <option value="all">{t("admin.users.directory.unitAll")}</option>
            {units.map((unit) => (
              <option key={unit.id} value={unit.id}>{unit.name}</option>
            ))}
          </SelectFilter>
          <Button icon="export">{t("admin.users.registry.export")}</Button>
        </Toolbar>

        <DataTable
          columns={[
            {
              key: "name",
              header: t("admin.users.registry.columns.name"),
              cell: (row) => <button className="font-semibold text-[#061d49] hover:underline" onClick={() => onSelectUser(row.id)} type="button">{row.user.personDisplayName}</button>
            },
            {
              key: "localName",
              header: t("admin.users.registry.columns.localName"),
              cell: (row) => row.person?.last_name || "-",
              hideOnMobile: true
            },
            {
              key: "unit",
              header: t("admin.users.registry.columns.unit"),
              cell: (row) => row.unit?.name || row.primaryAssignment?.unitName || "-"
            },
            {
              key: "position",
              header: t("admin.users.registry.columns.position"),
              cell: (row) => row.position?.title || row.primaryAssignment?.positionTitle || "-",
              hideOnMobile: true
            },
            {
              key: "role",
              header: t("admin.users.registry.columns.role"),
              cell: (row) => row.roleLabel,
              hideOnMobile: true
            },
            {
              key: "canSign",
              header: t("admin.users.registry.columns.canSign"),
              cell: (row) => (
                <StatusBadge tone={row.canSign ? "green" : "red"}>
                  {row.canSign ? t("common.yes") : t("common.no")}
                </StatusBadge>
              )
            },
            {
              key: "status",
              header: t("admin.users.registry.columns.status"),
              cell: (row) => <StatusBadge>{statusLabel(row.user.status)}</StatusBadge>
            },
            {
              key: "lastLogin",
              header: t("admin.users.registry.columns.lastLogin"),
              cell: (row) => formatDateTime(row.user.lastLoginAt),
              hideOnMobile: true
            },
            {
              key: "created",
              header: t("admin.users.registry.columns.created"),
              cell: (row) => formatDate(row.user.createdAt),
              hideOnMobile: true
            },
            {
              key: "actions",
              header: t("admin.users.registry.columns.actions"),
              cell: (row) => (
                <div className="flex items-center justify-end gap-1">
                  <IconButton className="h-8 w-8 border-transparent" icon="view" label={t("admin.users.directory.view")} onClick={() => onSelectUser(row.id)} />
                  <IconButton className="h-8 w-8 border-transparent" icon="edit" label={t("admin.users.directory.edit")} />
                  <IconButton className="h-8 w-8 border-transparent" icon="users" label={t("admin.users.directory.assign")} />
                  <IconButton className="h-8 w-8 border-transparent" icon="more" label={t("admin.users.directory.more")} />
                </div>
              ),
              className: "text-end"
            }
          ]}
          emptyLabel={t("admin.users.registry.empty")}
          getRowKey={(row) => row.id}
          rows={filteredRows}
        />
      </div>
    </section>
  );
}
