import { useState } from "react";
import { useI18n } from "../../../i18n";
import { Icon, IconButton, PanelCard } from "../../ui";
import { cx } from "../../../lib/classNames";
import { AdminModal } from "../AdminModal";
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
  const [zoom, setZoom] = useState(1);
  const [expanded, setExpanded] = useState(false);
  const zoomClass = zoom >= 1.2 ? "scale-125 origin-top" : zoom <= 0.85 ? "scale-90 origin-top" : "scale-100 origin-top";

  function zoomIn() {
    setZoom((value) => Math.min(1.25, value + 0.15));
  }

  function zoomOut() {
    setZoom((value) => Math.max(0.85, value - 0.15));
  }

  function CanvasBody({ large = false }: { large?: boolean }) {
    if (!selectedRule) {
      return (
        <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
          {t("admin.workflowRules.canvas.empty")}
        </div>
      );
    }

    return (
      <div className={cx("grid gap-4 lg:grid-cols-[minmax(0,1fr)_8rem]", large ? "min-h-[32rem]" : "min-h-[24rem]")}>
        <div className={cx("overflow-auto rounded-xl bg-[radial-gradient(circle_at_top,#eff6ff,transparent_38%),linear-gradient(180deg,#fff,#f8fafc)] p-4", large ? "max-h-[65vh]" : "max-h-[34rem]")}>
          <div className={cx("flex min-w-[18rem] flex-col items-center transition-transform", zoomClass)}>
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
    );
  }

  return (
    <>
      <PanelCard
        actions={(
          <div className="flex items-center gap-1">
            <IconButton className="h-8 w-8" disabled={!selectedRule} icon="fullscreen" label={t("admin.workflowRules.canvas.expand")} onClick={() => setExpanded(true)} />
            <IconButton className="h-8 w-8" disabled={!selectedRule || zoom >= 1.2} icon="zoomIn" label={t("admin.workflowRules.canvas.zoomIn")} onClick={zoomIn} />
            <IconButton className="h-8 w-8" disabled={!selectedRule || zoom <= 0.85} icon="zoomOut" label={t("admin.workflowRules.canvas.zoomOut")} onClick={zoomOut} />
          </div>
        )}
        className="h-full"
        title={t("admin.workflowRules.canvas.title")}
      >
        <CanvasBody />
      </PanelCard>
      <AdminModal
        onClose={() => setExpanded(false)}
        open={expanded}
        size="lg"
        title={selectedRule?.ruleName || t("admin.workflowRules.canvas.title")}
      >
        <CanvasBody large />
      </AdminModal>
    </>
  );
}
