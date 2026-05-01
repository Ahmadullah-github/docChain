import { useMemo, useState } from "react";
import type { EntityId, Unit } from "../../../api";
import { useI18n } from "../../../i18n";
import { Button, DataTable, IconButton, SearchInput, SelectFilter, StatusBadge, Toolbar } from "../../ui";
import { formatDateTime, normalizeSearch, rowMatchesSearch, statusLabel } from "./userUtils";
import type { UserAdminRow, UserSetupStatus } from "./types";

type UserDirectoryProps = {
  onAssignUser: (row: UserAdminRow) => void;
  onEditUser: (row: UserAdminRow) => void;
  onOpenUserActions: (row: UserAdminRow) => void;
  onSelectUser: (userId: EntityId) => void;
  onViewUser: (row: UserAdminRow) => void;
  rows: UserAdminRow[];
  selectedUserId: EntityId | null;
  units: Unit[];
};

function setupTone(status: UserSetupStatus) {
  switch (status) {
    case "ready":
      return "green";
    case "pending":
      return "amber";
    case "not_required":
      return "slate";
    default:
      return "blue";
  }
}

export function UserDirectory({ onAssignUser, onEditUser, onOpenUserActions, onSelectUser, onViewUser, rows, selectedUserId, units }: UserDirectoryProps) {
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

  const setupLabels = {
    not_required: t("admin.users.setup.notRequired"),
    not_tracked: t("admin.users.setup.notTracked"),
    pending: t("admin.users.setup.pending"),
    ready: t("admin.users.setup.ready")
  };

  return (
    <section className="rounded-xl border border-slate-200 bg-white shadow-sm">
      <header className="border-b border-slate-200 px-4 py-3">
        <h2 className="text-base font-bold text-slate-950">{t("admin.users.directory.title")}</h2>
      </header>
      <div className="space-y-3 p-4">
        <Toolbar>
          <SearchInput
            onChange={(event) => setSearch(event.target.value)}
            placeholder={t("admin.users.directory.search")}
            value={search}
            wrapperClassName="min-w-[18rem] flex-[1_1_24rem]"
          />
          <SelectFilter aria-label={t("admin.users.directory.statusFilter")} className="w-40" onChange={(event) => setStatusFilter(event.target.value)} value={statusFilter}>
            <option value="all">{t("admin.users.directory.statusAll")}</option>
            <option value="active">{t("admin.users.status.active")}</option>
            <option value="pending_activation">{t("admin.users.status.pendingActivation")}</option>
            <option value="suspended">{t("admin.users.status.suspended")}</option>
            <option value="disabled">{t("admin.users.status.disabled")}</option>
          </SelectFilter>
          <SelectFilter aria-label={t("admin.users.directory.roleFilter")} className="w-44" onChange={(event) => setRoleFilter(event.target.value)} value={roleFilter}>
            <option value="all">{t("admin.users.directory.roleAll")}</option>
            {roleOptions.map((role) => (
              <option key={role} value={role}>{role}</option>
            ))}
          </SelectFilter>
          <SelectFilter aria-label={t("admin.users.registry.canSignFilter")} className="w-36" onChange={(event) => setCanSignFilter(event.target.value)} value={canSignFilter}>
            <option value="all">{t("admin.users.registry.canSignAll")}</option>
            <option value="yes">{t("common.yes")}</option>
            <option value="no">{t("common.no")}</option>
          </SelectFilter>
          <SelectFilter aria-label={t("admin.users.directory.unitFilter")} className="w-44" onChange={(event) => setUnitFilter(event.target.value)} value={unitFilter}>
            <option value="all">{t("admin.users.directory.unitAll")}</option>
            {units.map((unit) => (
              <option key={unit.id} value={unit.id}>{unit.name}</option>
            ))}
          </SelectFilter>
          <Button icon="reset" onClick={() => { setSearch(""); setStatusFilter("all"); setRoleFilter("all"); setCanSignFilter("all"); setUnitFilter("all"); }}>
            {t("admin.users.directory.reset")}
          </Button>
        </Toolbar>

        <DataTable
          columns={[
            {
              key: "name",
              header: t("admin.users.directory.columns.name"),
              cell: (row) => (
                <button
                  className={row.id === selectedUserId ? "block max-w-52 truncate text-start font-bold text-[#061d49]" : "block max-w-52 truncate text-start font-semibold text-[#061d49] hover:underline"}
                  onClick={() => onSelectUser(row.id)}
                  title={row.user.personDisplayName}
                  type="button"
                >
                  {row.user.personDisplayName}
                </button>
              ),
              className: "w-56"
            },
            {
              key: "username",
              header: t("admin.users.directory.columns.username"),
              cell: (row) => <span className="force-ltr block max-w-32 truncate text-start" title={row.user.username}>{row.user.username}</span>,
              hideOnMobile: true,
              className: "w-36"
            },
            {
              key: "unit",
              header: t("admin.users.directory.columns.primaryUnit"),
              cell: (row) => <span className="block max-w-40 truncate" title={row.unit?.name || row.primaryAssignment?.unitName || "-"}>{row.unit?.name || row.primaryAssignment?.unitName || "-"}</span>,
              hideOnMobile: true,
              className: "w-44"
            },
            {
              key: "position",
              header: t("admin.users.directory.columns.position"),
              cell: (row) => <span className="block max-w-44 truncate" title={row.position?.title || row.primaryAssignment?.positionTitle || "-"}>{row.position?.title || row.primaryAssignment?.positionTitle || "-"}</span>,
              className: "w-48"
            },
            {
              key: "role",
              header: t("admin.users.directory.columns.systemRole"),
              cell: (row) => <span className="block max-w-44 truncate" title={row.roleLabel}>{row.roleLabel}</span>,
              hideOnMobile: true,
              className: "w-48"
            },
            {
              key: "canSign",
              header: t("admin.users.registry.columns.canSign"),
              cell: (row) => (
                <StatusBadge tone={row.canSign ? "green" : "red"}>
                  {row.canSign ? t("common.yes") : t("common.no")}
                </StatusBadge>
              ),
              className: "w-28"
            },
            {
              key: "status",
              header: t("admin.users.directory.columns.status"),
              cell: (row) => <StatusBadge>{statusLabel(row.user.status)}</StatusBadge>,
              className: "w-28"
            },
            {
              key: "setup",
              header: t("admin.users.directory.columns.signaturePin"),
              cell: (row) => <StatusBadge tone={setupTone(row.setupStatus)}>{setupLabels[row.setupStatus]}</StatusBadge>,
              hideOnMobile: true
            },
            {
              key: "lastLogin",
              header: t("admin.users.directory.columns.lastLogin"),
              cell: (row) => <span className="force-ltr block whitespace-nowrap text-start">{formatDateTime(row.user.lastLoginAt)}</span>,
              hideOnMobile: true,
              className: "w-36"
            },
            {
              key: "assignments",
              header: t("admin.users.directory.columns.assignments"),
              cell: (row) => row.activeAssignments.length || row.assignments.length,
              className: "w-28 text-center"
            },
            {
              key: "actions",
              header: t("admin.users.directory.columns.actions"),
              cell: (row) => (
                <div className="flex items-center justify-end gap-1">
                  <IconButton className="h-8 w-8 border-transparent" icon="view" label={t("admin.users.directory.view")} onClick={() => onViewUser(row)} />
                  <IconButton className="h-8 w-8 border-transparent" icon="edit" label={t("admin.users.directory.edit")} onClick={() => onEditUser(row)} />
                  <IconButton className="h-8 w-8 border-transparent" icon="users" label={t("admin.users.directory.assign")} onClick={() => onAssignUser(row)} />
                  <IconButton className="h-8 w-8 border-transparent" icon="more" label={t("admin.users.directory.more")} onClick={() => onOpenUserActions(row)} />
                </div>
              ),
              className: "sticky end-0 z-10 w-40 bg-white text-end group-hover:bg-slate-50/70"
            }
          ]}
          containerClassName="max-h-[calc(100vh-22rem)] overflow-auto"
          emptyLabel={t("admin.users.directory.empty")}
          getRowAriaLabel={(row) => row.user.personDisplayName}
          getRowClassName={(row) => row.id === selectedUserId ? "[&>td]:bg-blue-50/70 [&>td]:text-slate-900" : ""}
          getRowKey={(row) => row.id}
          onRowClick={(row) => onSelectUser(row.id)}
          rows={filteredRows}
          tableClassName="min-w-[86rem]"
        />
      </div>
    </section>
  );
}
