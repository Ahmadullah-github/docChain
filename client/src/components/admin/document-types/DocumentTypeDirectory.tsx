import { useMemo, useState } from "react";
import type { EntityId } from "../../../api";
import { useI18n } from "../../../i18n";
import { Button, DataTable, IconButton, SearchInput, SelectFilter, StatusBadge, Toolbar } from "../../ui";
import { normalizeSearch, rowMatchesSearch, statusTone } from "./documentTypeUtils";
import type { DocumentTypeRow } from "./types";

type DocumentTypeDirectoryProps = {
  onEditType?: (row: DocumentTypeRow) => void;
  onOpenTypeActions?: (row: DocumentTypeRow) => void;
  onSelectType: (typeId: EntityId) => void;
  rows: DocumentTypeRow[];
  selectedTypeId: EntityId | null;
};

export function DocumentTypeDirectory({ onEditType, onOpenTypeActions, onSelectType, rows, selectedTypeId }: DocumentTypeDirectoryProps) {
  const { t } = useI18n();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");

  const filteredRows = useMemo(() => {
    const normalized = normalizeSearch(search);

    return rows.filter((row) => {
      const matchesSearch = rowMatchesSearch(row, normalized);
      const matchesStatus = statusFilter === "all" || row.status === statusFilter;

      return matchesSearch && matchesStatus;
    });
  }, [rows, search, statusFilter]);

  return (
    <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
      <header className="border-b border-slate-200 px-4 py-3">
        <h2 className="text-base font-bold text-slate-950">{t("admin.documentTypes.directory.title")}</h2>
      </header>
      <div className="space-y-3 p-4">
        <Toolbar>
          <SearchInput
            onChange={(event) => setSearch(event.target.value)}
            placeholder={t("admin.documentTypes.directory.search")}
            value={search}
            wrapperClassName="min-w-[14rem] flex-[1_1_18rem]"
          />
          <SelectFilter aria-label={t("admin.documentTypes.directory.statusFilter")} onChange={(event) => setStatusFilter(event.target.value)} value={statusFilter}>
            <option value="all">{t("admin.documentTypes.directory.statusAll")}</option>
            <option value="active">{t("admin.documentTypes.status.active")}</option>
            <option value="draft">{t("admin.documentTypes.status.draft")}</option>
            <option value="inactive">{t("admin.documentTypes.status.inactive")}</option>
            <option value="archived">{t("admin.documentTypes.status.archived")}</option>
          </SelectFilter>
          <Button icon="reset" onClick={() => { setSearch(""); setStatusFilter("all"); }}>
            {t("admin.documentTypes.directory.reset")}
          </Button>
        </Toolbar>

        <DataTable
          columns={[
            {
              key: "name",
              header: t("admin.documentTypes.directory.columns.name"),
              cell: (row) => (
                <button
                  className={row.id === selectedTypeId ? "block max-w-60 break-words text-start font-bold leading-5 text-[#061d49]" : "block max-w-60 break-words text-start font-semibold leading-5 text-[#061d49] hover:underline"}
                  onClick={() => onSelectType(row.id)}
                  type="button"
                >
                  {row.name}
                </button>
              ),
              className: "w-64"
            },
            {
              key: "code",
              header: t("admin.documentTypes.directory.columns.code"),
              cell: (row) => <span className="font-mono text-xs font-bold text-slate-700">{row.code}</span>
            },
            {
              key: "serial",
              header: t("admin.documentTypes.directory.columns.serial"),
              cell: (row) => (
                <StatusBadge tone="green">{t("common.yes")}</StatusBadge>
              )
            },
            {
              key: "templates",
              header: t("admin.documentTypes.directory.columns.templates"),
              cell: (row) => <span className="font-semibold text-slate-800">{row.templateBindingsCount}</span>,
              hideOnMobile: true
            },
            {
              key: "status",
              header: t("admin.documentTypes.directory.columns.status"),
              cell: (row) => <StatusBadge tone={statusTone(row.status)}>{row.status}</StatusBadge>
            },
            {
              key: "actions",
              header: t("admin.documentTypes.directory.columns.actions"),
              cell: (row) => (
                <div className="flex items-center justify-end gap-1">
                  <IconButton className="h-8 w-8 border-transparent" icon="view" label={t("admin.documentTypes.directory.view")} onClick={() => onSelectType(row.id)} />
                  <IconButton className="h-8 w-8 border-transparent" disabled={!onEditType} icon="edit" label={t("admin.documentTypes.directory.edit")} onClick={() => onEditType?.(row)} />
                  <IconButton className="h-8 w-8 border-transparent" disabled={!onOpenTypeActions} icon="more" label={t("admin.documentTypes.directory.more")} onClick={() => onOpenTypeActions?.(row)} />
                </div>
              ),
              className: "w-28 text-end"
            }
          ]}
          emptyLabel={t("admin.documentTypes.directory.empty")}
          getRowKey={(row) => row.id}
          rows={filteredRows}
        />
      </div>
    </section>
  );
}
