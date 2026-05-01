import { useI18n } from "../../../i18n";
import { Button, Icon, PanelCard, StatusBadge } from "../../ui";
import { statusTone } from "./signatureRuleUtils";
import type { SignatureChainChecks, SignatureRuleChainRow } from "./types";

type SignatureRuleInspectorProps = {
  selectedChain: SignatureRuleChainRow | null;
};

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50/70 px-3 py-2">
      <dt className="text-[0.68rem] font-bold uppercase tracking-wide text-slate-500">{label}</dt>
      <dd className="mt-1 whitespace-normal break-normal text-sm font-semibold leading-5 text-slate-900 [overflow-wrap:anywhere]">{value}</dd>
    </div>
  );
}

function checkItems(checks: SignatureChainChecks, t: ReturnType<typeof useI18n>["t"]) {
  return [
    [t("admin.signatureRules.checks.chainComplete"), checks.signatureChainComplete],
    [t("admin.signatureRules.checks.finalDefined"), checks.finalSignatoryDefined],
    [t("admin.signatureRules.checks.serialSet"), checks.serialTriggerSet],
    [t("admin.signatureRules.checks.visibilitySet"), checks.visibilityPolicySet],
    [t("admin.signatureRules.checks.noConflict"), checks.noConflictDetected]
  ] as Array<[string, boolean]>;
}

export function SignatureRuleInspector({ selectedChain }: SignatureRuleInspectorProps) {
  const { t } = useI18n();

  return (
    <div className="space-y-3">
      <PanelCard className="overflow-hidden" title={t("admin.signatureRules.inspector.title")}>
        {selectedChain ? (
          <div className="space-y-4">
            <div className="flex gap-3">
              <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-blue-50 text-[#061d49] ring-1 ring-blue-200">
                <Icon className="h-7 w-7" name="signature" />
              </div>
              <div className="min-w-0">
                <h3 className="text-balance text-lg font-bold leading-6 text-slate-950">{selectedChain.ruleName}</h3>
                <p className="mt-1 text-sm font-semibold text-slate-500">{selectedChain.ruleCode}</p>
                <div className="mt-2 flex flex-wrap gap-2">
                  <StatusBadge tone={statusTone(selectedChain.status)}>{selectedChain.status}</StatusBadge>
                  <StatusBadge tone={selectedChain.chainMode === "sequential" ? "blue" : "amber"}>{selectedChain.chainMode}</StatusBadge>
                </div>
              </div>
            </div>

            <dl className="grid gap-2">
              <DetailRow label={t("admin.signatureRules.inspector.ruleName")} value={selectedChain.ruleName} />
              <DetailRow label={t("admin.signatureRules.inspector.ruleCode")} value={selectedChain.ruleCode} />
              <DetailRow label={t("admin.signatureRules.inspector.appliesTo")} value={selectedChain.documentTypeLabel} />
              <DetailRow label={t("admin.signatureRules.inspector.finalizesAt")} value={selectedChain.finalSignatory} />
              <DetailRow label={t("admin.signatureRules.inspector.serialTrigger")} value={selectedChain.serialTrigger} />
              <DetailRow label={t("admin.signatureRules.inspector.visibilityPolicy")} value={selectedChain.visibilityPolicy} />
              <DetailRow label={t("admin.signatureRules.inspector.lastUpdated")} value={selectedChain.lastUpdated} />
              <DetailRow label={t("admin.signatureRules.inspector.updatedBy")} value={t("admin.topbar.systemAdmin")} />
            </dl>

            <div className="grid gap-2 sm:grid-cols-2">
              <Button icon="edit">{t("admin.signatureRules.inspector.editRule")}</Button>
              <Button icon="template">{t("admin.signatureRules.inspector.cloneRule")}</Button>
              <Button icon="pause" variant="danger">{t("admin.signatureRules.inspector.disableRule")}</Button>
              <Button icon="view">{t("admin.signatureRules.inspector.previewResult")}</Button>
            </div>
          </div>
        ) : (
          <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
            {t("admin.signatureRules.inspector.empty")}
          </div>
        )}
      </PanelCard>

      {selectedChain ? (
        <PanelCard title={t("admin.signatureRules.checks.title")}>
          <div className="space-y-3">
            {checkItems(selectedChain.checks, t).map(([label, ok]) => (
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
