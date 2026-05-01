import { useI18n } from "../../../i18n";
import { Button, Icon, PanelCard, StatusBadge } from "../../ui";
import { formatLabel, groupTone, metadataObject, riskTone } from "./auditLogUtils";
import type { AuditLogRow, AuditRiskLevel } from "./types";

type AuditLogInspectorProps = {
  selectedLog: AuditLogRow | null;
};

function riskText(riskLevel: AuditRiskLevel, t: ReturnType<typeof useI18n>["t"]) {
  switch (riskLevel) {
    case "high":
      return t("admin.auditLogs.risk.high");
    case "medium":
      return t("admin.auditLogs.risk.medium");
    case "low":
      return t("admin.auditLogs.risk.low");
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

export function AuditLogInspector({ selectedLog }: AuditLogInspectorProps) {
  const { t } = useI18n();
  const metadata = selectedLog ? metadataObject(selectedLog) : null;
  const metadataEntries = metadata ? Object.entries(metadata).slice(0, 8) : [];

  return (
    <div className="space-y-3">
      <PanelCard className="overflow-hidden" title={t("admin.auditLogs.inspector.title")}>
        {selectedLog ? (
          <div className="space-y-4">
            <div className="flex gap-3">
              <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-blue-50 text-[#061d49] ring-1 ring-blue-200">
                <Icon className="h-7 w-7" name="shield" />
              </div>
              <div className="min-w-0">
                <h3 className="text-balance text-lg font-bold leading-6 text-slate-950">{formatLabel(selectedLog.action)}</h3>
                <p className="mt-1 font-mono text-sm font-semibold text-slate-500">{selectedLog.createdAt}</p>
                <div className="mt-2 flex flex-wrap gap-2">
                  <StatusBadge tone={groupTone(selectedLog.actionGroup)}>{formatLabel(selectedLog.actionGroup)}</StatusBadge>
                  <StatusBadge tone={riskTone(selectedLog.riskLevel)}>{riskText(selectedLog.riskLevel, t)}</StatusBadge>
                </div>
              </div>
            </div>

            <dl className="grid gap-2">
              <DetailRow label={t("admin.auditLogs.inspector.actor")} value={selectedLog.actor} />
              <DetailRow label={t("admin.auditLogs.inspector.assignment")} value={selectedLog.actorAssignment} />
              <DetailRow label={t("admin.auditLogs.inspector.action")} value={selectedLog.action} />
              <DetailRow label={t("admin.auditLogs.inspector.entity")} value={`${selectedLog.entityType} #${selectedLog.entityId}`} />
              <DetailRow label={t("admin.auditLogs.inspector.ipAddress")} value={selectedLog.ipAddress} />
              <DetailRow label={t("admin.auditLogs.inspector.userAgent")} value={selectedLog.userAgent} />
            </dl>

            <div className="grid gap-2 sm:grid-cols-2">
              <Button icon="view">{t("admin.auditLogs.inspector.viewEntity")}</Button>
              <Button icon="export">{t("admin.auditLogs.inspector.exportEvent")}</Button>
            </div>
          </div>
        ) : (
          <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
            {t("admin.auditLogs.inspector.empty")}
          </div>
        )}
      </PanelCard>

      {selectedLog ? (
        <PanelCard title={t("admin.auditLogs.metadata.title")}>
          {metadataEntries.length ? (
            <dl className="grid gap-2">
              {metadataEntries.map(([key, value]) => (
                <DetailRow
                  key={key}
                  label={formatLabel(key)}
                  value={typeof value === "string" ? value : JSON.stringify(value)}
                />
              ))}
            </dl>
          ) : (
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
              {t("admin.auditLogs.metadata.empty")}
            </div>
          )}
        </PanelCard>
      ) : null}
    </div>
  );
}
