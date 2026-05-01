import { useI18n } from "../../../i18n";
import { Icon, PanelCard, StatusBadge } from "../../ui";
import type { WorkflowConflictRow, WorkflowWarningIssue } from "./types";

type WorkflowConflictQueueProps = {
  onViewAll?: () => void;
  rows: WorkflowConflictRow[];
};

function issueText(issue: WorkflowWarningIssue, t: ReturnType<typeof useI18n>["t"]) {
  switch (issue) {
    case "missing_signature_chain":
      return t("admin.workflowRules.conflicts.issue.missingSignatureChain");
    case "missing_final_signature":
      return t("admin.workflowRules.conflicts.issue.missingFinalSignature");
    case "missing_visibility_policy":
      return t("admin.workflowRules.conflicts.issue.missingVisibilityPolicy");
    case "inactive_rule":
      return t("admin.workflowRules.conflicts.issue.inactiveRule");
    case "denied_rule":
      return t("admin.workflowRules.conflicts.issue.deniedRule");
    case "optional_route":
      return t("admin.workflowRules.conflicts.issue.optionalRoute");
    case "route_signature_mismatch":
      return t("admin.workflowRules.conflicts.issue.routeSignatureMismatch");
  }
}

function severityText(severity: WorkflowConflictRow["severity"], t: ReturnType<typeof useI18n>["t"]) {
  switch (severity) {
    case "high":
      return t("admin.workflowRules.conflicts.severity.high");
    case "medium":
      return t("admin.workflowRules.conflicts.severity.medium");
    case "low":
      return t("admin.workflowRules.conflicts.severity.low");
  }
}

function severityTone(severity: WorkflowConflictRow["severity"]): "green" | "amber" | "red" | "blue" | "slate" {
  switch (severity) {
    case "high":
      return "red";
    case "medium":
      return "amber";
    case "low":
      return "blue";
  }
}

export function WorkflowConflictQueue({ onViewAll, rows }: WorkflowConflictQueueProps) {
  const { t } = useI18n();
  const visibleRows = rows.slice(0, 5);

  return (
    <PanelCard
      actions={rows.length ? <button className="text-sm font-bold text-[#061d49] hover:underline" onClick={onViewAll} type="button">{t("admin.workflowRules.conflicts.viewAll")}</button> : null}
      title={t("admin.workflowRules.conflicts.title")}
    >
      {visibleRows.length ? (
        <div className="space-y-3">
          {visibleRows.map((row) => (
            <article className="flex gap-3 rounded-lg border border-slate-200 bg-white p-3" key={row.id}>
              <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-amber-50 text-amber-700">
                <Icon className="h-5 w-5" name="shield" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="break-words text-sm font-semibold text-slate-900">{row.ruleName}: {issueText(row.issue, t)}</p>
                <p className="mt-1 text-xs text-slate-500">{row.date}</p>
              </div>
              <StatusBadge tone={severityTone(row.severity)}>{severityText(row.severity, t)}</StatusBadge>
            </article>
          ))}
        </div>
      ) : (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-sm font-semibold text-emerald-800">
          {t("admin.workflowRules.conflicts.empty")}
        </div>
      )}
    </PanelCard>
  );
}
