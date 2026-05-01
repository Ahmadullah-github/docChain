import { useMemo, useState } from "react";
import type { EntityId, Unit } from "../../../api";
import { useI18n } from "../../../i18n";
import { Button, DataTable, IconButton, SearchInput, SelectFilter, StatusBadge, Toolbar } from "../../ui";
import { authorityText, statusText, statusTone } from "./PositionDirectory";
import { normalizeSearch, rowMatchesSearch } from "./positionUtils";
import type { PositionAdminRow } from "./types";

type PositionRegistryProps = {
  onAssignPosition: (row: PositionAdminRow) => void;
  onEditPosition: (row: PositionAdminRow) => void;
  onExportPositions: () => void;
  onOpenPositionActions: (row: PositionAdminRow) => void;
  onSelectPosition: (positionId: EntityId) => void;
  onViewPosition: (row: PositionAdminRow) => void;
  rows: PositionAdminRow[];
  selectedPositionId?: EntityId | null;
  units: Unit[];
};

export function PositionRegistry({
  onAssignPosition,
  onEditPosition,
  onExportPositions,
  onOpenPositionActions,
  onSelectPosition,
  onViewPosition,
  rows,
  selectedPositionId,
  units
}: PositionRegistryProps) {
  const { t } = useI18n();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [authorityFilter, setAuthorityFilter] = useState("all");
  const [unitFilter, setUnitFilter] = useState("all");
  const [canSignFilter, setCanSignFilter] = useState("all");

  const filteredRows = useMemo(() => {
    const normalized = normalizeSearch(search);

    return rows.filter((row) => {
      const matchesSearch = rowMatchesSearch(row, normalized);
      const matchesStatus = statusFilter === "all" || row.status === statusFilter;
      const matchesAuthority = authorityFilter === "all" || row.authorityBand === authorityFilter;
      const matchesUnit = unitFilter === "all" || row.units.some((unit) => String(unit.id) === unitFilter);
      const matchesCanSign = canSignFilter === "all" || (canSignFilter === "yes" ? row.canSign : !row.canSign);
      return matchesSearch && matchesStatus && matchesAuthority && matchesUnit && matchesCanSign;
    });
  }, [authorityFilter, canSignFilter, rows, search, statusFilter, unitFilter]);

  return (
    <section className="rounded-xl border border-slate-200 bg-white shadow-sm">
      <header className="border-b border-slate-200 px-4 py-3">
        <h2 className="text-base font-bold text-slate-950">{t("admin.positions.registry.title")}</h2>
      </header>
      <div className="space-y-3 p-4">
        <Toolbar>
          <SearchInput
            onChange={(event) => setSearch(event.target.value)}
            placeholder={t("admin.positions.registry.search")}
            value={search}
            wrapperClassName="min-w-[18rem] flex-[1_1_24rem]"
          />
          <SelectFilter aria-label={t("admin.positions.registry.statusFilter")} className="w-40" onChange={(event) => setStatusFilter(event.target.value)} value={statusFilter}>
            <option value="all">{t("admin.positions.directory.statusAll")}</option>
            <option value="active">{t("admin.positions.status.active")}</option>
            <option value="vacant">{t("admin.positions.status.vacant")}</option>
            <option value="suspended">{t("admin.positions.status.suspended")}</option>
            <option value="disabled">{t("admin.positions.status.disabled")}</option>
          </SelectFilter>
          <SelectFilter aria-label={t("admin.positions.registry.authorityFilter")} className="w-44" onChange={(event) => setAuthorityFilter(event.target.value)} value={authorityFilter}>
            <option value="all">{t("admin.positions.directory.authorityAll")}</option>
            <option value="executive">{t("admin.positions.authority.executive")}</option>
            <option value="academic">{t("admin.positions.authority.academic")}</option>
            <option value="unit">{t("admin.positions.authority.unit")}</option>
            <option value="review">{t("admin.positions.authority.review")}</option>
            <option value="administrative">{t("admin.positions.authority.administrative")}</option>
            <option value="operational">{t("admin.positions.authority.operational")}</option>
          </SelectFilter>
          <SelectFilter aria-label={t("admin.positions.registry.unitFilter")} className="w-44" onChange={(event) => setUnitFilter(event.target.value)} value={unitFilter}>
            <option value="all">{t("admin.positions.registry.unitAll")}</option>
            {units.map((unit) => (
              <option key={unit.id} value={unit.id}>{unit.name}</option>
            ))}
          </SelectFilter>
          <SelectFilter aria-label={t("admin.positions.registry.canSignFilter")} className="w-36" onChange={(event) => setCanSignFilter(event.target.value)} value={canSignFilter}>
            <option value="all">{t("admin.positions.directory.canSignAll")}</option>
            <option value="yes">{t("common.yes")}</option>
            <option value="no">{t("common.no")}</option>
          </SelectFilter>
          <Button icon="export" onClick={onExportPositions}>{t("admin.positions.registry.export")}</Button>
        </Toolbar>

        <DataTable
          columns={[
            {
              key: "name",
              header: t("admin.positions.registry.columns.name"),
              cell: (row) => (
                <button className="block max-w-64 truncate text-start font-semibold text-[#061d49] hover:underline" onClick={() => onSelectPosition(row.id)} title={row.position.title} type="button">
                  {row.position.title}
                </button>
              ),
              className: "w-72"
            },
            {
              key: "localName",
              header: t("admin.positions.registry.columns.localName"),
              cell: (row) => <span className="block max-w-48 truncate" title={row.position.title_local || "-"}>{row.position.title_local || "-"}</span>,
              hideOnMobile: true,
              className: "w-52"
            },
            {
              key: "unit",
              header: t("admin.positions.registry.columns.unit"),
              cell: (row) => <span className="block max-w-56 truncate" title={row.unitScope || t("admin.positions.unitType.unassigned")}>{row.unitScope || t("admin.positions.unitType.unassigned")}</span>,
              className: "w-60"
            },
            {
              key: "code",
              header: t("admin.positions.registry.columns.positionCode"),
              cell: (row) => <span className="force-ltr block max-w-32 truncate text-start" title={row.position.code}>{row.position.code}</span>,
              hideOnMobile: true,
              className: "w-36"
            },
            {
              key: "authority",
              header: t("admin.positions.registry.columns.authority"),
              cell: (row) => <span className="block max-w-40 truncate" title={authorityText(row.authorityBand, t)}>{authorityText(row.authorityBand, t)}</span>,
              hideOnMobile: true,
              className: "w-44"
            },
            {
              key: "holder",
              header: t("admin.positions.registry.columns.currentHolder"),
              cell: (row) => <span className="block max-w-44 truncate" title={row.currentHolder || t("admin.positions.status.vacant")}>{row.currentHolder || t("admin.positions.status.vacant")}</span>,
              className: "w-48"
            },
            {
              key: "canSign",
              header: t("admin.positions.registry.columns.canSign"),
              cell: (row) => (
                <StatusBadge tone={row.canSign ? "green" : "red"}>
                  {row.canSign ? t("common.yes") : t("common.no")}
                </StatusBadge>
              ),
              className: "w-28"
            },
            {
              key: "status",
              header: t("admin.positions.registry.columns.status"),
              cell: (row) => <StatusBadge tone={statusTone(row.status)}>{statusText(row.status, t)}</StatusBadge>,
              className: "w-28"
            },
            {
              key: "updated",
              header: t("admin.positions.registry.columns.lastUpdated"),
              cell: (row) => <span className="force-ltr block whitespace-nowrap text-start">{row.lastUpdated}</span>,
              hideOnMobile: true,
              className: "w-36"
            },
            {
              key: "actions",
              header: t("admin.positions.registry.columns.actions"),
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
          containerClassName="max-h-[28rem] overflow-auto"
          emptyLabel={t("admin.positions.registry.empty")}
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
