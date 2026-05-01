import { useMemo, useState } from "react";
import type { EntityId } from "../../../api";
import { useI18n } from "../../../i18n";
import { Button, DataTable, IconButton, SearchInput, SelectFilter, StatusBadge, Toolbar } from "../../ui";
import { formatLabel, normalizeSearch, rowMatchesSearch, statusTone } from "./serialSettingsUtils";
import type { SerialRuleRow } from "./types";

type SerialRuleDirectoryProps = {
  onSelectRule: (ruleId: EntityId) => void;
  rows: SerialRuleRow[];
  selectedRuleId: EntityId | null;
};

export function SerialRuleDirectory({ onSelectRule, rows, selectedRuleId }: SerialRuleDirectoryProps) {
  const { t } = useI18n();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [scopeFilter, setScopeFilter] = useState("all");

  const scopes = useMemo(() => Array.from(new Set(rows.map((row) => row.scope))).filter(Boolean), [rows]);
  const filteredRows = useMemo(() => {
    const normalized = normalizeSearch(search);

    return rows.filter((row) => {
      const matchesSearch = rowMatchesSearch(row, normalized);
      const matchesStatus = statusFilter === "all" || row.status === statusFilter;
      const matchesScope = scopeFilter === "all" || row.scope === scopeFilter;
      return matchesSearch && matchesStatus && matchesScope;
    });
  }, [rows, scopeFilter, search, statusFilter]);

  return (
    <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
      <header className="border-b border-slate-200 px-4 py-3">
        <h2 className="text-base font-bold text-slate-950">{t("admin.serialSettings.directory.title")}</h2>
      </header>
      <div className="space-y-3 p-4">
        <Toolbar>
          <SearchInput
            onChange={(event) => setSearch(event.target.value)}
            placeholder={t("admin.serialSettings.directory.search")}
            value={search}
            wrapperClassName="min-w-[14rem] flex-[1_1_18rem]"
          />
          <SelectFilter aria-label={t("admin.serialSettings.directory.statusFilter")} onChange={(event) => setStatusFilter(event.target.value)} value={statusFilter}>
            <option value="all">{t("admin.serialSettings.directory.statusAll")}</option>
            <option value="active">{t("admin.serialSettings.status.active")}</option>
            <option value="draft">{t("admin.serialSettings.status.draft")}</option>
            <option value="inactive">{t("admin.serialSettings.status.inactive")}</option>
            <option value="archived">{t("admin.serialSettings.status.archived")}</option>
          </SelectFilter>
          <SelectFilter aria-label={t("admin.serialSettings.directory.scopeFilter")} onChange={(event) => setScopeFilter(event.target.value)} value={scopeFilter}>
            <option value="all">{t("admin.serialSettings.directory.scopeAll")}</option>
            {scopes.map((scope) => (
              <option key={scope} value={scope}>{formatLabel(scope)}</option>
            ))}
          </SelectFilter>
          <Button icon="reset" onClick={() => { setSearch(""); setStatusFilter("all"); setScopeFilter("all"); }}>
            {t("admin.serialSettings.directory.reset")}
          </Button>
        </Toolbar>

        <DataTable
          columns={[
            {
              key: "name",
              header: t("admin.serialSettings.directory.columns.name"),
              cell: (row) => (
                <button
                  className={row.id === selectedRuleId ? "block max-w-56 break-words text-start font-bold leading-5 text-[#061d49]" : "block max-w-56 break-words text-start font-semibold leading-5 text-[#061d49] hover:underline"}
                  onClick={() => onSelectRule(row.id)}
                  type="button"
                >
                  {row.name}
                </button>
              ),
              className: "w-60"
            },
            {
              key: "code",
              header: t("admin.serialSettings.directory.columns.code"),
              cell: (row) => row.code
            },
            {
              key: "format",
              header: t("admin.serialSettings.directory.columns.format"),
              cell: (row) => <span className="block max-w-64 break-words font-mono text-xs">{row.format}</span>,
              hideOnMobile: true
            },
            {
              key: "sample",
              header: t("admin.serialSettings.directory.columns.sample"),
              cell: (row) => <span className="font-mono text-xs font-bold text-[#061d49]">{row.sampleSerial}</span>
            },
            {
              key: "reset",
              header: t("admin.serialSettings.directory.columns.resetPolicy"),
              cell: (row) => formatLabel(row.resetPolicy),
              hideOnMobile: true
            },
            {
              key: "status",
              header: t("admin.serialSettings.directory.columns.status"),
              cell: (row) => <StatusBadge tone={statusTone(row.status)}>{row.status}</StatusBadge>
            },
            {
              key: "actions",
              header: t("admin.serialSettings.directory.columns.actions"),
              cell: (row) => (
                <div className="flex items-center justify-end gap-1">
                  <IconButton className="h-8 w-8 border-transparent" icon="view" label={t("admin.serialSettings.directory.view")} onClick={() => onSelectRule(row.id)} />
                  <IconButton className="h-8 w-8 border-transparent" icon="edit" label={t("admin.serialSettings.directory.edit")} />
                  <IconButton className="h-8 w-8 border-transparent" icon="more" label={t("admin.serialSettings.directory.more")} />
                </div>
              ),
              className: "w-28 text-end"
            }
          ]}
          emptyLabel={t("admin.serialSettings.directory.empty")}
          getRowKey={(row) => row.id}
          rows={filteredRows}
        />
      </div>
    </section>
  );
}
