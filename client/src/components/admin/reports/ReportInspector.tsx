import { useI18n } from "../../../i18n";
import { Button, Icon, PanelCard, StatusBadge } from "../../ui";
import { categoryTone, statusTone } from "./reportUtils";
import type { ReportCategory, ReportRow, ReportStatus } from "./types";

type ReportInspectorProps = {
  selectedReport: ReportRow | null;
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

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50/70 px-3 py-2">
      <dt className="text-[0.68rem] font-bold uppercase tracking-wide text-slate-500">{label}</dt>
      <dd className="mt-1 whitespace-normal break-normal text-sm font-semibold leading-5 text-slate-900 [overflow-wrap:anywhere]">{value}</dd>
    </div>
  );
}

export function ReportInspector({ selectedReport }: ReportInspectorProps) {
  const { t } = useI18n();

  return (
    <div className="space-y-3">
      <PanelCard className="overflow-hidden" title={t("admin.reports.inspector.title")}>
        {selectedReport ? (
          <div className="space-y-4">
            <div className="flex gap-3">
              <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-blue-50 text-[#061d49] ring-1 ring-blue-200">
                <Icon className="h-7 w-7" name="reports" />
              </div>
              <div className="min-w-0">
                <h3 className="text-balance text-lg font-bold leading-6 text-slate-950">{t(selectedReport.nameKey)}</h3>
                <p className="mt-1 text-sm leading-5 text-slate-600">{t(selectedReport.descriptionKey)}</p>
                <div className="mt-2 flex flex-wrap gap-2">
                  <StatusBadge tone={categoryTone(selectedReport.category)}>{categoryLabel(selectedReport.category, t)}</StatusBadge>
                  <StatusBadge tone={statusTone(selectedReport.status)}>{statusLabel(selectedReport.status, t)}</StatusBadge>
                </div>
              </div>
            </div>

            <dl className="grid gap-2">
              <DetailRow label={t("admin.reports.inspector.category")} value={categoryLabel(selectedReport.category, t)} />
              <DetailRow label={t("admin.reports.inspector.primaryMetric")} value={`${selectedReport.metric} ${t(selectedReport.metricLabelKey)}`} />
              <DetailRow label={t("admin.reports.inspector.secondaryMetric")} value={`${selectedReport.secondaryMetric} ${t(selectedReport.secondaryMetricLabelKey)}`} />
              <DetailRow label={t("admin.reports.inspector.lastUpdated")} value={selectedReport.updatedAt} />
            </dl>

            <div className="grid gap-2 sm:grid-cols-2">
              <Button icon="reports" variant="primary">{t("admin.reports.inspector.generate")}</Button>
              <Button icon="export">{t("admin.reports.inspector.export")}</Button>
              <Button icon="clock">{t("admin.reports.inspector.schedule")}</Button>
              <Button icon="template">{t("admin.reports.inspector.clone")}</Button>
            </div>
          </div>
        ) : (
          <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
            {t("admin.reports.inspector.empty")}
          </div>
        )}
      </PanelCard>

      {selectedReport ? (
        <PanelCard title={t("admin.reports.checks.title")}>
          <div className="space-y-3">
            {selectedReport.checks.map((check) => (
              <div className="flex items-center gap-3 text-sm" key={check.labelKey}>
                <span className={check.ok ? "flex h-6 w-6 items-center justify-center rounded-full bg-emerald-50 text-emerald-700" : "flex h-6 w-6 items-center justify-center rounded-full bg-amber-50 text-amber-700"}>
                  <Icon className="h-4 w-4" name={check.ok ? "activity" : "shield"} />
                </span>
                <span className="font-medium text-slate-700">{checkLabel(check.labelKey, t)}</span>
              </div>
            ))}
          </div>
        </PanelCard>
      ) : null}
    </div>
  );
}
