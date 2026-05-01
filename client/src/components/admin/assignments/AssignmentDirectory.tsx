import { useMemo, useState } from "react";
import type { EntityId, Unit } from "../../../api";
import { useI18n } from "../../../i18n";
import { Button, DataTable, IconButton, SearchInput, SelectFilter, StatusBadge, Toolbar } from "../../ui";
import { formatDate, normalizeSearch, rowMatchesSearch } from "./assignmentUtils";
import type { AssignmentAdminRow, AssignmentSignEligibility, AssignmentType } from "./types";

type AssignmentDirectoryProps = {
  onSelectAssignment: (assignmentId: EntityId) => void;
  rows: AssignmentAdminRow[];
  selectedAssignmentId: EntityId | null;
  units: Unit[];
};

function assignmentTypeText(type: AssignmentType, t: ReturnType<typeof useI18n>["t"]) {
  switch (type) {
    case "primary":
      return t("admin.assignments.type.primary");
    case "delegated":
      return t("admin.assignments.type.delegated");
    case "temporary":
      return t("admin.assignments.type.temporary");
    case "pending":
      return t("admin.assignments.type.pending");
  }
}

function assignmentTypeTone(type: AssignmentType) {
  switch (type) {
    case "primary":
      return "blue";
    case "delegated":
      return "slate";
    case "temporary":
      return "amber";
    case "pending":
      return "amber";
  }
}

function signText(value: AssignmentSignEligibility, t: ReturnType<typeof useI18n>["t"]) {
  switch (value) {
    case "yes":
      return t("common.yes");
    case "optional":
      return t("admin.assignments.sign.optional");
    case "no":
      return t("common.no");
  }
}

function signTone(value: AssignmentSignEligibility) {
  switch (value) {
    case "yes":
      return "green";
    case "optional":
      return "amber";
    case "no":
      return "red";
  }
}

function statusTone(status: string) {
  switch (status) {
    case "active":
      return "green";
    case "pending":
    case "pending_approval":
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
      return t("admin.assignments.status.active");
    case "pending":
    case "pending_approval":
      return t("admin.assignments.status.pendingApproval");
    case "suspended":
      return t("admin.assignments.status.suspended");
    case "draft":
      return t("admin.assignments.status.draft");
    default:
      return status;
  }
}

export function AssignmentDirectory({ onSelectAssignment, rows, selectedAssignmentId, units }: AssignmentDirectoryProps) {
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
        <h2 className="text-base font-bold text-slate-950">{t("admin.assignments.directory.title")}</h2>
      </header>
      <div className="space-y-3 p-4">
        <Toolbar>
          <SearchInput
            onChange={(event) => setSearch(event.target.value)}
            placeholder={t("admin.assignments.directory.search")}
            value={search}
            wrapperClassName="min-w-[15rem] flex-[1_1_20rem]"
          />
          <IconButton icon="filter" label={t("admin.assignments.directory.filter")} />
          <SelectFilter aria-label={t("admin.assignments.directory.statusFilter")} onChange={(event) => setStatusFilter(event.target.value)} value={statusFilter}>
            <option value="all">{t("admin.assignments.directory.statusAll")}</option>
            <option value="active">{t("admin.assignments.status.active")}</option>
            <option value="pending_approval">{t("admin.assignments.status.pendingApproval")}</option>
            <option value="suspended">{t("admin.assignments.status.suspended")}</option>
          </SelectFilter>
          <SelectFilter aria-label={t("admin.assignments.directory.typeFilter")} onChange={(event) => setTypeFilter(event.target.value)} value={typeFilter}>
            <option value="all">{t("admin.assignments.directory.typeAll")}</option>
            <option value="primary">{t("admin.assignments.type.primary")}</option>
            <option value="delegated">{t("admin.assignments.type.delegated")}</option>
            <option value="temporary">{t("admin.assignments.type.temporary")}</option>
            <option value="pending">{t("admin.assignments.type.pending")}</option>
          </SelectFilter>
          <SelectFilter aria-label={t("admin.assignments.directory.unitFilter")} onChange={(event) => setUnitFilter(event.target.value)} value={unitFilter}>
            <option value="all">{t("admin.assignments.directory.unitAll")}</option>
            {units.map((unit) => (
              <option key={unit.id} value={unit.id}>{unit.name}</option>
            ))}
          </SelectFilter>
          <SelectFilter aria-label={t("admin.assignments.directory.canSignFilter")} onChange={(event) => setCanSignFilter(event.target.value)} value={canSignFilter}>
            <option value="all">{t("admin.assignments.directory.canSignAll")}</option>
            <option value="yes">{t("common.yes")}</option>
            <option value="optional">{t("admin.assignments.sign.optional")}</option>
            <option value="no">{t("common.no")}</option>
          </SelectFilter>
          <Button icon="reset" onClick={() => { setSearch(""); setStatusFilter("all"); setTypeFilter("all"); setUnitFilter("all"); setCanSignFilter("all"); }}>
            {t("admin.assignments.directory.reset")}
          </Button>
        </Toolbar>

        <DataTable
          columns={[
            {
              key: "holder",
              header: t("admin.assignments.directory.columns.holder"),
              cell: (row) => (
                <button
                  className={row.id === selectedAssignmentId ? "block max-w-40 break-words text-start font-bold text-[#061d49]" : "block max-w-40 break-words text-start font-semibold text-[#061d49] hover:underline"}
                  onClick={() => onSelectAssignment(row.id)}
                  type="button"
                >
                  {row.displayName}
                </button>
              ),
              className: "w-44"
            },
            {
              key: "position",
              header: t("admin.assignments.directory.columns.position"),
              cell: (row) => <span className="block max-w-36 break-words">{row.position?.title || row.assignment.positionTitle || "-"}</span>,
              className: "w-40"
            },
            {
              key: "unit",
              header: t("admin.assignments.directory.columns.unit"),
              cell: (row) => <span className="block max-w-40 break-words">{row.unit?.name || row.assignment.unitName || "-"}</span>,
              className: "w-44"
            },
            {
              key: "type",
              header: t("admin.assignments.directory.columns.assignmentType"),
              cell: (row) => <StatusBadge tone={assignmentTypeTone(row.assignmentType)}>{assignmentTypeText(row.assignmentType, t)}</StatusBadge>
            },
            {
              key: "authority",
              header: t("admin.assignments.directory.columns.authority"),
              cell: (row) => <span className="block max-w-36 break-words">{row.authorityLabel}</span>,
              hideOnMobile: true,
              className: "w-40"
            },
            {
              key: "canSign",
              header: t("admin.assignments.directory.columns.canSign"),
              cell: (row) => <StatusBadge tone={signTone(row.signEligibility)}>{signText(row.signEligibility, t)}</StatusBadge>
            },
            {
              key: "start",
              header: t("admin.assignments.directory.columns.startDate"),
              cell: (row) => formatDate(row.assignment.starts_at),
              hideOnMobile: true
            },
            {
              key: "end",
              header: t("admin.assignments.directory.columns.endDate"),
              cell: (row) => formatDate(row.assignment.ends_at),
              hideOnMobile: true
            },
            {
              key: "status",
              header: t("admin.assignments.directory.columns.status"),
              cell: (row) => <StatusBadge tone={statusTone(row.status)}>{statusText(row.status, t)}</StatusBadge>
            },
            {
              key: "actions",
              header: t("admin.assignments.directory.columns.actions"),
              cell: (row) => (
                <div className="flex items-center justify-end gap-1">
                  <IconButton className="h-8 w-8 border-transparent" icon="view" label={t("admin.assignments.directory.view")} onClick={() => onSelectAssignment(row.id)} />
                  <IconButton className="h-8 w-8 border-transparent" icon="edit" label={t("admin.assignments.directory.edit")} />
                  <IconButton className="h-8 w-8 border-transparent" icon="more" label={t("admin.assignments.directory.more")} />
                </div>
              ),
              className: "w-28 text-end"
            }
          ]}
          emptyLabel={t("admin.assignments.directory.empty")}
          getRowKey={(row) => row.id}
          rows={filteredRows}
        />
      </div>
    </section>
  );
}

export { assignmentTypeText, assignmentTypeTone, signText, signTone, statusText, statusTone };
