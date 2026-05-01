import { useI18n } from "../../../i18n";
import { Button, Icon, PanelCard, StatusBadge } from "../../ui";
import { categoryTone } from "./reportUtils";
import type { ReportIssue, ReportIssueType } from "./types";

type ReportIssueQueueProps = {
  issues: ReportIssue[];
};

function issueText(issue: ReportIssueType, t: ReturnType<typeof useI18n>["t"]) {
  switch (issue) {
    case "no_documents":
      return t("admin.reports.issues.noDocuments");
    case "no_active_assignments":
      return t("admin.reports.issues.noActiveAssignments");
    case "workflow_warnings":
      return t("admin.reports.issues.workflowWarnings");
    case "serial_not_ready":
      return t("admin.reports.issues.serialNotReady");
    case "audit_sparse":
      return t("admin.reports.issues.auditSparse");
  }
}

function severityTone(severity: ReportIssue["severity"]): "green" | "amber" | "red" | "blue" | "slate" {
  switch (severity) {
    case "high":
      return "red";
    case "medium":
      return "amber";
    case "low":
      return "blue";
  }
}

function severityText(severity: ReportIssue["severity"], t: ReturnType<typeof useI18n>["t"]) {
  switch (severity) {
    case "high":
      return t("admin.reports.issues.severity.high");
    case "medium":
      return t("admin.reports.issues.severity.medium");
    case "low":
      return t("admin.reports.issues.severity.low");
  }
}

function categoryText(category: ReportIssue["category"], t: ReturnType<typeof useI18n>["t"]) {
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

export function ReportIssueQueue({ issues }: ReportIssueQueueProps) {
  const { t } = useI18n();
  const visibleIssues = issues.slice(0, 5);

  return (
    <PanelCard
      actions={issues.length ? <StatusBadge tone="amber">{String(issues.length)}</StatusBadge> : null}
      className="overflow-hidden"
      title={t("admin.reports.issues.title")}
    >
      {visibleIssues.length ? (
        <div className="space-y-3">
          {visibleIssues.map((issue) => (
            <article className="flex flex-col gap-3 rounded-lg border border-slate-200 bg-white p-3 sm:flex-row" key={issue.id}>
              <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-orange-50 text-orange-600">
                <Icon className="h-5 w-5" name="shield" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="break-words text-sm font-bold text-slate-900">{issueText(issue.issue, t)}</p>
                <div className="mt-2 flex flex-wrap gap-2">
                  <StatusBadge tone={categoryTone(issue.category)}>{categoryText(issue.category, t)}</StatusBadge>
                  <StatusBadge tone={severityTone(issue.severity)}>{severityText(issue.severity, t)}</StatusBadge>
                </div>
              </div>
              <Button className="shrink-0 px-3 py-1.5 text-xs">{t("admin.reports.issues.view")}</Button>
            </article>
          ))}
        </div>
      ) : (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-sm font-semibold text-emerald-800">
          {t("admin.reports.issues.empty")}
        </div>
      )}
    </PanelCard>
  );
}
