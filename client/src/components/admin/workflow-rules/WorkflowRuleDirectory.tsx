import { useMemo, useState } from "react";
import type { ReactNode } from "react";
import type { DocumentType, EntityId, UnitType } from "../../../api";
import { useI18n } from "../../../i18n";
import { Button, DataTable, IconButton, SearchInput, SelectFilter, StatusBadge, Toolbar } from "../../ui";
import { normalizeSearch, rowMatchesSearch, statusTone } from "./workflowRuleUtils";
import type { WorkflowRuleRow } from "./types";

type WorkflowRuleDirectoryProps = {
  documentTypes: DocumentType[];
  onSelectRule: (ruleId: EntityId) => void;
  rows: WorkflowRuleRow[];
  selectedRuleId: EntityId | null;
  unitTypes: UnitType[];
};

export function WorkflowRuleDirectory({
  documentTypes,
  onSelectRule,
  rows,
  selectedRuleId,
  unitTypes
}: WorkflowRuleDirectoryProps) {
  const { t } = useI18n();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [documentTypeFilter, setDocumentTypeFilter] = useState("all");
  const [originFilter, setOriginFilter] = useState("all");

  const filteredRows = useMemo(() => {
    const normalizedSearch = normalizeSearch(search);

    return rows.filter((row) => {
      const matchesSearch = rowMatchesSearch(row, normalizedSearch);
      const matchesStatus = statusFilter === "all" || row.status === statusFilter;
      const matchesDocumentType = documentTypeFilter === "all" || String(row.documentTypeId || "") === documentTypeFilter;
      const matchesOrigin = originFilter === "all" || String(row.originUnitType?.id || "") === originFilter;
      return matchesSearch && matchesStatus && matchesDocumentType && matchesOrigin;
    });
  }, [documentTypeFilter, originFilter, rows, search, statusFilter]);

  return (
    <PanelShell title={t("admin.workflowRules.directory.title")}>
      <div className="space-y-3">
        <Toolbar>
          <SearchInput
            onChange={(event) => setSearch(event.target.value)}
            placeholder={t("admin.workflowRules.directory.search")}
            value={search}
            wrapperClassName="min-w-[14rem] flex-[1_1_18rem]"
          />
          <IconButton icon="filter" label={t("admin.workflowRules.directory.filter")} />
          <SelectFilter aria-label={t("admin.workflowRules.directory.statusFilter")} onChange={(event) => setStatusFilter(event.target.value)} value={statusFilter}>
            <option value="all">{t("admin.workflowRules.directory.statusAll")}</option>
            <option value="active">{t("admin.workflowRules.status.active")}</option>
            <option value="draft">{t("admin.workflowRules.status.draft")}</option>
            <option value="inactive">{t("admin.workflowRules.status.inactive")}</option>
            <option value="archived">{t("admin.workflowRules.status.archived")}</option>
          </SelectFilter>
          <SelectFilter aria-label={t("admin.workflowRules.directory.documentTypeFilter")} onChange={(event) => setDocumentTypeFilter(event.target.value)} value={documentTypeFilter}>
            <option value="all">{t("admin.workflowRules.directory.documentTypeAll")}</option>
            {documentTypes.map((documentType) => (
              <option key={documentType.id} value={documentType.id}>{documentType.name}</option>
            ))}
          </SelectFilter>
          <SelectFilter aria-label={t("admin.workflowRules.directory.originUnitFilter")} onChange={(event) => setOriginFilter(event.target.value)} value={originFilter}>
            <option value="all">{t("admin.workflowRules.directory.originAll")}</option>
            {unitTypes.map((unitType) => (
              <option key={unitType.id} value={unitType.id}>{unitType.name}</option>
            ))}
          </SelectFilter>
          <Button icon="reset" onClick={() => { setSearch(""); setStatusFilter("all"); setDocumentTypeFilter("all"); setOriginFilter("all"); }}>
            {t("admin.workflowRules.directory.reset")}
          </Button>
        </Toolbar>

        <DataTable
          columns={[
            {
              key: "name",
              header: t("admin.workflowRules.directory.columns.ruleName"),
              cell: (row) => (
                <button
                  className={row.id === selectedRuleId ? "block max-w-52 break-words text-start font-bold text-[#061d49]" : "block max-w-52 break-words text-start font-semibold text-[#061d49] hover:underline"}
                  onClick={() => onSelectRule(row.id)}
                  type="button"
                >
                  {row.ruleName}
                </button>
              ),
              className: "w-64"
            },
            {
              key: "documentType",
              header: t("admin.workflowRules.directory.columns.documentType"),
              cell: (row) => <span className="block max-w-36 break-words">{row.documentTypeLabel}</span>,
              className: "w-40"
            },
            {
              key: "origin",
              header: t("admin.workflowRules.directory.columns.originUnit"),
              cell: (row) => row.originUnitLabel,
              hideOnMobile: true
            },
            {
              key: "finalSignatory",
              header: t("admin.workflowRules.directory.columns.finalSignatory"),
              cell: (row) => <span className="block max-w-36 break-words">{row.finalSignatory}</span>,
              hideOnMobile: true
            },
            {
              key: "visibility",
              header: t("admin.workflowRules.directory.columns.visibility"),
              cell: (row) => <span className="block max-w-32 break-words">{row.visibilityPolicy}</span>,
              hideOnMobile: true
            },
            {
              key: "status",
              header: t("admin.workflowRules.directory.columns.status"),
              cell: (row) => <StatusBadge tone={statusTone(row.status)}>{row.status}</StatusBadge>
            },
            {
              key: "updated",
              header: t("admin.workflowRules.directory.columns.lastUpdated"),
              cell: (row) => row.lastUpdated,
              hideOnMobile: true
            },
            {
              key: "actions",
              header: t("admin.workflowRules.directory.columns.actions"),
              cell: (row) => (
                <div className="flex items-center justify-end gap-1">
                  <IconButton className="h-8 w-8 border-transparent" icon="view" label={t("admin.workflowRules.directory.view")} onClick={() => onSelectRule(row.id)} />
                  <IconButton className="h-8 w-8 border-transparent" icon="edit" label={t("admin.workflowRules.directory.edit")} />
                  <IconButton className="h-8 w-8 border-transparent" icon="template" label={t("admin.workflowRules.directory.clone")} />
                  <IconButton className="h-8 w-8 border-transparent" icon="more" label={t("admin.workflowRules.directory.more")} />
                </div>
              ),
              className: "w-32 text-end"
            }
          ]}
          emptyLabel={t("admin.workflowRules.directory.empty")}
          getRowKey={(row) => row.id}
          rows={filteredRows}
        />
      </div>
    </PanelShell>
  );
}

function PanelShell({ children, title }: { children: ReactNode; title: string }) {
  return (
    <section className="rounded-xl border border-slate-200 bg-white shadow-sm">
      <header className="border-b border-slate-200 px-4 py-3">
        <h2 className="text-base font-bold text-slate-950">{title}</h2>
      </header>
      <div className="p-4">{children}</div>
    </section>
  );
}
