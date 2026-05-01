import { useI18n } from "../../../i18n";
import { Button, Icon, PanelCard, StatusBadge } from "../../ui";
import { statusTone } from "./workflowRuleUtils";
import type { WorkflowRuleChecks, WorkflowRuleRow } from "./types";

type WorkflowRuleInspectorProps = {
  onCloneRule?: (row: WorkflowRuleRow) => void;
  onDisableRule?: (row: WorkflowRuleRow) => void;
  onEditRule?: (row: WorkflowRuleRow) => void;
  onPreviewRule?: (row: WorkflowRuleRow) => void;
  selectedRule: WorkflowRuleRow | null;
};

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50/70 px-3 py-2">
      <dt className="text-[0.68rem] font-bold uppercase tracking-wide text-slate-500">{label}</dt>
      <dd className="mt-1 min-w-0 whitespace-normal break-normal text-sm font-semibold leading-5 text-slate-900 [overflow-wrap:anywhere]">
        {value}
      </dd>
    </div>
  );
}

function checkItems(checks: WorkflowRuleChecks, t: ReturnType<typeof useI18n>["t"]) {
  return [
    [t("admin.workflowRules.checks.routingComplete"), checks.routingComplete],
    [t("admin.workflowRules.checks.signatureChainValid"), checks.signatureChainValid],
    [t("admin.workflowRules.checks.finalSignatureDefined"), checks.finalSignatureDefined],
    [t("admin.workflowRules.checks.serialTriggerSet"), checks.serialTriggerSet],
    [t("admin.workflowRules.checks.noConflictDetected"), checks.noConflictDetected]
  ] as Array<[string, boolean]>;
}

export function WorkflowRuleInspector({ onCloneRule, onDisableRule, onEditRule, onPreviewRule, selectedRule }: WorkflowRuleInspectorProps) {
  const { t } = useI18n();

  return (
    <div className="space-y-3">
      <PanelCard title={t("admin.workflowRules.inspector.title")}>
        {selectedRule ? (
          <div className="space-y-4">
            <div className="flex gap-3">
              <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-blue-50 text-[#061d49] ring-1 ring-blue-200">
                <Icon className="h-7 w-7" name="workflow" />
              </div>
              <div className="min-w-0">
                <h3 className="text-balance text-lg font-bold leading-6 text-slate-950">{selectedRule.ruleName}</h3>
                <p className="mt-1 text-sm font-semibold text-slate-500">{selectedRule.ruleCode}</p>
                <div className="mt-2 flex flex-wrap gap-2">
                  <StatusBadge tone={statusTone(selectedRule.status)}>{selectedRule.status}</StatusBadge>
                  <StatusBadge tone={selectedRule.allowed === "allowed" ? "green" : selectedRule.allowed === "denied" ? "red" : "amber"}>
                    {selectedRule.allowed}
                  </StatusBadge>
                </div>
              </div>
            </div>

            <dl className="grid gap-2">
              <DetailRow label={t("admin.workflowRules.inspector.ruleName")} value={selectedRule.ruleName} />
              <DetailRow label={t("admin.workflowRules.inspector.ruleCode")} value={selectedRule.ruleCode} />
              <DetailRow label={t("admin.workflowRules.inspector.finalizesAt")} value={selectedRule.finalSignatory} />
              <DetailRow label={t("admin.workflowRules.inspector.appliesTo")} value={selectedRule.documentTypeLabel} />
              <DetailRow label={t("admin.workflowRules.inspector.serialTrigger")} value={selectedRule.serialTrigger} />
              <DetailRow label={t("admin.workflowRules.inspector.visibilityPolicy")} value={selectedRule.visibilityPolicy} />
              <DetailRow label={t("admin.workflowRules.inspector.lastUpdated")} value={selectedRule.lastUpdated} />
              <DetailRow label={t("admin.workflowRules.inspector.updatedBy")} value={t("admin.topbar.systemAdmin")} />
            </dl>

            <div className="grid gap-2 sm:grid-cols-2">
              <Button icon="edit" onClick={() => onEditRule?.(selectedRule)}>{t("admin.workflowRules.inspector.editRule")}</Button>
              <Button icon="template" onClick={() => onCloneRule?.(selectedRule)}>{t("admin.workflowRules.inspector.cloneRule")}</Button>
              <Button icon="pause" onClick={() => onDisableRule?.(selectedRule)}>{t("admin.workflowRules.inspector.disableRule")}</Button>
              <Button icon="view" onClick={() => onPreviewRule?.(selectedRule)}>{t("admin.workflowRules.inspector.previewResult")}</Button>
            </div>
          </div>
        ) : (
          <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
            {t("admin.workflowRules.inspector.empty")}
          </div>
        )}
      </PanelCard>

      {selectedRule ? (
        <PanelCard title={t("admin.workflowRules.checks.title")}>
          <div className="space-y-3">
            {checkItems(selectedRule.checks, t).map(([label, ok]) => (
              <div className="flex items-center gap-3 text-sm" key={label}>
                <span className={`flex h-6 w-6 items-center justify-center rounded-full ${ok ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"}`}>
                  <Icon className="h-4 w-4" name={ok ? "activity" : "shield"} />
                </span>
                <span className="font-medium text-slate-700">{label}</span>
              </div>
            ))}
          </div>
        </PanelCard>
      ) : null}
    </div>
  );
}
