import { useMemo, useState } from "react";
import type { DocumentType, UnitType } from "../../../api";
import { useI18n } from "../../../i18n";
import { Button, DataTable, IconButton, PanelCard, SearchInput, SelectFilter, StatusBadge, Toolbar } from "../../ui";
import { normalizeSearch, rowMatchesSearch, statusTone } from "./signatureRuleUtils";
import type { SignatureRuleChainRow } from "./types";

type SignatureRuleDirectoryProps = {
  documentTypes: DocumentType[];
  onEditChain?: (row: SignatureRuleChainRow) => void;
  onManageSigners?: (row: SignatureRuleChainRow) => void;
  onOpenActions?: (row: SignatureRuleChainRow) => void;
  onSelectChain: (chainId: string) => void;
  onViewChain?: (row: SignatureRuleChainRow) => void;
  rows: SignatureRuleChainRow[];
  selectedChainId: string | null;
  unitTypes: UnitType[];
};

export function SignatureRuleDirectory({
  documentTypes,
  onEditChain,
  onManageSigners,
  onOpenActions,
  onSelectChain,
  onViewChain,
  rows,
  selectedChainId,
  unitTypes
}: SignatureRuleDirectoryProps) {
  const { t } = useI18n();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [documentTypeFilter, setDocumentTypeFilter] = useState("all");
  const [originFilter, setOriginFilter] = useState("all");

  const filteredRows = useMemo(() => {
    const normalized = normalizeSearch(search);

    return rows.filter((row) => {
      const matchesSearch = rowMatchesSearch(row, normalized);
      const matchesStatus = statusFilter === "all" || row.status === statusFilter;
      const matchesDocumentType = documentTypeFilter === "all" || String(row.documentTypeId || "") === documentTypeFilter;
      const matchesOrigin = originFilter === "all" || String(row.originUnitType?.id || "") === originFilter;
      return matchesSearch && matchesStatus && matchesDocumentType && matchesOrigin;
    });
  }, [documentTypeFilter, originFilter, rows, search, statusFilter]);

  return (
    <PanelCard
      actions={<span className="text-sm font-semibold text-slate-500">{t("admin.signatureRules.directory.showing", { count: filteredRows.length })}</span>}
      className="overflow-hidden"
      title={t("admin.signatureRules.directory.title")}
    >
      <div className="space-y-3">
        <Toolbar>
          <SearchInput
            onChange={(event) => setSearch(event.target.value)}
            placeholder={t("admin.signatureRules.directory.search")}
            value={search}
            wrapperClassName="min-w-[18rem] flex-[1_1_28rem]"
          />
          <SelectFilter aria-label={t("admin.signatureRules.directory.statusFilter")} className="w-44" onChange={(event) => setStatusFilter(event.target.value)} value={statusFilter}>
            <option value="all">{t("admin.signatureRules.directory.statusAll")}</option>
            <option value="active">{t("admin.signatureRules.status.active")}</option>
            <option value="draft">{t("admin.signatureRules.status.draft")}</option>
            <option value="inactive">{t("admin.signatureRules.status.inactive")}</option>
            <option value="archived">{t("admin.signatureRules.status.archived")}</option>
          </SelectFilter>
          <SelectFilter aria-label={t("admin.signatureRules.directory.documentTypeFilter")} className="w-56" onChange={(event) => setDocumentTypeFilter(event.target.value)} value={documentTypeFilter}>
            <option value="all">{t("admin.signatureRules.directory.documentTypeAll")}</option>
            {documentTypes.map((documentType) => (
              <option key={documentType.id} value={documentType.id}>{documentType.name}</option>
            ))}
          </SelectFilter>
          <SelectFilter aria-label={t("admin.signatureRules.directory.originUnitFilter")} className="w-56" onChange={(event) => setOriginFilter(event.target.value)} value={originFilter}>
            <option value="all">{t("admin.signatureRules.directory.originAll")}</option>
            {unitTypes.map((unitType) => (
              <option key={unitType.id} value={unitType.id}>{unitType.name}</option>
            ))}
          </SelectFilter>
          <Button icon="reset" onClick={() => { setSearch(""); setStatusFilter("all"); setDocumentTypeFilter("all"); setOriginFilter("all"); }}>
            {t("admin.signatureRules.directory.reset")}
          </Button>
        </Toolbar>

        <DataTable
          columns={[
            {
              key: "ruleName",
              header: t("admin.signatureRules.directory.columns.ruleName"),
              cell: (row) => (
                <button
                  className={row.id === selectedChainId ? "block max-w-64 break-words text-start font-bold leading-5 text-[#061d49]" : "block max-w-64 break-words text-start font-semibold leading-5 text-[#061d49] hover:underline"}
                  onClick={() => onSelectChain(row.id)}
                  title={row.ruleName}
                  type="button"
                >
                  {row.ruleName}
                  <span className="force-ltr mt-1 block truncate text-start text-xs font-semibold text-slate-500" title={row.ruleCode}>{row.ruleCode}</span>
                </button>
              ),
              className: "w-72"
            },
            {
              key: "documentType",
              header: t("admin.signatureRules.directory.columns.documentType"),
              cell: (row) => <span className="block max-w-44 truncate" title={row.documentTypeLabel}>{row.documentTypeLabel}</span>,
              className: "w-48"
            },
            {
              key: "origin",
              header: t("admin.signatureRules.directory.columns.originUnit"),
              cell: (row) => <span className="block max-w-44 truncate" title={row.originUnitLabel}>{row.originUnitLabel}</span>,
              hideOnMobile: true,
              className: "w-48"
            },
            {
              key: "final",
              header: t("admin.signatureRules.directory.columns.finalSignatory"),
              cell: (row) => <span className="block max-w-48 truncate" title={row.finalSignatory}>{row.finalSignatory}</span>,
              hideOnMobile: true,
              className: "w-52"
            },
            {
              key: "visibility",
              header: t("admin.signatureRules.directory.columns.visibility"),
              cell: (row) => <span className="block max-w-40 truncate" title={row.visibilityPolicy}>{row.visibilityPolicy}</span>,
              hideOnMobile: true,
              className: "w-44"
            },
            {
              key: "status",
              header: t("admin.signatureRules.directory.columns.status"),
              cell: (row) => <StatusBadge tone={statusTone(row.status)}>{row.status}</StatusBadge>,
              className: "w-32"
            },
            {
              key: "lastUpdated",
              header: t("admin.signatureRules.directory.columns.lastUpdated"),
              cell: (row) => <span className="force-ltr block whitespace-nowrap text-start">{row.lastUpdated}</span>,
              hideOnMobile: true,
              className: "w-40"
            },
            {
              key: "actions",
              header: t("admin.signatureRules.directory.columns.actions"),
              cell: (row) => (
                <div className="flex items-center justify-end gap-1">
                  <IconButton
                    className="h-8 w-8 border-transparent"
                    icon="view"
                    label={t("admin.signatureRules.directory.view")}
                    onClick={() => {
                      if (onViewChain) {
                        onViewChain(row);
                      } else {
                        onSelectChain(row.id);
                      }
                    }}
                  />
                  <IconButton className="h-8 w-8 border-transparent" icon="edit" label={t("admin.signatureRules.directory.edit")} onClick={() => onEditChain?.(row)} />
                  <IconButton className="h-8 w-8 border-transparent" icon="users" label={t("admin.signatureRules.directory.signers")} onClick={() => onManageSigners?.(row)} />
                  <IconButton className="h-8 w-8 border-transparent" icon="more" label={t("admin.signatureRules.directory.more")} onClick={() => onOpenActions?.(row)} />
                </div>
              ),
              className: "sticky end-0 z-10 w-40 bg-white text-end group-hover:bg-slate-50/70"
            }
          ]}
          containerClassName="max-h-[30rem] overflow-auto"
          emptyLabel={t("admin.signatureRules.directory.empty")}
          getRowAriaLabel={(row) => row.ruleName}
          getRowClassName={(row) => row.id === selectedChainId ? "[&>td]:bg-blue-50/70 [&>td]:text-slate-900" : ""}
          getRowKey={(row) => row.id}
          onRowClick={(row) => onSelectChain(row.id)}
          rows={filteredRows}
          tableClassName="min-w-[86rem]"
        />
      </div>
    </PanelCard>
  );
}
