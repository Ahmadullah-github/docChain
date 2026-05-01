import { useMemo, useState } from "react";
import type { EntityId } from "../../../api";
import { useI18n } from "../../../i18n";
import { Button, DataTable, IconButton, SearchInput, SelectFilter, StatusBadge, Toolbar } from "../../ui";
import { formatLabel, groupTone, normalizeSearch, riskTone, rowMatchesSearch } from "./auditLogUtils";
import type { AuditLogRow, AuditRiskLevel } from "./types";

type AuditLogDirectoryProps = {
  onSelectLog: (logId: EntityId) => void;
  rows: AuditLogRow[];
  selectedLogId: EntityId | null;
};

function riskText(riskLevel: AuditRiskLevel, t: ReturnType<typeof useI18n>["t"]) {
  switch (riskLevel) {
    case "high":
      return t("admin.auditLogs.risk.high");
    case "medium":
      return t("admin.auditLogs.risk.medium");
    case "low":
      return t("admin.auditLogs.risk.low");
  }
}

export function AuditLogDirectory({ onSelectLog, rows, selectedLogId }: AuditLogDirectoryProps) {
  const { t } = useI18n();
  const [search, setSearch] = useState("");
  const [groupFilter, setGroupFilter] = useState("all");
  const [riskFilter, setRiskFilter] = useState("all");

  const groups = useMemo(() => Array.from(new Set(rows.map((row) => row.actionGroup))).filter(Boolean).sort(), [rows]);
  const filteredRows = useMemo(() => {
    const normalized = normalizeSearch(search);

    return rows.filter((row) => {
      const matchesSearch = rowMatchesSearch(row, normalized);
      const matchesGroup = groupFilter === "all" || row.actionGroup === groupFilter;
      const matchesRisk = riskFilter === "all" || row.riskLevel === riskFilter;
      return matchesSearch && matchesGroup && matchesRisk;
    });
  }, [groupFilter, riskFilter, rows, search]);

  return (
    <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
      <header className="border-b border-slate-200 px-4 py-3">
        <h2 className="text-base font-bold text-slate-950">{t("admin.auditLogs.directory.title")}</h2>
      </header>
      <div className="space-y-3 p-4">
        <Toolbar>
          <SearchInput
            onChange={(event) => setSearch(event.target.value)}
            placeholder={t("admin.auditLogs.directory.search")}
            value={search}
            wrapperClassName="min-w-[14rem] flex-[1_1_18rem]"
          />
          <SelectFilter aria-label={t("admin.auditLogs.directory.groupFilter")} onChange={(event) => setGroupFilter(event.target.value)} value={groupFilter}>
            <option value="all">{t("admin.auditLogs.directory.groupAll")}</option>
            {groups.map((group) => (
              <option key={group} value={group}>{formatLabel(group)}</option>
            ))}
          </SelectFilter>
          <SelectFilter aria-label={t("admin.auditLogs.directory.riskFilter")} onChange={(event) => setRiskFilter(event.target.value)} value={riskFilter}>
            <option value="all">{t("admin.auditLogs.directory.riskAll")}</option>
            <option value="high">{t("admin.auditLogs.risk.high")}</option>
            <option value="medium">{t("admin.auditLogs.risk.medium")}</option>
            <option value="low">{t("admin.auditLogs.risk.low")}</option>
          </SelectFilter>
          <Button icon="reset" onClick={() => { setSearch(""); setGroupFilter("all"); setRiskFilter("all"); }}>
            {t("admin.auditLogs.directory.reset")}
          </Button>
        </Toolbar>

        <DataTable
          columns={[
            {
              key: "event",
              header: t("admin.auditLogs.directory.columns.event"),
              cell: (row) => (
                <button
                  className={row.id === selectedLogId ? "block max-w-72 break-words text-start font-bold leading-5 text-[#061d49]" : "block max-w-72 break-words text-start font-semibold leading-5 text-[#061d49] hover:underline"}
                  onClick={() => onSelectLog(row.id)}
                  type="button"
                >
                  {row.summary}
                </button>
              ),
              className: "w-80"
            },
            {
              key: "actor",
              header: t("admin.auditLogs.directory.columns.actor"),
              cell: (row) => <span className="block max-w-48 break-words font-semibold text-slate-700">{row.actor}</span>
            },
            {
              key: "group",
              header: t("admin.auditLogs.directory.columns.group"),
              cell: (row) => <StatusBadge tone={groupTone(row.actionGroup)}>{formatLabel(row.actionGroup)}</StatusBadge>,
              hideOnMobile: true
            },
            {
              key: "risk",
              header: t("admin.auditLogs.directory.columns.risk"),
              cell: (row) => <StatusBadge tone={riskTone(row.riskLevel)}>{riskText(row.riskLevel, t)}</StatusBadge>
            },
            {
              key: "ip",
              header: t("admin.auditLogs.directory.columns.ip"),
              cell: (row) => <span className="font-mono text-xs text-slate-600">{row.ipAddress}</span>,
              hideOnMobile: true
            },
            {
              key: "time",
              header: t("admin.auditLogs.directory.columns.time"),
              cell: (row) => <span className="whitespace-nowrap text-xs font-semibold text-slate-600">{row.createdAt}</span>
            },
            {
              key: "actions",
              header: t("admin.auditLogs.directory.columns.actions"),
              cell: (row) => (
                <div className="flex items-center justify-end gap-1">
                  <IconButton className="h-8 w-8 border-transparent" icon="view" label={t("admin.auditLogs.directory.view")} onClick={() => onSelectLog(row.id)} />
                  <IconButton className="h-8 w-8 border-transparent" icon="export" label={t("admin.auditLogs.directory.export")} />
                </div>
              ),
              className: "w-24 text-end"
            }
          ]}
          emptyLabel={t("admin.auditLogs.directory.empty")}
          getRowKey={(row) => row.id}
          rows={filteredRows}
        />
      </div>
    </section>
  );
}
