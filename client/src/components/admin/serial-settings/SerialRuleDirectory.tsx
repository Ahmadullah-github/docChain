import { useMemo, useState } from "react";
import type { EntityId } from "../../../api";
import { useI18n } from "../../../i18n";
import { Button, DataTable, IconButton, PanelCard, SearchInput, SelectFilter, StatusBadge, Toolbar } from "../../ui";
import { formatLabel, normalizeSearch, rowMatchesSearch, statusTone } from "./serialSettingsUtils";
import type { SerialRuleRow } from "./types";

type SerialRuleDirectoryProps = {
  onEditRule?: (row: SerialRuleRow) => void;
  onOpenRuleActions?: (row: SerialRuleRow) => void;
  onSelectRule: (ruleId: EntityId) => void;
  onViewRule?: (row: SerialRuleRow) => void;
  rows: SerialRuleRow[];
  selectedRuleId: EntityId | null;
};

export function SerialRuleDirectory({ onEditRule, onOpenRuleActions, onSelectRule, onViewRule, rows, selectedRuleId }: SerialRuleDirectoryProps) {
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
    <PanelCard
      actions={<span className="text-sm font-semibold text-slate-500">{t("admin.serialSettings.directory.showing", { count: filteredRows.length })}</span>}
      className="overflow-hidden"
      title={t("admin.serialSettings.directory.title")}
    >
      <div className="space-y-3">
        <Toolbar>
          <SearchInput
            onChange={(event) => setSearch(event.target.value)}
            placeholder={t("admin.serialSettings.directory.search")}
            value={search}
            wrapperClassName="min-w-[18rem] flex-[1_1_30rem]"
          />
          <SelectFilter aria-label={t("admin.serialSettings.directory.statusFilter")} className="w-44" onChange={(event) => setStatusFilter(event.target.value)} value={statusFilter}>
            <option value="all">{t("admin.serialSettings.directory.statusAll")}</option>
            <option value="active">{t("admin.serialSettings.status.active")}</option>
            <option value="draft">{t("admin.serialSettings.status.draft")}</option>
            <option value="inactive">{t("admin.serialSettings.status.inactive")}</option>
            <option value="archived">{t("admin.serialSettings.status.archived")}</option>
          </SelectFilter>
          <SelectFilter aria-label={t("admin.serialSettings.directory.scopeFilter")} className="w-48" onChange={(event) => setScopeFilter(event.target.value)} value={scopeFilter}>
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
                  title={row.name}
                  type="button"
                >
                  {row.name}
                  <span className="force-ltr mt-1 block truncate text-start text-xs font-semibold text-slate-500" title={row.code}>{row.code}</span>
                </button>
              ),
              className: "w-72"
            },
            {
              key: "code",
              header: t("admin.serialSettings.directory.columns.code"),
              cell: (row) => <span className="force-ltr block max-w-36 truncate text-start font-mono text-xs font-bold" title={row.code}>{row.code}</span>,
              className: "w-40"
            },
            {
              key: "format",
              header: t("admin.serialSettings.directory.columns.format"),
              cell: (row) => <span className="force-ltr block max-w-72 truncate text-start font-mono text-xs" title={row.format}>{row.format}</span>,
              hideOnMobile: true,
              className: "w-80"
            },
            {
              key: "sample",
              header: t("admin.serialSettings.directory.columns.sample"),
              cell: (row) => <span className="force-ltr block max-w-48 truncate text-start font-mono text-xs font-bold text-[#061d49]" title={row.sampleSerial}>{row.sampleSerial}</span>,
              className: "w-52"
            },
            {
              key: "reset",
              header: t("admin.serialSettings.directory.columns.resetPolicy"),
              cell: (row) => <span className="block max-w-32 truncate" title={formatLabel(row.resetPolicy)}>{formatLabel(row.resetPolicy)}</span>,
              hideOnMobile: true,
              className: "w-36"
            },
            {
              key: "status",
              header: t("admin.serialSettings.directory.columns.status"),
              cell: (row) => <StatusBadge tone={statusTone(row.status)}>{row.status}</StatusBadge>,
              className: "w-32"
            },
            {
              key: "default",
              header: t("admin.serialSettings.stats.defaultRules"),
              cell: (row) => <StatusBadge tone={row.isDefault ? "green" : "slate"}>{row.isDefault ? "default" : "secondary"}</StatusBadge>,
              hideOnMobile: true,
              className: "w-36"
            },
            {
              key: "updated",
              header: t("admin.serialSettings.inspector.lastUpdated"),
              cell: (row) => <span className="force-ltr block whitespace-nowrap text-start text-xs">{row.lastUpdated}</span>,
              hideOnMobile: true,
              className: "w-40"
            },
            {
              key: "actions",
              header: t("admin.serialSettings.directory.columns.actions"),
              cell: (row) => (
                <div className="flex items-center justify-end gap-1">
                  <IconButton
                    className="h-8 w-8 border-transparent"
                    icon="view"
                    label={t("admin.serialSettings.directory.view")}
                    onClick={(event) => {
                      event.stopPropagation();
                      if (onViewRule) {
                        onViewRule(row);
                      } else {
                        onSelectRule(row.id);
                      }
                    }}
                  />
                  <IconButton
                    className="h-8 w-8 border-transparent"
                    icon="edit"
                    label={t("admin.serialSettings.directory.edit")}
                    onClick={(event) => {
                      event.stopPropagation();
                      onEditRule?.(row);
                    }}
                  />
                  <IconButton
                    className="h-8 w-8 border-transparent"
                    icon="more"
                    label={t("admin.serialSettings.directory.more")}
                    onClick={(event) => {
                      event.stopPropagation();
                      onOpenRuleActions?.(row);
                    }}
                  />
                </div>
              ),
              className: "sticky end-0 z-10 w-32 bg-white text-end group-hover:bg-slate-50/70"
            }
          ]}
          containerClassName="max-h-[30rem] overflow-auto"
          emptyLabel={t("admin.serialSettings.directory.empty")}
          getRowAriaLabel={(row) => row.name}
          getRowClassName={(row) => row.id === selectedRuleId ? "[&>td]:bg-blue-50/70 [&>td]:text-slate-900" : ""}
          getRowKey={(row) => row.id}
          onRowClick={(row) => onSelectRule(row.id)}
          rows={filteredRows}
          tableClassName="min-w-[88rem]"
        />
      </div>
    </PanelCard>
  );
}
