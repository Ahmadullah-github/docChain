import type { ReactNode } from "react";
import { Button, IconButton, StatusBadge } from "../../../ui";
import { cx } from "../../../../lib/classNames";
import { builderSteps, type BuilderStep } from "./types";

type TemplateSetupDrawerProps = {
  activeStep: BuilderStep;
  canEdit: boolean;
  children: ReactNode;
  isLegacy: boolean;
  isOpen: boolean;
  onClose: () => void;
  onConvertLegacy: () => void;
  onSave: () => void;
  setActiveStep: (step: BuilderStep) => void;
  status: string;
};

export function TemplateSetupDrawer({
  activeStep,
  canEdit,
  children,
  isLegacy,
  isOpen,
  onClose,
  onConvertLegacy,
  onSave,
  setActiveStep,
  status
}: TemplateSetupDrawerProps) {
  if (!isOpen) {
    return null;
  }

  const activeStepIndex = builderSteps.findIndex((step) => step.id === activeStep);

  return (
    <div className="fixed inset-0 z-50">
      <button aria-label="Close template setup" className="absolute inset-0 cursor-default bg-slate-950/30" onClick={onClose} type="button" />
      <aside className="absolute inset-y-0 end-0 flex w-full max-w-3xl flex-col overflow-hidden border-s border-slate-200 bg-white shadow-2xl">
        <header className="flex items-center justify-between gap-3 border-b border-slate-200 px-5 py-4">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-lg font-black text-slate-950">Template Setup</h2>
              <StatusBadge>{status}</StatusBadge>
            </div>
            <p className="mt-1 text-sm text-slate-500">Configure family, shell, sections, and workflow without covering the canvas.</p>
          </div>
          <IconButton className="h-9 w-9 rounded-md" icon="x" label="Close setup" onClick={onClose} />
        </header>

        <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-5">
          <div className="grid gap-2 sm:grid-cols-3">
            {builderSteps.map((step, index) => (
              <button
                className={cx(
                  "flex min-w-0 items-center gap-2 rounded-lg border px-3 py-2 text-start text-sm font-bold transition",
                  activeStep === step.id ? "border-[#061d49] bg-[#061d49] text-white shadow-sm" : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
                )}
                key={step.id}
                onClick={() => setActiveStep(step.id)}
                type="button"
              >
                <span className={cx("grid h-6 w-6 shrink-0 place-items-center rounded-full text-xs", activeStep === step.id ? "bg-white text-[#061d49]" : "bg-slate-100 text-slate-500")}>{index + 1}</span>
                <span className="truncate">{step.label}</span>
              </button>
            ))}
          </div>

          {isLegacy ? (
            <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <p className="text-sm font-semibold leading-6 text-amber-800">This template is using legacy free-form layout metadata. It can stay that way, or regenerate from guided presets.</p>
                <Button className="min-h-9 px-3 py-1.5 text-xs" disabled={!canEdit} icon="reset" onClick={onConvertLegacy}>Convert</Button>
              </div>
            </div>
          ) : null}

          <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
            {children}
          </div>
        </div>

        <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 bg-white px-5 py-4">
          <div className="text-xs font-semibold text-slate-500">
            Step {activeStepIndex + 1} of {builderSteps.length}
          </div>
          <div className="flex flex-wrap gap-2">
            <Button icon="x" onClick={onClose}>Close</Button>
            <Button disabled={!canEdit} icon="save" onClick={onSave} variant="primary">Save Template</Button>
          </div>
        </footer>
      </aside>
    </div>
  );
}
