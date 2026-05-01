import { useI18n } from "../../../i18n";
import { Icon, PanelCard, StatusBadge } from "../../ui";
import type { AuditLogRow } from "./types";

type AuditActorPanelProps = {
  rows: AuditLogRow[];
  selectedLog: AuditLogRow | null;
};

export function AuditActorPanel({ rows, selectedLog }: AuditActorPanelProps) {
  const { t } = useI18n();

  if (!selectedLog) {
    return (
      <PanelCard className="h-full overflow-hidden" title={t("admin.auditLogs.actor.title")}>
        <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
          {t("admin.auditLogs.actor.empty")}
        </div>
      </PanelCard>
    );
  }

  const actorEvents = rows.filter((row) => row.actorUserId && row.actorUserId === selectedLog.actorUserId);
  const highRiskEvents = actorEvents.filter((row) => row.riskLevel === "high").length;
  const lastEvent = actorEvents[0]?.createdAt || selectedLog.createdAt;

  return (
    <PanelCard className="h-full overflow-hidden" title={t("admin.auditLogs.actor.title")}>
      <div className="space-y-4">
        <section className="rounded-2xl border border-blue-200 bg-[radial-gradient(circle_at_top,#dbeafe,transparent_42%),linear-gradient(180deg,#fff,#eff6ff)] p-5">
          <div className="flex items-start gap-3">
            <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-white text-[#061d49] ring-1 ring-blue-200">
              <Icon className="h-6 w-6" name="users" />
            </span>
            <div className="min-w-0">
              <p className="text-xs font-bold uppercase tracking-wide text-blue-700">{t("admin.auditLogs.actor.selectedActor")}</p>
              <h3 className="mt-1 break-words text-xl font-black text-[#061d49]">{selectedLog.actor}</h3>
              <p className="mt-1 break-words text-sm font-semibold text-slate-600">{selectedLog.actorAssignment}</p>
            </div>
          </div>
        </section>

        <div className="grid gap-3 sm:grid-cols-3">
          <article className="rounded-xl border border-slate-200 bg-white p-3">
            <p className="text-xs font-bold uppercase tracking-wide text-slate-500">{t("admin.auditLogs.actor.events")}</p>
            <p className="mt-1 text-2xl font-black text-slate-950">{actorEvents.length || 1}</p>
          </article>
          <article className="rounded-xl border border-slate-200 bg-white p-3">
            <p className="text-xs font-bold uppercase tracking-wide text-slate-500">{t("admin.auditLogs.actor.highRisk")}</p>
            <p className="mt-1 text-2xl font-black text-slate-950">{highRiskEvents}</p>
          </article>
          <article className="rounded-xl border border-slate-200 bg-white p-3">
            <p className="text-xs font-bold uppercase tracking-wide text-slate-500">{t("admin.auditLogs.actor.lastSeen")}</p>
            <p className="mt-1 break-words text-sm font-bold text-slate-950">{lastEvent}</p>
          </article>
        </div>

        <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm leading-6 text-slate-700">
          <div className="flex flex-wrap gap-2">
            <StatusBadge tone="blue">{selectedLog.ipAddress}</StatusBadge>
            <StatusBadge tone={highRiskEvents ? "amber" : "green"}>
              {highRiskEvents ? t("admin.auditLogs.actor.reviewNeeded") : t("admin.auditLogs.actor.normal")}
            </StatusBadge>
          </div>
        </div>
      </div>
    </PanelCard>
  );
}
