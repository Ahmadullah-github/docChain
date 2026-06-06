import type { DocumentWorkflowRouteStep, DocumentWorkflowSummary } from "../../api";
import { cx } from "../../lib/classNames";

type DocumentWorkflowRouteProps = {
  className?: string;
  maxSteps?: number;
  summary?: DocumentWorkflowSummary | null;
};

type VisibleStep = DocumentWorkflowRouteStep | {
  overflow: true;
  count: number;
  label: string;
  status: "pending";
};

const dotClasses: Record<DocumentWorkflowRouteStep["status"], string> = {
  blocked: "border-red-500 bg-red-500 text-white",
  completed: "border-emerald-600 bg-emerald-600 text-white",
  current: "border-blue-600 bg-white text-blue-700 ring-4 ring-blue-100",
  pending: "border-slate-300 bg-white text-slate-400"
};

const lineClasses: Record<DocumentWorkflowRouteStep["status"], string> = {
  blocked: "bg-red-200",
  completed: "bg-emerald-500",
  current: "bg-blue-300",
  pending: "bg-slate-200"
};

function compactSteps(steps: DocumentWorkflowRouteStep[], maxSteps: number): VisibleStep[] {
  if (steps.length <= maxSteps) {
    return steps;
  }
  const hidden = steps.length - 4;
  return [
    ...steps.slice(0, 2),
    { count: hidden, label: `+${hidden}`, overflow: true, status: "pending" },
    ...steps.slice(-2)
  ];
}

function isOverflowStep(step: VisibleStep): step is Extract<VisibleStep, { overflow: true }> {
  return "overflow" in step;
}

export function DocumentWorkflowRoute({ className, maxSteps = 5, summary }: DocumentWorkflowRouteProps) {
  const steps = compactSteps(summary?.routeSteps || [], maxSteps);
  if (!steps.length) {
    return null;
  }

  return (
    <ol className={cx("grid min-w-0 grid-flow-col auto-cols-fr items-start gap-0", className)}>
      {steps.map((step, index) => {
        const status = step.status;
        const isLast = index === steps.length - 1;

        return (
          <li className="relative min-w-0" key={isOverflowStep(step) ? `overflow-${index}` : `${step.documentTaskId || step.workflowEventId || step.label}-${index}`}>
            {!isLast ? <span className={cx("absolute left-[calc(50%+0.75rem)] right-[calc(-50%+0.75rem)] top-3 h-px", lineClasses[status])} /> : null}
            <div className="relative flex min-w-0 flex-col items-center px-1 text-center">
              <span className={cx("grid h-6 w-6 place-items-center rounded-full border-2 text-[10px] font-black", dotClasses[status])}>
                {isOverflowStep(step) ? step.count : ""}
              </span>
              <span className="mt-2 block max-w-full truncate text-[11px] font-bold leading-4 text-slate-700">{step.label}</span>
              {!isOverflowStep(step) && step.sublabel ? (
                <span className="block max-w-full truncate text-[10px] leading-4 text-slate-500">{step.sublabel}</span>
              ) : null}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
