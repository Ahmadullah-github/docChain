import { useI18n } from "../../../i18n";
import { Icon, PanelCard, StatusBadge } from "../../ui";
import type { IconName } from "../../ui";
import { statusTone } from "./reportUtils";
import type { ReportRow, ReportStatus } from "./types";

type ReportInsightPanelProps = {
  reports: ReportRow[];
  selectedReport: ReportRow | null;
};

function InsightBar({ icon, label, value, max }: { icon: IconName; label: string; max: number; value: number }) {
  const width = max ? Math.max(8, Math.round((value / max) * 100)) : 0;

  return (
    <article className="rounded-xl border border-slate-200 bg-white p-3">
      <div className="flex items-center gap-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-[#061d49]">
          <Icon className="h-5 w-5" name={icon} />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-3">
            <p className="truncate text-sm font-bold text-slate-800">{label}</p>
            <p className="text-sm font-black text-slate-950">{value}</p>
          </div>
          <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-100">
            <div className="h-full rounded-full bg-[#061d49]" style={{ width: `${width}%` }} />
          </div>
        </div>
      </div>
    </article>
  );
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

export function ReportInsightPanel({ reports, selectedReport }: ReportInsightPanelProps) {
  const { t } = useI18n();
  const ready = reports.filter((report) => report.status === "ready").length;
  const review = reports.filter((report) => report.status === "review").length;
  const empty = reports.filter((report) => report.status === "empty").length;
  const max = Math.max(ready, review, empty, 1);

  return (
    <PanelCard className="h-full overflow-hidden" title={t("admin.reports.insights.title")}>
      <div className="space-y-4">
        <section className="rounded-2xl border border-blue-200 bg-[radial-gradient(circle_at_top,#dbeafe,transparent_42%),linear-gradient(180deg,#fff,#eff6ff)] p-5">
          <p className="text-xs font-bold uppercase tracking-wide text-blue-700">{t("admin.reports.insights.selectedStatus")}</p>
          <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
            <h3 className="text-2xl font-black text-[#061d49]">{selectedReport ? t(selectedReport.nameKey) : t("admin.reports.insights.noReport")}</h3>
            {selectedReport ? <StatusBadge tone={statusTone(selectedReport.status)}>{statusLabel(selectedReport.status, t)}</StatusBadge> : null}
          </div>
          <p className="mt-3 text-sm leading-6 text-slate-700">{t("admin.reports.insights.note")}</p>
        </section>

        <div className="grid gap-3">
          <InsightBar icon="activity" label={t("admin.reports.status.ready")} max={max} value={ready} />
          <InsightBar icon="shield" label={t("admin.reports.status.review")} max={max} value={review} />
          <InsightBar icon="clock" label={t("admin.reports.status.empty")} max={max} value={empty} />
        </div>
      </div>
    </PanelCard>
  );
}
