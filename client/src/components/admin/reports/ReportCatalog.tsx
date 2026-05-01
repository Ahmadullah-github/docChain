import { useMemo, useState } from "react";
import { useI18n } from "../../../i18n";
import { Button, DataTable, IconButton, SearchInput, SelectFilter, StatusBadge, Toolbar } from "../../ui";
import { categoryTone, normalizeSearch, rowMatchesSearch, statusTone } from "./reportUtils";
import type { ReportCategory, ReportRow, ReportStatus } from "./types";

type ReportCatalogProps = {
  onSelectReport: (reportId: string) => void;
  reports: ReportRow[];
  selectedReportId: string | null;
};

function categoryLabel(category: ReportCategory, t: ReturnType<typeof useI18n>["t"]) {
  switch (category) {
    case "documents":
      return t("admin.reports.category.documents");
    case "workflow":
      return t("admin.reports.category.workflow");
    case "structure":
      return t("admin.reports.category.structure");
    case "authority":
      return t("admin.reports.category.authority");
    case "security":
      return t("admin.reports.category.security");
    case "serial":
      return t("admin.reports.category.serial");
  }
}

function statusLabel(status: ReportStatus, t: ReturnType<typeof useI18n>["t"]) {
  switch (status) {
    case "ready":
      return t("admin.reports.status.ready");
    case "review":
      return t("admin.reports.status.review");
    case "empty":
      return t("admin.reports.status.empty");
  }
}

export function ReportCatalog({ onSelectReport, reports, selectedReportId }: ReportCatalogProps) {
  const { t } = useI18n();
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");

  const filteredReports = useMemo(() => {
    const normalized = normalizeSearch(search);

    return reports.filter((report) => {
      const labels = {
        category: categoryLabel(report.category, t),
        description: t(report.descriptionKey),
        name: t(report.nameKey)
      };
      const matchesSearch = rowMatchesSearch(report, normalized, labels);
      const matchesCategory = categoryFilter === "all" || report.category === categoryFilter;
      const matchesStatus = statusFilter === "all" || report.status === statusFilter;
      return matchesSearch && matchesCategory && matchesStatus;
    });
  }, [categoryFilter, reports, search, statusFilter, t]);

  return (
    <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
      <header className="border-b border-slate-200 px-4 py-3">
        <h2 className="text-base font-bold text-slate-950">{t("admin.reports.catalog.title")}</h2>
      </header>
      <div className="space-y-3 p-4">
        <Toolbar>
          <SearchInput
            onChange={(event) => setSearch(event.target.value)}
            placeholder={t("admin.reports.catalog.search")}
            value={search}
            wrapperClassName="min-w-[14rem] flex-[1_1_18rem]"
          />
          <SelectFilter aria-label={t("admin.reports.catalog.categoryFilter")} onChange={(event) => setCategoryFilter(event.target.value)} value={categoryFilter}>
            <option value="all">{t("admin.reports.catalog.categoryAll")}</option>
            <option value="documents">{t("admin.reports.category.documents")}</option>
            <option value="workflow">{t("admin.reports.category.workflow")}</option>
            <option value="structure">{t("admin.reports.category.structure")}</option>
            <option value="authority">{t("admin.reports.category.authority")}</option>
            <option value="security">{t("admin.reports.category.security")}</option>
            <option value="serial">{t("admin.reports.category.serial")}</option>
          </SelectFilter>
          <SelectFilter aria-label={t("admin.reports.catalog.statusFilter")} onChange={(event) => setStatusFilter(event.target.value)} value={statusFilter}>
            <option value="all">{t("admin.reports.catalog.statusAll")}</option>
            <option value="ready">{t("admin.reports.status.ready")}</option>
            <option value="review">{t("admin.reports.status.review")}</option>
            <option value="empty">{t("admin.reports.status.empty")}</option>
          </SelectFilter>
          <Button icon="reset" onClick={() => { setSearch(""); setCategoryFilter("all"); setStatusFilter("all"); }}>
            {t("admin.reports.catalog.reset")}
          </Button>
        </Toolbar>

        <DataTable
          columns={[
            {
              key: "report",
              header: t("admin.reports.catalog.columns.report"),
              cell: (row) => (
                <button
                  className={row.id === selectedReportId ? "block max-w-72 break-words text-start font-bold leading-5 text-[#061d49]" : "block max-w-72 break-words text-start font-semibold leading-5 text-[#061d49] hover:underline"}
                  onClick={() => onSelectReport(row.id)}
                  type="button"
                >
                  {t(row.nameKey)}
                </button>
              ),
              className: "w-80"
            },
            {
              key: "category",
              header: t("admin.reports.catalog.columns.category"),
              cell: (row) => <StatusBadge tone={categoryTone(row.category)}>{categoryLabel(row.category, t)}</StatusBadge>
            },
            {
              key: "metric",
              header: t("admin.reports.catalog.columns.metric"),
              cell: (row) => (
                <span className="font-semibold text-slate-800">{row.metric} <span className="text-xs text-slate-500">{t(row.metricLabelKey)}</span></span>
              )
            },
            {
              key: "status",
              header: t("admin.reports.catalog.columns.status"),
              cell: (row) => <StatusBadge tone={statusTone(row.status)}>{statusLabel(row.status, t)}</StatusBadge>
            },
            {
              key: "updated",
              header: t("admin.reports.catalog.columns.updated"),
              cell: (row) => <span className="whitespace-nowrap text-xs font-semibold text-slate-600">{row.updatedAt}</span>,
              hideOnMobile: true
            },
            {
              key: "actions",
              header: t("admin.reports.catalog.columns.actions"),
              cell: (row) => (
                <div className="flex items-center justify-end gap-1">
                  <IconButton className="h-8 w-8 border-transparent" icon="view" label={t("admin.reports.catalog.view")} onClick={() => onSelectReport(row.id)} />
                  <IconButton className="h-8 w-8 border-transparent" icon="export" label={t("admin.reports.catalog.export")} />
                  <IconButton className="h-8 w-8 border-transparent" icon="more" label={t("admin.reports.catalog.more")} />
                </div>
              ),
              className: "w-28 text-end"
            }
          ]}
          emptyLabel={t("admin.reports.catalog.empty")}
          getRowKey={(row) => row.id}
          rows={filteredReports}
        />
      </div>
    </section>
  );
}
