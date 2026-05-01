import { useI18n } from "../../../i18n";
import { Button, Icon, PanelCard, StatusBadge } from "../../ui";
import type { SerialConflictRow, SerialWarningIssue } from "./types";

type SerialConflictQueueProps = {
  rows: SerialConflictRow[];
};

function issueText(issue: SerialWarningIssue, t: ReturnType<typeof useI18n>["t"]) {
  switch (issue) {
    case "inactive_rule":
      return t("admin.serialSettings.conflicts.issue.inactiveRule");
    case "missing_default":
      return t("admin.serialSettings.conflicts.issue.missingDefault");
    case "missing_year_token":
      return t("admin.serialSettings.conflicts.issue.missingYearToken");
    case "missing_sequence_token":
      return t("admin.serialSettings.conflicts.issue.missingSequenceToken");
    case "short_padding":
      return t("admin.serialSettings.conflicts.issue.shortPadding");
    case "no_serial_documents":
      return t("admin.serialSettings.conflicts.issue.noSerialDocuments");
  }
}

function severityTone(severity: SerialConflictRow["severity"]): "green" | "amber" | "red" | "blue" | "slate" {
  switch (severity) {
    case "high":
      return "red";
    case "medium":
      return "amber";
    case "low":
      return "blue";
  }
}

function severityText(severity: SerialConflictRow["severity"], t: ReturnType<typeof useI18n>["t"]) {
  switch (severity) {
    case "high":
      return t("admin.serialSettings.conflicts.severity.high");
    case "medium":
      return t("admin.serialSettings.conflicts.severity.medium");
    case "low":
      return t("admin.serialSettings.conflicts.severity.low");
  }
}

export function SerialConflictQueue({ rows }: SerialConflictQueueProps) {
  const { t } = useI18n();
  const visibleRows = rows.slice(0, 5);

  return (
    <PanelCard
      actions={rows.length ? <StatusBadge tone="amber">{String(rows.length)}</StatusBadge> : null}
      className="overflow-hidden"
      title={t("admin.serialSettings.conflicts.title")}
    >
      {visibleRows.length ? (
        <div className="space-y-3">
          {visibleRows.map((row) => (
            <article className="flex flex-col gap-3 rounded-lg border border-slate-200 bg-white p-3 sm:flex-row" key={row.id}>
              <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-orange-50 text-orange-600">
                <Icon className="h-5 w-5" name="shield" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="break-words text-sm font-bold text-slate-900">{row.ruleName}: {issueText(row.issue, t)}</p>
                <p className="mt-1 text-xs text-slate-500">{row.ruleCode} · {row.date}</p>
              </div>
              <div className="flex shrink-0 flex-row items-center gap-2 sm:flex-col sm:items-end">
                <StatusBadge tone={severityTone(row.severity)}>{severityText(row.severity, t)}</StatusBadge>
                <Button className="px-3 py-1.5 text-xs">{t("admin.serialSettings.conflicts.view")}</Button>
              </div>
            </article>
          ))}
        </div>
      ) : (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-sm font-semibold text-emerald-800">
          {t("admin.serialSettings.conflicts.empty")}
        </div>
      )}
    </PanelCard>
  );
}
