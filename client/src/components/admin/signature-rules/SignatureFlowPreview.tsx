import { cx } from "../../../lib/classNames";
import { useI18n } from "../../../i18n";
import { Button, Icon, PanelCard } from "../../ui";
import type { SignatureFlowStep, SignatureRuleChainRow, SignatureStepTone } from "./types";

type SignatureFlowPreviewProps = {
  selectedChain: SignatureRuleChainRow | null;
};

const stepClasses: Record<SignatureStepTone, string> = {
  final: "border-red-300 bg-red-50 text-red-700",
  optional: "border-amber-300 bg-amber-50 text-amber-700",
  required: "border-emerald-300 bg-emerald-50 text-emerald-800",
  system: "border-blue-300 bg-blue-50 text-[#061d49]",
  warning: "border-orange-300 bg-orange-50 text-orange-700"
};

const dotClasses: Record<SignatureStepTone, string> = {
  final: "bg-red-600",
  optional: "bg-amber-500",
  required: "bg-emerald-600",
  system: "bg-blue-600",
  warning: "bg-orange-500"
};

function FlowStep({ index, step }: { index: number; step: SignatureFlowStep }) {
  const numbered = step.tone === "required" || step.tone === "optional" || step.tone === "final";

  return (
    <article className={cx("flex w-full max-w-[20rem] items-center gap-3 rounded-lg border px-3 py-2.5 shadow-sm", stepClasses[step.tone])}>
      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-white/90 text-xs font-bold">
        {numbered ? index : <Icon className="h-4 w-4" name={step.icon} />}
      </span>
      <span className="min-w-0 flex-1 text-center">
        <span className="block truncate text-sm font-bold">{step.title}</span>
        <span className="block truncate text-xs opacity-80">{step.subtitle}</span>
      </span>
    </article>
  );
}

export function SignatureFlowPreview({ selectedChain }: SignatureFlowPreviewProps) {
  const { t } = useI18n();

  return (
    <PanelCard
      actions={<Button className="px-3 py-1.5 text-xs" icon="fullscreen">{t("admin.signatureRules.flow.fitView")}</Button>}
      className="h-full overflow-hidden"
      title={t("admin.signatureRules.flow.title")}
    >
      {selectedChain ? (
        <div className="space-y-3">
          <div className="max-h-[29rem] overflow-auto rounded-xl bg-[radial-gradient(circle_at_top,#eff6ff,transparent_38%),linear-gradient(180deg,#fff,#f8fafc)] p-4">
            <div className="flex min-w-[17rem] flex-col items-center">
              {selectedChain.flowSteps.map((step, index) => (
                <div className="flex w-full flex-col items-center" key={step.id}>
                  <FlowStep index={index} step={step} />
                  {index < selectedChain.flowSteps.length - 1 ? <div className="h-4 w-px bg-[#061d49]/30" /> : null}
                </div>
              ))}
            </div>
          </div>
          <aside className="rounded-lg border border-dashed border-slate-300 bg-white p-3 text-xs text-slate-600">
            <p className="font-bold text-slate-950">{t("admin.signatureRules.flow.legend")}</p>
            {([
              ["required", t("admin.signatureRules.flow.requiredStep")],
              ["optional", t("admin.signatureRules.flow.optionalStep")],
              ["final", t("admin.signatureRules.flow.finalStep")],
              ["system", t("admin.signatureRules.flow.systemStep")]
            ] as Array<[SignatureStepTone, string]>).map(([tone, label]) => (
              <div className="me-3 mt-2 inline-flex items-center gap-2" key={tone}>
                <span className={cx("h-2.5 w-2.5 rounded-full", dotClasses[tone])} />
                <span>{label}</span>
              </div>
            ))}
          </aside>
        </div>
      ) : (
        <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
          {t("admin.signatureRules.flow.empty")}
        </div>
      )}
    </PanelCard>
  );
}
