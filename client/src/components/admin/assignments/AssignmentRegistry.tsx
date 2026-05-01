import { useMemo, useState } from "react";
import type { EntityId, Unit } from "../../../api";
import { useI18n } from "../../../i18n";
import { Button, DataTable, IconButton, SearchInput, SelectFilter, StatusBadge, Toolbar } from "../../ui";
import {
  assignmentTypeText,
  assignmentTypeTone,
  signText,
  signTone,
  statusText,
  statusTone
} from "./AssignmentDirectory";
import { normalizeSearch, rowMatchesSearch } from "./assignmentUtils";
import type { AssignmentAdminRow } from "./types";

type AssignmentRegistryProps = {
  onEditAssignment?: (row: AssignmentAdminRow) => void;
  onExportRows?: (rows: AssignmentAdminRow[]) => void;
  onOpenAssignmentActions?: (row: AssignmentAdminRow) => void;
  onSelectAssignment: (assignmentId: EntityId) => void;
  onViewAssignment?: (assignmentId: EntityId) => void;
  rows: AssignmentAdminRow[];
  selectedAssignmentId?: EntityId | null;
  units: Unit[];
};

export function AssignmentRegistry({ onEditAssignment, onExportRows, onOpenAssignmentActions, onSelectAssignment, onViewAssignment, rows, selectedAssignmentId, units }: AssignmentRegistryProps) {
  const { t } = useI18n();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [typeFilter, setTypeFilter] = useState("all");
  const [unitFilter, setUnitFilter] = useState("all");
  const [canSignFilter, setCanSignFilter] = useState("all");

  const filteredRows = useMemo(() => {
    const normalized = normalizeSearch(search);

    return rows.filter((row) => {
      const matchesSearch = rowMatchesSearch(row, normalized);
      const matchesStatus = statusFilter === "all" || row.status === statusFilter;
      const matchesType = typeFilter === "all" || row.assignmentType === typeFilter;
      const matchesUnit = unitFilter === "all" || String(row.unit?.id || "") === unitFilter;
      const matchesCanSign = canSignFilter === "all" || row.signEligibility === canSignFilter;
      return matchesSearch && matchesStatus && matchesType && matchesUnit && matchesCanSign;
    });
  }, [canSignFilter, rows, search, statusFilter, typeFilter, unitFilter]);

  return (
    <section className="rounded-xl border border-slate-200 bg-white shadow-sm">
      <header className="border-b border-slate-200 px-4 py-3">
        <h2 className="text-base font-bold text-slate-950">{t("admin.assignments.registry.title")}</h2>
      </header>
      <div className="space-y-3 p-4">
        <Toolbar>
          <SearchInput
            onChange={(event) => setSearch(event.target.value)}
            placeholder={t("admin.assignments.registry.search")}
            value={search}
            wrapperClassName="min-w-[18rem] flex-[1_1_24rem]"
          />
          <SelectFilter aria-label={t("admin.assignments.registry.statusFilter")} className="w-44" onChange={(event) => setStatusFilter(event.target.value)} value={statusFilter}>
            <option value="all">{t("admin.assignments.directory.statusAll")}</option>
            <option value="active">{t("admin.assignments.status.active")}</option>
            <option value="pending_approval">{t("admin.assignments.status.pendingApproval")}</option>
            <option value="suspended">{t("admin.assignments.status.suspended")}</option>
            <option value="draft">{t("admin.assignments.status.draft")}</option>
            <option value="disabled">{t("admin.assignments.status.disabled")}</option>
          </SelectFilter>
          <SelectFilter aria-label={t("admin.assignments.registry.typeFilter")} className="w-48" onChange={(event) => setTypeFilter(event.target.value)} value={typeFilter}>
            <option value="all">{t("admin.assignments.directory.typeAll")}</option>
            <option value="primary">{t("admin.assignments.type.primary")}</option>
            <option value="delegated">{t("admin.assignments.type.delegated")}</option>
            <option value="temporary">{t("admin.assignments.type.temporary")}</option>
            <option value="pending">{t("admin.assignments.type.pending")}</option>
          </SelectFilter>
          <SelectFilter aria-label={t("admin.assignments.registry.unitFilter")} className="w-44" onChange={(event) => setUnitFilter(event.target.value)} value={unitFilter}>
            <option value="all">{t("admin.assignments.registry.unitAll")}</option>
            {units.map((unit) => (
              <option key={unit.id} value={unit.id}>{unit.name}</option>
            ))}
          </SelectFilter>
          <SelectFilter aria-label={t("admin.assignments.registry.canSignFilter")} className="w-40" onChange={(event) => setCanSignFilter(event.target.value)} value={canSignFilter}>
            <option value="all">{t("admin.assignments.directory.canSignAll")}</option>
            <option value="yes">{t("common.yes")}</option>
            <option value="optional">{t("admin.assignments.sign.optional")}</option>
            <option value="no">{t("common.no")}</option>
          </SelectFilter>
          <Button disabled={!filteredRows.length} icon="export" onClick={() => onExportRows?.(filteredRows)}>{t("admin.assignments.registry.export")}</Button>
        </Toolbar>

        <DataTable
          columns={[
            {
              key: "name",
              header: t("admin.assignments.registry.columns.name"),
              cell: (row) => (
                <button className={row.id === selectedAssignmentId ? "block max-w-52 truncate text-start font-bold text-[#061d49]" : "block max-w-52 truncate text-start font-semibold text-[#061d49] hover:underline"} onClick={() => onSelectAssignment(row.id)} title={row.displayName} type="button">
                  {row.displayName}
                </button>
              ),
              className: "w-56"
            },
            {
              key: "localName",
              header: t("admin.assignments.registry.columns.localName"),
              cell: (row) => <span className="block max-w-40 truncate" title={row.localName}>{row.localName}</span>,
              hideOnMobile: true,
              className: "w-44"
            },
            {
              key: "unit",
              header: t("admin.assignments.registry.columns.unit"),
              cell: (row) => {
                const value = row.unit?.name || row.assignment.unitName || "-";
                return <span className="block max-w-52 truncate" title={value}>{value}</span>;
              },
              className: "w-56"
            },
            {
              key: "position",
              header: t("admin.assignments.registry.columns.position"),
              cell: (row) => {
                const value = row.position?.title || row.assignment.positionTitle || "-";
                return <span className="block max-w-52 truncate" title={value}>{value}</span>;
              },
              className: "w-56"
            },
            {
              key: "code",
              header: t("admin.assignments.registry.columns.assignmentCode"),
              cell: (row) => <span className="force-ltr block max-w-40 truncate text-start" title={row.assignmentCode}>{row.assignmentCode}</span>,
              hideOnMobile: true,
              className: "w-44"
            },
            {
              key: "type",
              header: t("admin.assignments.registry.columns.type"),
              cell: (row) => <StatusBadge tone={assignmentTypeTone(row.assignmentType)}>{assignmentTypeText(row.assignmentType, t)}</StatusBadge>,
              className: "w-36"
            },
            {
              key: "canSign",
              header: t("admin.assignments.registry.columns.canSign"),
              cell: (row) => <StatusBadge tone={signTone(row.signEligibility)}>{signText(row.signEligibility, t)}</StatusBadge>,
              className: "w-32"
            },
            {
              key: "status",
              header: t("admin.assignments.registry.columns.status"),
              cell: (row) => <StatusBadge tone={statusTone(row.status)}>{statusText(row.status, t)}</StatusBadge>,
              className: "w-32"
            },
            {
              key: "updated",
              header: t("admin.assignments.registry.columns.lastUpdated"),
              cell: (row) => <span className="force-ltr block whitespace-nowrap text-start">{row.lastUpdated}</span>,
              hideOnMobile: true,
              className: "w-36"
            },
            {
              key: "actions",
              header: t("admin.assignments.registry.columns.actions"),
              cell: (row) => (
                <div className="flex items-center justify-end gap-1">
                  <IconButton className="h-8 w-8 border-transparent" icon="view" label={t("admin.assignments.directory.view")} onClick={() => (onViewAssignment || onSelectAssignment)(row.id)} />
                  <IconButton className="h-8 w-8 border-transparent" icon="edit" label={t("admin.assignments.directory.edit")} onClick={() => onEditAssignment?.(row)} />
                  <IconButton className="h-8 w-8 border-transparent" icon="more" label={t("admin.assignments.directory.more")} onClick={() => onOpenAssignmentActions?.(row)} />
                </div>
              ),
              className: "sticky end-0 z-10 w-36 bg-white text-end group-hover:bg-slate-50/70"
            }
          ]}
          containerClassName="max-h-[28rem] overflow-auto"
          emptyLabel={t("admin.assignments.registry.empty")}
          getRowAriaLabel={(row) => row.displayName}
          getRowClassName={(row) => row.id === selectedAssignmentId ? "[&>td]:bg-blue-50/70 [&>td]:text-slate-900" : ""}
          getRowKey={(row) => row.id}
          onRowClick={(row) => onSelectAssignment(row.id)}
          rows={filteredRows}
          tableClassName="min-w-[100rem]"
        />
      </div>
    </section>
  );
}
