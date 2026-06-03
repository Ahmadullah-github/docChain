import { Button, Icon, PanelCard, SelectFilter, StatusBadge } from "../../../components/ui";
import type { DocumentTemplateDetail, TemplateLayout } from "../../../api";
import { builderSteps, type BuilderStep, type PreviewScenario } from "../../../components/admin/templates/builder";
import { cx } from "../../../lib/classNames";
import { TemplateA4Preview, imagePreviewSource } from "./TemplatePreview";
import {
  defaultGuidedConfig,
  familyOptions,
  familyTitle,
  sectionOptions,
  shellTitle,
  type GuidedConfig,
  type LogoSlotId,
  type SignatureLayout
} from "./templateBuilderModel";

export function GuidedTemplateBuilderScreen({
  activeStep,
  busy,
  canEdit,
  canGoBack,
  canGoNext,
  config,
  description,
  detail,
  error,
  isLegacy,
  isSystemAdmin,
  layout,
  name,
  onAdvanced,
  onBack,
  onNext,
  onOpenLibrary,
  onOpenPublish,
  onSave,
  onSelectLogoSlot,
  scenario,
  setActiveStep,
  setDescription,
  setName,
  setScenario,
  updateConfig,
  zoom
}: {
  activeStep: BuilderStep;
  busy: boolean;
  canEdit: boolean;
  canGoBack: boolean;
  canGoNext: boolean;
  config: GuidedConfig;
  description: string;
  detail: DocumentTemplateDetail | null;
  error: string | null;
  isLegacy: boolean;
  isSystemAdmin: boolean;
  layout: TemplateLayout;
  name: string;
  onAdvanced: () => void;
  onBack: () => void | undefined;
  onNext: () => void | undefined;
  onOpenLibrary: () => void;
  onOpenPublish: () => void | undefined;
  onSave: () => void;
  onSelectLogoSlot: (blockId: LogoSlotId) => void;
  scenario: PreviewScenario;
  setActiveStep: (step: BuilderStep) => void;
  setDescription: (value: string) => void;
  setName: (value: string) => void;
  setScenario: (scenario: PreviewScenario) => void;
  updateConfig: (updater: (current: GuidedConfig) => GuidedConfig) => void;
  zoom: number;
}) {
  return (
    <section className="min-h-[calc(100vh-1rem)] space-y-3 rounded-lg bg-slate-100 p-3">
      <div className="rounded-lg border border-slate-200 bg-white px-4 py-3 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs font-black uppercase tracking-wide text-slate-500">Balkh University fixed-shell builder</p>
            <h1 className="mt-1 text-xl font-black text-slate-950">{name || "Official template"}</h1>
            <p className="mt-1 max-w-3xl text-sm leading-6 text-slate-600">
              Build one of the four official document templates using the locked Balkh University shell. Administrative level is filled from each writer's active assignment, not from this template.
            </p>
          </div>
          <div className="flex flex-wrap items-center justify-end gap-2">
            <Button icon="template" onClick={onOpenLibrary} variant="secondary">Library</Button>
            {isSystemAdmin ? <Button icon="settings" onClick={onAdvanced} variant="secondary">Advanced</Button> : null}
            <Button disabled={busy || !canEdit} icon="save" onClick={onSave} variant="primary">{busy ? "Saving..." : "Save"}</Button>
            <Button disabled={!detail} icon="shield" onClick={onOpenPublish} variant="secondary">Publish</Button>
          </div>
        </div>
        {error ? <div className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm font-semibold text-red-700">{error}</div> : null}
      </div>

      <div className="grid gap-3 xl:grid-cols-[24rem_minmax(0,1fr)]">
        <aside className="space-y-3">
          <PanelCard bodyClassName="space-y-3" title="Workflow">
            <div className="grid gap-2">
              {builderSteps.map((step, index) => (
                <button
                  className={cx(
                    "flex min-h-11 items-center gap-3 rounded-lg border px-3 py-2 text-start transition",
                    activeStep === step.id ? "border-[#061d49] bg-blue-50 text-[#061d49] ring-2 ring-[#061d49]/10" : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
                  )}
                  key={step.id}
                  onClick={() => setActiveStep(step.id)}
                  type="button"
                >
                  <span className="grid h-7 w-7 shrink-0 place-items-center rounded-md bg-slate-100 text-xs font-black">{index + 1}</span>
                  <span className="min-w-0 text-sm font-black">{step.label}</span>
                </button>
              ))}
            </div>
          </PanelCard>

          <PanelCard bodyClassName="space-y-4" title={builderSteps.find((step) => step.id === activeStep)?.label || "Setup"}>
            <BuilderStepContent
              activeStep={activeStep}
              canEdit={canEdit}
              config={config}
              description={description}
              isLegacy={isLegacy}
              layout={layout}
              name={name}
              onSelectLogoSlot={onSelectLogoSlot}
              setDescription={setDescription}
              setName={setName}
              updateConfig={updateConfig}
            />
            {activeStep === "workflow" ? (
              <label className="block text-xs font-bold text-slate-600">
                Preview scenario
                <SelectFilter className="mt-1 w-full" onChange={(event) => setScenario(event.target.value as PreviewScenario)} value={scenario}>
                  <option value="standard">Standard</option>
                  <option value="longBody">Long body</option>
                  <option value="threeSignatures">Three signatures</option>
                  <option value="withCc">With copies</option>
                </SelectFilter>
              </label>
            ) : null}
            <div className="flex items-center justify-between gap-2 border-t border-slate-100 pt-3">
              <Button disabled={!canGoBack} onClick={onBack} variant="secondary">Back</Button>
              <Button disabled={!canGoNext} onClick={onNext} variant="primary">Next</Button>
            </div>
          </PanelCard>
        </aside>

        <PanelCard
          bodyClassName="min-h-[44rem] p-0"
          title={`${familyTitle(config.documentFamily)} official preview`}
          actions={<StatusBadge tone="blue">locked shell</StatusBadge>}
        >
          <TemplateA4Preview
            canEdit={false}
            layout={layout}
            scenario={scenario}
            selectedBlockId={null}
            zoom={zoom}
          />
        </PanelCard>
      </div>
    </section>
  );
}

export function BuilderStepContent({
  activeStep,
  canEdit,
  config,
  description,
  isLegacy,
  layout,
  name,
  onSelectLogoSlot,
  setDescription,
  setName,
  updateConfig
}: {
  activeStep: BuilderStep;
  canEdit: boolean;
  config: GuidedConfig;
  description: string;
  isLegacy: boolean;
  layout?: TemplateLayout;
  name: string;
  onSelectLogoSlot?: (blockId: LogoSlotId) => void;
  setDescription: (value: string) => void;
  setName: (value: string) => void;
  updateConfig: (updater: (current: GuidedConfig) => GuidedConfig) => void;
}) {
  if (activeStep === "basics") {
    return (
      <div className="space-y-4">
        <label className="block text-xs font-bold text-slate-600">
          Template name
          <input className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm" disabled={!canEdit} onChange={(event) => setName(event.target.value)} value={name} />
        </label>
        <label className="block text-xs font-bold text-slate-600">
          Description
          <textarea className="mt-1 min-h-24 w-full rounded-md border border-slate-300 px-3 py-2 text-sm" disabled={!canEdit} onChange={(event) => setDescription(event.target.value)} value={description} />
        </label>
      </div>
    );
  }

  if (activeStep === "family") {
    return (
      <div className="grid gap-3 sm:grid-cols-2">
        {familyOptions.map((family) => (
          <button
            className={cx(
              "min-w-0 rounded-lg border p-4 text-start transition",
              config.documentFamily === family.id && !isLegacy ? "border-[#061d49] bg-blue-50 ring-2 ring-[#061d49]/10" : "border-slate-200 bg-white hover:bg-slate-50"
            )}
            disabled={!canEdit}
            key={family.id}
            onClick={() => updateConfig(() => defaultGuidedConfig(family.id))}
            type="button"
          >
            <p className="font-bold text-slate-950">{family.label}</p>
            <p className="mt-2 text-sm leading-6 text-slate-600">{family.description}</p>
          </button>
        ))}
      </div>
    );
  }

  if (activeStep === "shell") {
    const logoSlots: Array<{ id: LogoSlotId; label: string; description: string }> = [
      { id: "logo-left", label: "Left logo", description: "Balkh University seal slot" },
      { id: "logo-right", label: "Right logo", description: "Ministry or official seal slot" }
    ];

    return (
      <div className="space-y-3">
        <div className="rounded-lg border border-blue-200 bg-blue-50 p-4 text-[#061d49]">
          <p className="font-bold">Balkh University official shell</p>
          <p className="mt-2 whitespace-pre-line text-sm font-semibold leading-7">{shellTitle(config.shellPreset)}</p>
          <p className="mt-2 text-sm leading-6">
            Logos, the government/ministry/university heading, Bismillah, date and serial zones, subject label, page frame, and RTL typography are locked for all four document types.
          </p>
        </div>
        <div className="rounded-lg border border-slate-200 bg-white p-4 text-sm leading-6 text-slate-600">
          The office/header lines are a document field. Staff drafts auto-fill them from the writer's active assignment and users with write permission may edit them before first signature.
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          {logoSlots.map((slot) => {
            const logoBlock = layout?.blocks.find((blockItem) => blockItem.id === slot.id) || null;
            const source = logoBlock ? imagePreviewSource(logoBlock) : "";
            return (
              <div className="rounded-lg border border-slate-200 bg-white p-4" key={slot.id}>
                <div className="flex min-h-28 items-center justify-center rounded-lg border border-dashed border-slate-300 bg-slate-50 p-3">
                  {source ? <img alt="" className="max-h-24 max-w-full object-contain" src={source} /> : <Icon className="h-8 w-8 text-slate-400" name="image" />}
                </div>
                <p className="mt-3 font-bold text-slate-950">{slot.label}</p>
                <p className="mt-1 text-xs font-semibold text-slate-500">{logoBlock?.assetName || slot.description}</p>
                <Button className="mt-3 w-full" disabled={!canEdit || !onSelectLogoSlot} icon="image" onClick={() => onSelectLogoSlot?.(slot.id)} variant="secondary">
                  Choose logo
                </Button>
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  if (activeStep === "sections") {
    return (
      <div className="grid gap-3 sm:grid-cols-2">
        {sectionOptions.map((section) => (
          <label className="flex min-w-0 gap-3 rounded-lg border border-slate-200 bg-white p-4" key={section.id}>
            <input
              checked={Boolean(config.sections[section.id])}
              className="mt-1 h-4 w-4"
              disabled={!canEdit}
              onChange={(event) => updateConfig((current) => ({ ...current, sections: { ...current.sections, [section.id]: event.target.checked } }))}
              type="checkbox"
            />
            <span>
              <span className="block font-bold text-slate-950">{section.label}</span>
              <span className="mt-1 block text-sm leading-5 text-slate-600">{section.description}</span>
            </span>
          </label>
        ))}
      </div>
    );
  }

  if (activeStep === "workflow") {
    return (
      <div className="space-y-4">
        <div>
          <p className="text-xs font-bold uppercase tracking-wide text-slate-500">Approval layout</p>
          <div className="mt-2 grid gap-2 sm:grid-cols-3">
            {(["single", "two_column", "grid"] as SignatureLayout[]).map((layoutOption) => (
              <button
                className={cx(
                  "rounded-lg border px-3 py-3 text-sm font-bold transition",
                  config.signatureLayout === layoutOption ? "border-[#061d49] bg-blue-50 text-[#061d49]" : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
                )}
                disabled={!canEdit}
                key={layoutOption}
                onClick={() => updateConfig((current) => ({ ...current, signatureLayout: layoutOption }))}
                type="button"
              >
                {layoutOption.replaceAll("_", " ")}
              </button>
            ))}
          </div>
        </div>
        <div className="rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-sm leading-6 text-[#061d49]">
          Signature, serial, and CC sections are rendered through existing workflow/template APIs. Backend shell/profile entities are intentionally out of scope for this v1.
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3">
        <p className="text-sm font-bold text-slate-950">{isLegacy ? "Legacy template" : `${familyTitle(config.documentFamily)} / Balkh official shell`}</p>
        <p className="mt-1 text-sm leading-6 text-slate-600">Review the live preview, then save. Publishing and binding happen on the next focused screen and do not depend on write permission rules.</p>
      </div>
    </div>
  );
}
