import { useMemo, useState } from "react";
import type { EntityId } from "../../../api";
import { useI18n } from "../../../i18n";
import { Button, DataTable, IconButton, SearchInput, SelectFilter, StatusBadge, Toolbar } from "../../ui";
import { normalizeSearch, rowMatchesSearch } from "./positionUtils";
import type { PositionAdminRow, PositionAuthorityBand } from "./types";

type PositionDirectoryProps = {
  onAssignPosition: (row: PositionAdminRow) => void;
  onEditPosition: (row: PositionAdminRow) => void;
  onOpenPositionActions: (row: PositionAdminRow) => void;
  onSelectPosition: (positionId: EntityId) => void;
  onViewPosition: (row: PositionAdminRow) => void;
  rows: PositionAdminRow[];
  selectedPositionId: EntityId | null;
};

function statusTone(status: string) {
  switch (status) {
    case "active":
      return "green";
    case "vacant":
    case "pending":
    case "pending_review":
    case "draft":
      return "amber";
    case "suspended":
    case "disabled":
      return "red";
    default:
      return "slate";
  }
}

function statusText(status: string, t: ReturnType<typeof useI18n>["t"]) {
  switch (status) {
    case "active":
      return t("admin.positions.status.active");
    case "vacant":
      return t("admin.positions.status.vacant");
    case "suspended":
      return t("admin.positions.status.suspended");
    case "draft":
      return t("admin.positions.status.draft");
    case "pending":
    case "pending_review":
      return t("admin.positions.status.pending");
    case "disabled":
      return t("admin.positions.status.disabled");
    default:
      return status;
  }
}

function authorityText(authority: PositionAuthorityBand, t: ReturnType<typeof useI18n>["t"]) {
  switch (authority) {
    case "executive":
      return t("admin.positions.authority.executive");
    case "academic":
      return t("admin.positions.authority.academic");
    case "unit":
      return t("admin.positions.authority.unit");
    case "review":
      return t("admin.positions.authority.review");
    case "administrative":
      return t("admin.positions.authority.administrative");
    case "operational":
      return t("admin.positions.authority.operational");
  }
}

function unitTypeText(row: PositionAdminRow, t: ReturnType<typeof useI18n>["t"]) {
  if (row.unitTypeCode === "multi_unit") {
    return t("admin.positions.unitType.multiUnit");
  }

  if (row.unitTypeCode === "unassigned") {
    return t("admin.positions.unitType.unassigned");
  }

  return row.unitTypeLabel || row.levelLabel || "-";
}

export function PositionDirectory({
  onAssignPosition,
  onEditPosition,
  onOpenPositionActions,
  onSelectPosition,
  onViewPosition,
  rows,
  selectedPositionId
}: PositionDirectoryProps) {
  const { t } = useI18n();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [unitTypeFilter, setUnitTypeFilter] = useState("all");
  const [authorityFilter, setAuthorityFilter] = useState("all");
  const [canSignFilter, setCanSignFilter] = useState("all");

  const unitTypeOptions = useMemo(() => {
    const options = new Map<string, string>();
    for (const row of rows) {
      options.set(row.unitTypeCode, unitTypeText(row, t));
    }
    return Array.from(options).sort((left, right) => left[1].localeCompare(right[1]));
  }, [rows, t]);

  const filteredRows = useMemo(() => {
    const normalized = normalizeSearch(search);

    return rows.filter((row) => {
      const matchesSearch = rowMatchesSearch(row, normalized);
      const matchesStatus = statusFilter === "all" || row.status === statusFilter;
      const matchesUnitType = unitTypeFilter === "all" || row.unitTypeCode === unitTypeFilter;
      const matchesAuthority = authorityFilter === "all" || row.authorityBand === authorityFilter;
      const matchesCanSign = canSignFilter === "all" || (canSignFilter === "yes" ? row.canSign : !row.canSign);
      return matchesSearch && matchesStatus && matchesUnitType && matchesAuthority && matchesCanSign;
    });
  }, [authorityFilter, canSignFilter, rows, search, statusFilter, unitTypeFilter]);

  return (
    <section className="rounded-xl border border-slate-200 bg-white shadow-sm">
      <header className="border-b border-slate-200 px-4 py-3">
        <h2 className="text-base font-bold text-slate-950">{t("admin.positions.directory.title")}</h2>
      </header>
      <div className="space-y-3 p-4">
        <Toolbar>
          <SearchInput
            onChange={(event) => setSearch(event.target.value)}
            placeholder={t("admin.positions.directory.search")}
            value={search}
            wrapperClassName="min-w-[18rem] flex-[1_1_24rem]"
          />
          <SelectFilter aria-label={t("admin.positions.directory.statusFilter")} className="w-40" onChange={(event) => setStatusFilter(event.target.value)} value={statusFilter}>
            <option value="all">{t("admin.positions.directory.statusAll")}</option>
            <option value="active">{t("admin.positions.status.active")}</option>
            <option value="vacant">{t("admin.positions.status.vacant")}</option>
            <option value="suspended">{t("admin.positions.status.suspended")}</option>
            <option value="disabled">{t("admin.positions.status.disabled")}</option>
          </SelectFilter>
          <SelectFilter aria-label={t("admin.positions.directory.unitTypeFilter")} className="w-44" onChange={(event) => setUnitTypeFilter(event.target.value)} value={unitTypeFilter}>
            <option value="all">{t("admin.positions.directory.unitTypeAll")}</option>
            {unitTypeOptions.map(([code, label]) => (
              <option key={code} value={code}>{label}</option>
            ))}
          </SelectFilter>
          <SelectFilter aria-label={t("admin.positions.directory.authorityFilter")} className="w-44" onChange={(event) => setAuthorityFilter(event.target.value)} value={authorityFilter}>
            <option value="all">{t("admin.positions.directory.authorityAll")}</option>
            <option value="executive">{t("admin.positions.authority.executive")}</option>
            <option value="academic">{t("admin.positions.authority.academic")}</option>
            <option value="unit">{t("admin.positions.authority.unit")}</option>
            <option value="review">{t("admin.positions.authority.review")}</option>
            <option value="administrative">{t("admin.positions.authority.administrative")}</option>
            <option value="operational">{t("admin.positions.authority.operational")}</option>
          </SelectFilter>
          <SelectFilter aria-label={t("admin.positions.directory.canSignFilter")} className="w-36" onChange={(event) => setCanSignFilter(event.target.value)} value={canSignFilter}>
            <option value="all">{t("admin.positions.directory.canSignAll")}</option>
            <option value="yes">{t("common.yes")}</option>
            <option value="no">{t("common.no")}</option>
          </SelectFilter>
          <Button icon="reset" onClick={() => { setSearch(""); setStatusFilter("all"); setUnitTypeFilter("all"); setAuthorityFilter("all"); setCanSignFilter("all"); }}>
            {t("admin.positions.directory.reset")}
          </Button>
        </Toolbar>

        <DataTable
          columns={[
            {
              key: "position",
              header: t("admin.positions.directory.columns.position"),
              cell: (row) => (
                <button
                  className={row.id === selectedPositionId ? "block max-w-64 truncate text-start font-bold text-[#061d49]" : "block max-w-64 truncate text-start font-semibold text-[#061d49] hover:underline"}
                  onClick={() => onSelectPosition(row.id)}
                  title={row.position.title}
                  type="button"
                >
                  {row.position.title}
                </button>
              ),
              className: "w-72"
            },
            {
              key: "code",
              header: t("admin.positions.registry.columns.positionCode"),
              cell: (row) => <span className="force-ltr block max-w-32 truncate text-start" title={row.position.code}>{row.position.code}</span>,
              hideOnMobile: true,
              className: "w-36"
            },
            {
              key: "localName",
              header: t("admin.positions.directory.columns.localName"),
              cell: (row) => <span className="block max-w-48 truncate" title={row.position.title_local || "-"}>{row.position.title_local || "-"}</span>,
              hideOnMobile: true,
              className: "w-52"
            },
            {
              key: "unitScope",
              header: t("admin.positions.directory.columns.unitScope"),
              cell: (row) => <span className="block max-w-56 truncate" title={row.unitScope || t("admin.positions.unitType.unassigned")}>{row.unitScope || t("admin.positions.unitType.unassigned")}</span>,
              className: "w-60"
            },
            {
              key: "level",
              header: t("admin.positions.directory.columns.level"),
              cell: (row) => <span className="block max-w-40 truncate" title={unitTypeText(row, t)}>{unitTypeText(row, t)}</span>,
              hideOnMobile: true,
              className: "w-44"
            },
            {
              key: "authority",
              header: t("admin.positions.directory.columns.authorityType"),
              cell: (row) => <span className="block max-w-40 truncate" title={authorityText(row.authorityBand, t)}>{authorityText(row.authorityBand, t)}</span>,
              hideOnMobile: true,
              className: "w-44"
            },
            {
              key: "canSign",
              header: t("admin.positions.directory.columns.canSign"),
              cell: (row) => (
                <StatusBadge tone={row.canSign ? "green" : "red"}>
                  {row.canSign ? t("common.yes") : t("common.no")}
                </StatusBadge>
              ),
              className: "w-28"
            },
            {
              key: "occupiedBy",
              header: t("admin.positions.directory.columns.occupiedBy"),
              cell: (row) => <span className="block max-w-44 truncate" title={row.currentHolder || t("admin.positions.status.vacant")}>{row.currentHolder || t("admin.positions.status.vacant")}</span>,
              hideOnMobile: true,
              className: "w-48"
            },
            {
              key: "status",
              header: t("admin.positions.directory.columns.status"),
              cell: (row) => <StatusBadge tone={statusTone(row.status)}>{statusText(row.status, t)}</StatusBadge>,
              className: "w-28"
            },
            {
              key: "actions",
              header: t("admin.positions.directory.columns.actions"),
              cell: (row) => (
                <div className="flex items-center justify-end gap-1">
                  <IconButton className="h-8 w-8 border-transparent" icon="view" label={t("admin.positions.directory.view")} onClick={() => onViewPosition(row)} />
                  <IconButton className="h-8 w-8 border-transparent" icon="edit" label={t("admin.positions.directory.edit")} onClick={() => onEditPosition(row)} />
                  <IconButton className="h-8 w-8 border-transparent" icon="users" label={t("admin.positions.directory.assign")} onClick={() => onAssignPosition(row)} />
                  <IconButton className="h-8 w-8 border-transparent" icon="more" label={t("admin.positions.directory.more")} onClick={() => onOpenPositionActions(row)} />
                </div>
              ),
              className: "sticky end-0 z-10 w-44 bg-white text-end group-hover:bg-slate-50/70"
            }
          ]}
          containerClassName="max-h-[calc(100vh-21rem)] overflow-auto"
          emptyLabel={t("admin.positions.directory.empty")}
          getRowAriaLabel={(row) => row.position.title}
          getRowClassName={(row) => row.id === selectedPositionId ? "[&>td]:bg-blue-50/70 [&>td]:text-slate-900" : ""}
          getRowKey={(row) => row.id}
          onRowClick={(row) => onSelectPosition(row.id)}
          rows={filteredRows}
          tableClassName="min-w-[95rem]"
        />
      </div>
    </section>
  );
}

export { authorityText, statusText, statusTone, unitTypeText };
