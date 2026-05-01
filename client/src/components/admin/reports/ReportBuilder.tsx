import { useI18n } from "../../../i18n";
import { Button, Icon, PanelCard, SelectFilter, StatusBadge } from "../../ui";
import { categoryTone, statusTone } from "./reportUtils";
import type { ReportRow } from "./types";

type ReportBuilderProps = {
  onSelectPeriod: (period: string) => void;
  onSelectReport: (reportId: string) => void;
  reports: ReportRow[];
  selectedPeriod: string;
  selectedReport: ReportRow | null;
};

function CheckPill({ label, ok }: { label: string; ok: boolean }) {
  return (
    <span className={ok ? "inline-flex items-center gap-2 rounded-full bg-emerald-50 px-3 py-1 text-xs font-bold text-emerald-700 ring-1 ring-emerald-200" : "inline-flex items-center gap-2 rounded-full bg-amber-50 px-3 py-1 text-xs font-bold text-amber-700 ring-1 ring-amber-200"}>
      <Icon className="h-3.5 w-3.5" name={ok ? "activity" : "shield"} />
      {label}
    </span>
  );
}

function checkLabel(labelKey: ReportRow["checks"][number]["labelKey"], t: ReturnType<typeof useI18n>["t"]) {
  switch (labelKey) {
    case "dataAvailable":
      return t("admin.reports.checks.dataAvailable");
    case "coverageReady":
      return t("admin.reports.checks.coverageReady");
    case "auditReady":
      return t("admin.reports.checks.auditReady");
    case "exportReady":
      return t("admin.reports.checks.exportReady");
  }
}

function categoryLabel(category: ReportRow["category"], t: ReturnType<typeof useI18n>["t"]) {
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

function statusLabel(status: ReportRow["status"], t: ReturnType<typeof useI18n>["t"]) {
  switch (status) {
    case "ready":
      return t("admin.reports.status.ready");
    case "review":
      return t("admin.reports.status.review");
    case "empty":
      return t("admin.reports.status.empty");
  }
}

export function ReportBuilder({ onSelectPeriod, onSelectReport, reports, selectedPeriod, selectedReport }: ReportBuilderProps) {
  const { t } = useI18n();

  return (
    <PanelCard className="h-full overflow-hidden" title={t("admin.reports.builder.title")}>
      {selectedReport ? (
        <div className="space-y-4">
          <section className="rounded-2xl border border-blue-100 bg-[radial-gradient(circle_at_top_left,#dbeafe,transparent_34%),linear-gradient(135deg,#fff,#f8fbff)] p-4">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
              <div className="min-w-0">
                <p className="text-xs font-bold uppercase tracking-wide text-blue-700">{t("admin.reports.builder.selectedReport")}</p>
                <h2 className="mt-2 text-balance text-2xl font-black leading-7 text-[#061d49]">{t(selectedReport.nameKey)}</h2>
                <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">{t(selectedReport.descriptionKey)}</p>
              </div>
              <div className="flex shrink-0 flex-wrap gap-2">
                <StatusBadge tone={categoryTone(selectedReport.category)}>{categoryLabel(selectedReport.category, t)}</StatusBadge>
                <StatusBadge tone={statusTone(selectedReport.status)}>{statusLabel(selectedReport.status, t)}</StatusBadge>
              </div>
            </div>
          </section>

          <section className="rounded-xl border border-slate-100 bg-slate-50/60 p-4">
            <div className="grid gap-3 md:grid-cols-2">
              <label className="min-w-0 space-y-1 text-xs font-bold text-slate-600">
                <span>{t("admin.reports.builder.reportPack")}</span>
                <SelectFilter className="w-full min-w-0" value={selectedReport.id} onChange={(event) => onSelectReport(event.target.value)}>
                  {reports.map((report) => (
                    <option key={report.id} value={report.id}>{t(report.nameKey)}</option>
                  ))}
                </SelectFilter>
              </label>
              <label className="min-w-0 space-y-1 text-xs font-bold text-slate-600">
                <span>{t("admin.reports.builder.period")}</span>
                <SelectFilter className="w-full min-w-0" value={selectedPeriod} onChange={(event) => onSelectPeriod(event.target.value)}>
                  <option value="last_7_days">{t("admin.reports.period.last7Days")}</option>
                  <option value="last_30_days">{t("admin.reports.period.last30Days")}</option>
                  <option value="quarter">{t("admin.reports.period.quarter")}</option>
                  <option value="all_time">{t("admin.reports.period.allTime")}</option>
                </SelectFilter>
              </label>
            </div>
          </section>

          <section className="grid gap-3 sm:grid-cols-2">
            <article className="rounded-xl border border-slate-200 bg-white p-4">
              <p className="text-xs font-bold uppercase tracking-wide text-slate-500">{t(selectedReport.metricLabelKey)}</p>
              <p className="mt-2 text-3xl font-black text-slate-950">{selectedReport.metric}</p>
            </article>
            <article className="rounded-xl border border-slate-200 bg-white p-4">
              <p className="text-xs font-bold uppercase tracking-wide text-slate-500">{t(selectedReport.secondaryMetricLabelKey)}</p>
              <p className="mt-2 text-3xl font-black text-slate-950">{selectedReport.secondaryMetric}</p>
            </article>
          </section>

          <div className="flex flex-wrap gap-2">
            {selectedReport.checks.map((check) => (
              <CheckPill key={check.labelKey} label={checkLabel(check.labelKey, t)} ok={check.ok} />
            ))}
          </div>

          <div className="grid gap-2 sm:grid-cols-3">
            <Button icon="reports" variant="primary">{t("admin.reports.builder.generate")}</Button>
            <Button icon="export">{t("admin.reports.builder.export")}</Button>
            <Button icon="clock">{t("admin.reports.builder.schedule")}</Button>
          </div>
        </div>
      ) : (
        <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
          {t("admin.reports.builder.empty")}
        </div>
      )}
    </PanelCard>
  );
}
