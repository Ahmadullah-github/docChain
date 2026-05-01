import { useMemo, useState } from "react";
import type { EntityId } from "../../../api";
import { useI18n } from "../../../i18n";
import { Button, DataTable, IconButton, SearchInput, SelectFilter, StatusBadge, Toolbar } from "../../ui";
import { normalizeSearch } from "./organizationUtils";
import type { UnitDirectoryRow, UnitTypeOption } from "./types";

type UnitsDirectoryProps = {
  onEditUnit: (unitId: EntityId) => void;
  onExportRows?: (rows: UnitDirectoryRow[]) => void;
  onOpenActions: (unitId: EntityId) => void;
  onSelectUnit: (unitId: EntityId) => void;
  onViewHierarchy: (unitId: EntityId) => void;
  rows: UnitDirectoryRow[];
  unitTypes: UnitTypeOption[];
};

export function UnitsDirectory({
  onEditUnit,
  onExportRows,
  onOpenActions,
  onSelectUnit,
  onViewHierarchy,
  rows,
  unitTypes
}: UnitsDirectoryProps) {
  const { t } = useI18n();
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");

  const statuses = useMemo(() => Array.from(new Set(rows.map((row) => row.status))).sort(), [rows]);
  const filteredRows = useMemo(() => {
    const normalized = normalizeSearch(search);
    return rows.filter((row) => {
      const matchesSearch = !normalized || [
        row.name,
        row.nameLocal,
        row.code,
        row.parentUnitName,
        row.headPosition,
        row.typeName
      ]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(normalized));
      const matchesType = typeFilter === "all" || row.unit.unitTypeCode === typeFilter;
      const matchesStatus = statusFilter === "all" || row.status === statusFilter;

      return matchesSearch && matchesType && matchesStatus;
    });
  }, [rows, search, statusFilter, typeFilter]);

  return (
    <section className="min-w-0 overflow-hidden rounded-lg border border-slate-200/80 bg-white shadow-[0_1px_2px_rgba(15,23,42,0.06)]">
      <header className="border-b border-slate-200/80 bg-white px-4 py-3">
        <h2 className="text-base font-bold text-slate-950">{t("admin.organizations.directory.title")}</h2>
      </header>
      <div className="space-y-3 p-4">
        <Toolbar className="items-stretch md:items-center">
          <SearchInput
            onChange={(event) => setSearch(event.target.value)}
            placeholder={t("admin.organizations.directory.search")}
            value={search}
            wrapperClassName="min-w-0 flex-1 basis-64"
          />
          <IconButton icon="filter" label={t("admin.organizations.directory.filter")} />
          <SelectFilter
            aria-label={t("admin.organizations.directory.typeFilter")}
            className="min-w-0 flex-1 basis-44"
            onChange={(event) => setTypeFilter(event.target.value)}
            value={typeFilter}
          >
            <option value="all">{t("admin.organizations.directory.allTypes")}</option>
            {unitTypes.map((unitType) => (
              <option key={unitType.id} value={unitType.code}>{unitType.name}</option>
            ))}
          </SelectFilter>
          <SelectFilter
            aria-label={t("admin.organizations.directory.statusFilter")}
            className="min-w-0 flex-1 basis-44"
            onChange={(event) => setStatusFilter(event.target.value)}
            value={statusFilter}
          >
            <option value="all">{t("admin.organizations.directory.allStatuses")}</option>
            {statuses.map((status) => (
              <option key={status} value={status}>{status}</option>
            ))}
          </SelectFilter>
          <Button className="shrink-0" icon="export" onClick={() => onExportRows?.(filteredRows)}>{t("admin.organizations.directory.export")}</Button>
        </Toolbar>

        <DataTable
          columns={[
            {
              key: "name",
              header: t("admin.organizations.directory.columns.name"),
              cell: (row) => <button className="font-semibold text-[#061d49] hover:underline" onClick={() => onSelectUnit(row.id)} type="button">{row.name}</button>
            },
            {
              key: "localName",
              header: t("admin.organizations.directory.columns.localName"),
              cell: (row) => row.nameLocal || "-",
              hideOnMobile: true
            },
            {
              key: "type",
              header: t("admin.organizations.directory.columns.type"),
              cell: (row) => row.typeName
            },
            {
              key: "parent",
              header: t("admin.organizations.directory.columns.parentUnit"),
              cell: (row) => row.parentUnitName,
              hideOnMobile: true
            },
            {
              key: "head",
              header: t("admin.organizations.directory.columns.headPosition"),
              cell: (row) => row.headPosition,
              hideOnMobile: true
            },
            {
              key: "code",
              header: t("admin.organizations.directory.columns.code"),
              cell: (row) => <span className="force-ltr">{row.code}</span>,
              hideOnMobile: true
            },
            {
              key: "users",
              header: t("admin.organizations.directory.columns.users"),
              cell: (row) => row.userCount
            },
            {
              key: "status",
              header: t("admin.organizations.directory.columns.status"),
              cell: (row) => <StatusBadge>{row.status}</StatusBadge>
            },
            {
              key: "actions",
              header: t("admin.organizations.directory.columns.actions"),
              cell: (row) => (
                <div className="flex items-center justify-end gap-1">
                  <IconButton className="h-8 w-8 border-transparent" icon="view" label={t("admin.organizations.directory.view")} onClick={() => onSelectUnit(row.id)} />
                  <IconButton className="h-8 w-8 border-transparent" icon="edit" label={t("admin.organizations.directory.edit")} onClick={() => onEditUnit(row.id)} />
                  <IconButton className="h-8 w-8 border-transparent" icon="hierarchy" label={t("admin.organizations.directory.hierarchy")} onClick={() => onViewHierarchy(row.id)} />
                  <IconButton className="h-8 w-8 border-transparent" icon="more" label={t("admin.organizations.directory.more")} onClick={() => onOpenActions(row.id)} />
                </div>
              ),
              className: "text-end"
            }
          ]}
          emptyLabel={t("admin.organizations.directory.empty")}
          getRowAriaLabel={(row) => row.name}
          getRowKey={(row) => row.id}
          onRowClick={(row) => onSelectUnit(row.id)}
          rows={filteredRows}
        />
      </div>
    </section>
  );
}
