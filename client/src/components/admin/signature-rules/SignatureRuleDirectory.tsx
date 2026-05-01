import { useMemo, useState } from "react";
import type { DocumentType, UnitType } from "../../../api";
import { useI18n } from "../../../i18n";
import { Button, DataTable, IconButton, SearchInput, SelectFilter, StatusBadge, Toolbar } from "../../ui";
import { normalizeSearch, rowMatchesSearch, statusTone } from "./signatureRuleUtils";
import type { SignatureRuleChainRow } from "./types";

type SignatureRuleDirectoryProps = {
  documentTypes: DocumentType[];
  onSelectChain: (chainId: string) => void;
  rows: SignatureRuleChainRow[];
  selectedChainId: string | null;
  unitTypes: UnitType[];
};

export function SignatureRuleDirectory({
  documentTypes,
  onSelectChain,
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
    <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
      <header className="border-b border-slate-200 px-4 py-3">
        <h2 className="text-base font-bold text-slate-950">{t("admin.signatureRules.directory.title")}</h2>
      </header>
      <div className="space-y-3 p-4">
        <Toolbar>
          <SelectFilter aria-label={t("admin.signatureRules.directory.statusFilter")} onChange={(event) => setStatusFilter(event.target.value)} value={statusFilter}>
            <option value="all">{t("admin.signatureRules.directory.statusAll")}</option>
            <option value="active">{t("admin.signatureRules.status.active")}</option>
            <option value="draft">{t("admin.signatureRules.status.draft")}</option>
            <option value="inactive">{t("admin.signatureRules.status.inactive")}</option>
            <option value="archived">{t("admin.signatureRules.status.archived")}</option>
          </SelectFilter>
          <SelectFilter aria-label={t("admin.signatureRules.directory.documentTypeFilter")} onChange={(event) => setDocumentTypeFilter(event.target.value)} value={documentTypeFilter}>
            <option value="all">{t("admin.signatureRules.directory.documentTypeAll")}</option>
            {documentTypes.map((documentType) => (
              <option key={documentType.id} value={documentType.id}>{documentType.name}</option>
            ))}
          </SelectFilter>
          <SelectFilter aria-label={t("admin.signatureRules.directory.originUnitFilter")} onChange={(event) => setOriginFilter(event.target.value)} value={originFilter}>
            <option value="all">{t("admin.signatureRules.directory.originAll")}</option>
            {unitTypes.map((unitType) => (
              <option key={unitType.id} value={unitType.id}>{unitType.name}</option>
            ))}
          </SelectFilter>
          <SearchInput
            onChange={(event) => setSearch(event.target.value)}
            placeholder={t("admin.signatureRules.directory.search")}
            value={search}
            wrapperClassName="min-w-[14rem] flex-[1_1_18rem]"
          />
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
                  className={row.id === selectedChainId ? "block max-w-56 break-words text-start font-bold leading-5 text-[#061d49]" : "block max-w-56 break-words text-start font-semibold leading-5 text-[#061d49] hover:underline"}
                  onClick={() => onSelectChain(row.id)}
                  type="button"
                >
                  {row.ruleName}
                </button>
              ),
              className: "w-64"
            },
            {
              key: "documentType",
              header: t("admin.signatureRules.directory.columns.documentType"),
              cell: (row) => row.documentTypeLabel,
              className: "w-40"
            },
            {
              key: "origin",
              header: t("admin.signatureRules.directory.columns.originUnit"),
              cell: (row) => row.originUnitLabel,
              hideOnMobile: true
            },
            {
              key: "final",
              header: t("admin.signatureRules.directory.columns.finalSignatory"),
              cell: (row) => row.finalSignatory,
              hideOnMobile: true
            },
            {
              key: "visibility",
              header: t("admin.signatureRules.directory.columns.visibility"),
              cell: (row) => row.visibilityPolicy,
              hideOnMobile: true
            },
            {
              key: "status",
              header: t("admin.signatureRules.directory.columns.status"),
              cell: (row) => <StatusBadge tone={statusTone(row.status)}>{row.status}</StatusBadge>
            },
            {
              key: "lastUpdated",
              header: t("admin.signatureRules.directory.columns.lastUpdated"),
              cell: (row) => row.lastUpdated,
              hideOnMobile: true
            },
            {
              key: "actions",
              header: t("admin.signatureRules.directory.columns.actions"),
              cell: (row) => (
                <div className="flex items-center justify-end gap-1">
                  <IconButton className="h-8 w-8 border-transparent" icon="view" label={t("admin.signatureRules.directory.view")} onClick={() => onSelectChain(row.id)} />
                  <IconButton className="h-8 w-8 border-transparent" icon="edit" label={t("admin.signatureRules.directory.edit")} />
                  <IconButton className="h-8 w-8 border-transparent" icon="users" label={t("admin.signatureRules.directory.signers")} />
                  <IconButton className="h-8 w-8 border-transparent" icon="more" label={t("admin.signatureRules.directory.more")} />
                </div>
              ),
              className: "w-32 text-end"
            }
          ]}
          emptyLabel={t("admin.signatureRules.directory.empty")}
          getRowKey={(row) => row.id}
          rows={filteredRows}
        />
        <p className="text-sm text-slate-500">{t("admin.signatureRules.directory.showing", { count: filteredRows.length })}</p>
      </div>
    </section>
  );
}
