import { useI18n } from "../../../i18n";
import { cx } from "../../../lib/classNames";
import { Button, Icon, PanelCard, StatusBadge } from "../../ui";
import { statusTone } from "./signatureRuleUtils";
import type { SignatureChainChecks, SignatureRuleChainRow } from "./types";

type SignatureRuleInspectorProps = {
  onCloneChain?: (row: SignatureRuleChainRow) => void;
  onDisableChain?: (row: SignatureRuleChainRow) => void;
  onEditChain?: (row: SignatureRuleChainRow) => void;
  onPreviewChain?: (row: SignatureRuleChainRow) => void;
  selectedChain: SignatureRuleChainRow | null;
};

function DetailRow({ label, ltr = false, value }: { label: string; ltr?: boolean; value: string }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50/70 px-3 py-2">
      <dt className="text-[0.68rem] font-bold uppercase tracking-wide text-slate-500">{label}</dt>
      <dd
        className={cx(
          "mt-1 text-sm font-semibold leading-5 text-slate-900",
          ltr ? "force-ltr truncate whitespace-nowrap text-start" : "whitespace-normal break-words [overflow-wrap:anywhere]"
        )}
        title={value}
      >
        {value}
      </dd>
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

export function SignatureRuleInspector({
  onCloneChain,
  onDisableChain,
  onEditChain,
  onPreviewChain,
  selectedChain
}: SignatureRuleInspectorProps) {
  const { t } = useI18n();

  return (
    <div className="space-y-3">
      <PanelCard bodyClassName="p-3 sm:p-4" className="overflow-hidden" title={t("admin.signatureRules.inspector.title")}>
        {selectedChain ? (
          <div className="space-y-3">
            <div className="flex min-w-0 items-start gap-3">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-blue-50 text-[#061d49] ring-1 ring-blue-200">
                <Icon className="h-6 w-6" name="signature" />
              </div>
              <div className="min-w-0">
                <h3 className="break-words text-base font-bold leading-6 text-slate-950">{selectedChain.ruleName}</h3>
                <p className="force-ltr mt-0.5 truncate text-start text-xs font-semibold text-slate-500" title={selectedChain.ruleCode}>{selectedChain.ruleCode}</p>
                <div className="mt-2 flex flex-wrap gap-2">
                  <StatusBadge tone={statusTone(selectedChain.status)}>{selectedChain.status}</StatusBadge>
                  <StatusBadge tone={selectedChain.chainMode === "sequential" ? "blue" : "amber"}>{selectedChain.chainMode}</StatusBadge>
                </div>
              </div>
            </div>

            <dl className="grid gap-2 sm:grid-cols-2">
              <DetailRow label={t("admin.signatureRules.inspector.ruleName")} value={selectedChain.ruleName} />
              <DetailRow label={t("admin.signatureRules.inspector.ruleCode")} ltr value={selectedChain.ruleCode} />
              <DetailRow label={t("admin.signatureRules.inspector.appliesTo")} value={selectedChain.documentTypeLabel} />
              <DetailRow label={t("admin.signatureRules.inspector.finalizesAt")} value={selectedChain.finalSignatory} />
              <DetailRow label={t("admin.signatureRules.inspector.serialTrigger")} value={selectedChain.serialTrigger} />
              <DetailRow label={t("admin.signatureRules.inspector.visibilityPolicy")} value={selectedChain.visibilityPolicy} />
              <DetailRow label={t("admin.signatureRules.inspector.lastUpdated")} ltr value={selectedChain.lastUpdated} />
              <DetailRow label={t("admin.signatureRules.inspector.updatedBy")} value={t("admin.topbar.systemAdmin")} />
            </dl>

            <div className="grid gap-2 sm:grid-cols-2">
              <Button className="min-h-9 px-3 py-1.5 text-xs" icon="edit" onClick={() => onEditChain?.(selectedChain)}>{t("admin.signatureRules.inspector.editRule")}</Button>
              <Button className="min-h-9 px-3 py-1.5 text-xs" icon="template" onClick={() => onCloneChain?.(selectedChain)}>{t("admin.signatureRules.inspector.cloneRule")}</Button>
              <Button className="min-h-9 px-3 py-1.5 text-xs" icon="pause" onClick={() => onDisableChain?.(selectedChain)} variant="danger">{t("admin.signatureRules.inspector.disableRule")}</Button>
              <Button className="min-h-9 px-3 py-1.5 text-xs" icon="view" onClick={() => onPreviewChain?.(selectedChain)}>{t("admin.signatureRules.inspector.previewResult")}</Button>
            </div>
          </div>
        ) : (
          <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
            {t("admin.signatureRules.inspector.empty")}
          </div>
        )}
      </PanelCard>

      {selectedChain ? (
        <PanelCard bodyClassName="p-3 sm:p-4" title={t("admin.signatureRules.checks.title")}>
          <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-1 min-[1800px]:grid-cols-2">
            {checkItems(selectedChain.checks, t).map(([label, ok]) => (
              <div className="flex min-w-0 items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm" key={label}>
                <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full ${ok ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"}`}>
                  <Icon className="h-4 w-4" name={ok ? "activity" : "shield"} />
                </span>
                <span className="min-w-0 truncate font-medium text-slate-700" title={label}>{label}</span>
              </div>
            ))}
          </div>
        </PanelCard>
      ) : null}
    </div>
  );
}
