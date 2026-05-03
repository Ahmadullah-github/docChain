import type { KeyboardEvent } from "react";
import { useI18n } from "../../../i18n";
import { cx } from "../../../lib/classNames";
import { Button, Icon, PanelCard, StatusBadge } from "../../ui";
import type { SignatureConflictRow, SignatureWarningIssue } from "./types";

type SignatureConflictQueueProps = {
  onSelectChain?: (chainId: string) => void;
  rows: SignatureConflictRow[];
};

function issueText(issue: SignatureWarningIssue, t: ReturnType<typeof useI18n>["t"]) {
  switch (issue) {
    case "missing_signature_chain":
      return t("admin.signatureRules.conflicts.issue.missingSignatureChain");
    case "missing_final_signature":
      return t("admin.signatureRules.conflicts.issue.missingFinalSignature");
    case "missing_visibility_policy":
      return t("admin.signatureRules.conflicts.issue.missingVisibilityPolicy");
    case "missing_serial_rule":
      return t("admin.signatureRules.conflicts.issue.missingSerialRule");
    case "inactive_chain":
      return t("admin.signatureRules.conflicts.issue.inactiveChain");
    case "optional_step":
      return t("admin.signatureRules.conflicts.issue.optionalStep");
  }
}

function severityTone(severity: SignatureConflictRow["severity"]): "green" | "amber" | "red" | "blue" | "slate" {
  switch (severity) {
    case "high":
      return "red";
    case "medium":
      return "amber";
    case "low":
      return "blue";
  }
}

function severityText(severity: SignatureConflictRow["severity"], t: ReturnType<typeof useI18n>["t"]) {
  switch (severity) {
    case "high":
      return t("admin.signatureRules.conflicts.severity.high");
    case "medium":
      return t("admin.signatureRules.conflicts.severity.medium");
    case "low":
      return t("admin.signatureRules.conflicts.severity.low");
  }
}

function handleRowKeyDown(event: KeyboardEvent<HTMLElement>, row: SignatureConflictRow, onSelectChain?: (chainId: string) => void) {
  if (!onSelectChain || (event.key !== "Enter" && event.key !== " ")) {
    return;
  }

  event.preventDefault();
  onSelectChain(row.chainId);
}

export function SignatureConflictQueue({ onSelectChain, rows }: SignatureConflictQueueProps) {
  const { t } = useI18n();
  const visibleRows = rows.slice(0, 4);

  return (
    <PanelCard
      actions={rows.length ? <StatusBadge tone="amber">{String(rows.length)}</StatusBadge> : null}
      className="overflow-hidden"
      title={t("admin.signatureRules.conflicts.title")}
    >
      {visibleRows.length ? (
        <div className="space-y-3">
          {visibleRows.map((row) => (
            <article
              aria-label={`${row.ruleName}: ${issueText(row.issue, t)}`}
              className={cx(
                "flex flex-col gap-3 rounded-lg border border-slate-200 bg-white p-3 transition sm:flex-row",
                onSelectChain && "cursor-pointer hover:border-blue-200 hover:bg-blue-50/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#061d49]/20"
              )}
              key={row.id}
              onClick={() => onSelectChain?.(row.chainId)}
              onKeyDown={(event) => handleRowKeyDown(event, row, onSelectChain)}
              role={onSelectChain ? "button" : undefined}
              tabIndex={onSelectChain ? 0 : undefined}
            >
              <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-orange-50 text-orange-600">
                <Icon className="h-5 w-5" name="shield" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="break-words text-sm font-bold text-slate-900">{row.ruleName}: {issueText(row.issue, t)}</p>
                <p className="force-ltr mt-1 truncate text-start text-xs text-slate-500" title={`${row.ruleCode} - ${row.date}`}>{row.ruleCode} · {row.date}</p>
              </div>
              <div className="flex shrink-0 flex-row items-center gap-2 sm:flex-col sm:items-end">
                <StatusBadge tone={severityTone(row.severity)}>{severityText(row.severity, t)}</StatusBadge>
                <Button
                  className="px-3 py-1.5 text-xs"
                  onClick={(event) => {
                    event.stopPropagation();
                    onSelectChain?.(row.chainId);
                  }}
                >
                  {t("admin.signatureRules.conflicts.view")}
                </Button>
              </div>
            </article>
          ))}
        </div>
      ) : (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-sm font-semibold text-emerald-800">
          {t("admin.signatureRules.conflicts.empty")}
        </div>
      )}
    </PanelCard>
  );
}
