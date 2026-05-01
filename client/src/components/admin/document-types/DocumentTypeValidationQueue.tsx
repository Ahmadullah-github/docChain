import { useI18n } from "../../../i18n";
import { Button, Icon, PanelCard, StatusBadge } from "../../ui";
import type { DocumentTypeConflictRow, DocumentTypeWarningIssue } from "./types";

type DocumentTypeValidationQueueProps = {
  rows: DocumentTypeConflictRow[];
};

function issueText(issue: DocumentTypeWarningIssue, t: ReturnType<typeof useI18n>["t"]) {
  switch (issue) {
    case "inactive_type":
      return t("admin.documentTypes.conflicts.issue.inactiveType");
    case "missing_routing":
      return t("admin.documentTypes.conflicts.issue.missingRouting");
    case "missing_signature":
      return t("admin.documentTypes.conflicts.issue.missingSignature");
    case "missing_visibility":
      return t("admin.documentTypes.conflicts.issue.missingVisibility");
    case "missing_serial_rule":
      return t("admin.documentTypes.conflicts.issue.missingSerialRule");
  }
}

function severityTone(severity: DocumentTypeConflictRow["severity"]): "green" | "amber" | "red" | "blue" | "slate" {
  switch (severity) {
    case "high":
      return "red";
    case "medium":
      return "amber";
    case "low":
      return "blue";
  }
}

function severityText(severity: DocumentTypeConflictRow["severity"], t: ReturnType<typeof useI18n>["t"]) {
  switch (severity) {
    case "high":
      return t("admin.documentTypes.conflicts.severity.high");
    case "medium":
      return t("admin.documentTypes.conflicts.severity.medium");
    case "low":
      return t("admin.documentTypes.conflicts.severity.low");
  }
}

export function DocumentTypeValidationQueue({ rows }: DocumentTypeValidationQueueProps) {
  const { t } = useI18n();
  const visibleRows = rows.slice(0, 5);

  return (
    <PanelCard
      actions={rows.length ? <StatusBadge tone="amber">{String(rows.length)}</StatusBadge> : null}
      className="overflow-hidden"
      title={t("admin.documentTypes.conflicts.title")}
    >
      {visibleRows.length ? (
        <div className="space-y-3">
          {visibleRows.map((row) => (
            <article className="flex flex-col gap-3 rounded-lg border border-slate-200 bg-white p-3 sm:flex-row" key={row.id}>
              <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-orange-50 text-orange-600">
                <Icon className="h-5 w-5" name="shield" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="break-words text-sm font-bold text-slate-900">{row.typeName}: {issueText(row.issue, t)}</p>
                <p className="mt-1 font-mono text-xs text-slate-500">{row.typeCode}</p>
              </div>
              <div className="flex shrink-0 flex-row items-center gap-2 sm:flex-col sm:items-end">
                <StatusBadge tone={severityTone(row.severity)}>{severityText(row.severity, t)}</StatusBadge>
                <Button className="px-3 py-1.5 text-xs">{t("admin.documentTypes.conflicts.view")}</Button>
              </div>
            </article>
          ))}
        </div>
      ) : (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-sm font-semibold text-emerald-800">
          {t("admin.documentTypes.conflicts.empty")}
        </div>
      )}
    </PanelCard>
  );
}
