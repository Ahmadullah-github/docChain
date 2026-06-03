import { useI18n } from "../../../i18n";
import { Icon, PanelCard, StatusBadge } from "../../ui";
import type { IconName } from "../../ui";
import { readinessScore } from "./documentTypeUtils";
import type { DocumentTypeRow } from "./types";

type DocumentTypeCoveragePanelProps = {
  selectedType: DocumentTypeRow | null;
};

function CoverageCard({
  attentionLabel,
  count,
  icon,
  label,
  ok,
  readyLabel
}: {
  attentionLabel: string;
  count: string;
  icon: IconName;
  label: string;
  ok: boolean;
  readyLabel: string;
}) {
  return (
    <article className="rounded-xl border border-slate-200 bg-white p-3">
      <div className="flex items-center justify-between gap-3">
        <span className={ok ? "flex h-10 w-10 items-center justify-center rounded-lg bg-emerald-50 text-emerald-700" : "flex h-10 w-10 items-center justify-center rounded-lg bg-amber-50 text-amber-700"}>
          <Icon className="h-5 w-5" name={icon} />
        </span>
        <StatusBadge tone={ok ? "green" : "amber"}>{ok ? readyLabel : attentionLabel}</StatusBadge>
      </div>
      <p className="mt-3 text-sm font-bold text-slate-900">{label}</p>
      <p className="mt-1 text-xs font-semibold text-slate-500">{count}</p>
    </article>
  );
}

export function DocumentTypeCoveragePanel({ selectedType }: DocumentTypeCoveragePanelProps) {
  const { t } = useI18n();

  if (!selectedType) {
    return (
      <PanelCard className="h-full overflow-hidden" title={t("admin.documentTypes.coverage.title")}>
        <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
          {t("admin.documentTypes.coverage.empty")}
        </div>
      </PanelCard>
    );
  }

  const score = readinessScore(selectedType);
  const totalChecks = Object.keys(selectedType.checks).length;
  const percent = Math.round((score / totalChecks) * 100);

  return (
    <PanelCard className="h-full overflow-hidden" title={t("admin.documentTypes.coverage.title")}>
      <div className="space-y-4">
        <section className="rounded-2xl border border-slate-200 bg-[linear-gradient(135deg,#f8fafc,#eef6ff)] p-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-xs font-bold uppercase tracking-wide text-slate-500">{t("admin.documentTypes.coverage.readiness")}</p>
              <p className="mt-1 text-3xl font-black text-[#061d49]">{score}/{totalChecks}</p>
            </div>
            <StatusBadge tone={score === totalChecks ? "green" : "amber"}>
              {score === totalChecks ? t("admin.documentTypes.coverage.ready") : t("admin.documentTypes.coverage.attention")}
            </StatusBadge>
          </div>
          <div className="mt-4 h-2 overflow-hidden rounded-full bg-white ring-1 ring-slate-200">
            <div className="h-full rounded-full bg-[#061d49]" style={{ width: `${percent}%` }} />
          </div>
        </section>

        <div className="grid gap-3 sm:grid-cols-2">
          <CoverageCard
            count={selectedType.status}
            icon="activity"
            label={t("admin.documentTypes.checks.activeType")}
            ok={selectedType.checks.activeType}
            readyLabel={t("admin.documentTypes.coverage.ready")}
            attentionLabel={t("admin.documentTypes.coverage.attention")}
          />
          <CoverageCard
            count={t("admin.documentTypes.coverage.countTemplates", { count: selectedType.templateBindingsCount })}
            icon="template"
            label={t("admin.documentTypes.coverage.templateReady")}
            ok={selectedType.checks.templateReady}
            readyLabel={t("admin.documentTypes.coverage.ready")}
            attentionLabel={t("admin.documentTypes.coverage.attention")}
          />
          <CoverageCard
            count={t("admin.documentTypes.coverage.required")}
            icon="serial"
            label={t("admin.documentTypes.coverage.serialReady")}
            ok={selectedType.checks.serialReady}
            readyLabel={t("admin.documentTypes.coverage.ready")}
            attentionLabel={t("admin.documentTypes.coverage.attention")}
          />
        </div>
      </div>
    </PanelCard>
  );
}
