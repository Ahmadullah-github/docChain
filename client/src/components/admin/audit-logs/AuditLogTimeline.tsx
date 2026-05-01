import type { EntityId } from "../../../api";
import { useI18n } from "../../../i18n";
import { Icon, PanelCard, StatusBadge } from "../../ui";
import { formatLabel, groupTone } from "./auditLogUtils";
import type { AuditLogRow } from "./types";

type AuditLogTimelineProps = {
  onSelectLog: (logId: EntityId) => void;
  rows: AuditLogRow[];
  selectedLogId: EntityId | null;
};

export function AuditLogTimeline({ onSelectLog, rows, selectedLogId }: AuditLogTimelineProps) {
  const { t } = useI18n();
  const visibleRows = rows.slice(0, 6);

  return (
    <PanelCard className="overflow-hidden" title={t("admin.auditLogs.timeline.title")}>
      {visibleRows.length ? (
        <div className="space-y-3">
          {visibleRows.map((row) => (
            <article className="flex gap-3" key={row.id}>
              <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-blue-50 text-[#061d49] ring-1 ring-blue-100">
                <Icon className="h-4 w-4" name="audit" />
              </span>
              <button
                className={row.id === selectedLogId
                  ? "min-w-0 flex-1 rounded-lg border border-blue-200 bg-blue-50/80 px-3 py-2 text-start shadow-sm"
                  : "min-w-0 flex-1 rounded-lg border border-slate-200 bg-white px-3 py-2 text-start transition hover:border-slate-300 hover:bg-slate-50"}
                onClick={() => onSelectLog(row.id)}
                type="button"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="break-words text-sm font-bold text-slate-900">{formatLabel(row.action)}</p>
                  <StatusBadge tone={groupTone(row.actionGroup)}>{formatLabel(row.actionGroup)}</StatusBadge>
                </div>
                <p className="mt-1 text-xs leading-5 text-slate-500">
                  <span className="truncate">{row.actor}</span>
                  <span aria-hidden="true"> · </span>
                  <span className="force-ltr whitespace-nowrap">{row.createdAt}</span>
                </p>
              </button>
            </article>
          ))}
        </div>
      ) : (
        <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
          {t("admin.auditLogs.timeline.empty")}
        </div>
      )}
    </PanelCard>
  );
}
