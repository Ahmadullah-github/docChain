import { useI18n } from "../../../i18n";
import { Icon, IconButton, PanelCard } from "../../ui";
import { cx } from "../../../lib/classNames";
import type { WorkflowCanvasStep, WorkflowRuleRow, WorkflowStepTone } from "./types";

type WorkflowCanvasProps = {
  selectedRule: WorkflowRuleRow | null;
};

const stepToneClasses: Record<WorkflowStepTone, string> = {
  active: "border-blue-300 bg-blue-50 text-[#061d49]",
  final: "border-purple-300 bg-purple-50 text-purple-800",
  optional: "border-amber-300 bg-amber-50 text-amber-800",
  system: "border-emerald-300 bg-emerald-50 text-emerald-800",
  warning: "border-red-300 bg-red-50 text-red-700"
};

const dotToneClasses: Record<WorkflowStepTone, string> = {
  active: "bg-blue-600",
  final: "bg-purple-600",
  optional: "bg-amber-500",
  system: "bg-emerald-600",
  warning: "bg-red-600"
};

function CanvasStep({ step }: { step: WorkflowCanvasStep }) {
  return (
    <div className="relative flex flex-col items-center">
      <article className={cx("flex w-full max-w-[19rem] items-center gap-3 rounded-lg border px-3 py-2.5 shadow-sm", stepToneClasses[step.tone])}>
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white/80">
          <Icon className="h-5 w-5" name={step.icon} />
        </span>
        <span className="min-w-0">
          <span className="block truncate text-sm font-bold leading-5">{step.title}</span>
          <span className="block max-w-[15rem] truncate text-xs leading-4 opacity-80">{step.subtitle}</span>
        </span>
      </article>
    </div>
  );
}

export function WorkflowCanvas({ selectedRule }: WorkflowCanvasProps) {
  const { t } = useI18n();

  return (
    <PanelCard
      actions={(
        <div className="flex items-center gap-1">
          <IconButton className="h-8 w-8" icon="fullscreen" label={t("admin.workflowRules.canvas.expand")} />
          <IconButton className="h-8 w-8" icon="zoomIn" label={t("admin.workflowRules.canvas.zoomIn")} />
          <IconButton className="h-8 w-8" icon="zoomOut" label={t("admin.workflowRules.canvas.zoomOut")} />
        </div>
      )}
      className="h-full"
      title={t("admin.workflowRules.canvas.title")}
    >
      {selectedRule ? (
        <div className="grid min-h-[24rem] gap-4 lg:grid-cols-[minmax(0,1fr)_8rem]">
          <div className="max-h-[34rem] overflow-auto rounded-xl bg-[radial-gradient(circle_at_top,#eff6ff,transparent_38%),linear-gradient(180deg,#fff,#f8fafc)] p-4">
            <div className="flex min-w-[18rem] flex-col items-center">
              {selectedRule.canvasSteps.map((step, index) => (
                <div className="flex w-full flex-col items-center" key={step.id}>
                  <CanvasStep step={step} />
                  {index < selectedRule.canvasSteps.length - 1 ? (
                    <div className="h-4 w-px bg-[#061d49]/30" />
                  ) : null}
                </div>
              ))}
            </div>
          </div>
          <aside className="self-end rounded-lg border border-dashed border-slate-300 bg-white p-3 text-xs text-slate-600">
            <p className="mb-3 font-bold text-slate-950">{t("admin.workflowRules.canvas.legend")}</p>
            {([
              ["active", t("admin.workflowRules.canvas.activeStep")],
              ["optional", t("admin.workflowRules.canvas.optionalStep")],
              ["final", t("admin.workflowRules.canvas.finalStep")],
              ["system", t("admin.workflowRules.canvas.systemStep")],
              ["warning", t("admin.workflowRules.canvas.warning")]
            ] as Array<[WorkflowStepTone, string]>).map(([tone, label]) => (
              <div className="mt-2 flex items-center gap-2" key={tone}>
                <span className={cx("h-2.5 w-2.5 rounded-full", dotToneClasses[tone])} />
                <span>{label}</span>
              </div>
            ))}
          </aside>
        </div>
      ) : (
        <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
          {t("admin.workflowRules.canvas.empty")}
        </div>
      )}
    </PanelCard>
  );
}
