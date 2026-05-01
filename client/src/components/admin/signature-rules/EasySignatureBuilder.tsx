import type { DocumentType, JsonRecord, UnitType } from "../../../api";
import { useI18n } from "../../../i18n";
import { Button, Icon, PanelCard, SelectFilter, StatusBadge } from "../../ui";
import { booleanField, formatLabel, signStepTone } from "./signatureRuleUtils";
import type { SignatureRuleChainRow } from "./types";

type EasySignatureBuilderProps = {
  documentTypes: DocumentType[];
  onSelectScope: (documentTypeId: string, originUnitTypeId: string) => void;
  onSelectStatus: (status: string) => void;
  selectedChain: SignatureRuleChainRow | null;
  selectedStatus: string;
  unitTypes: UnitType[];
};

function StepNumber({ children }: { children: string }) {
  return (
    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#061d49] text-sm font-bold text-white shadow-sm">
      {children}
    </span>
  );
}

function signerTitle(rule: JsonRecord, fallback: string) {
  return typeof rule.requiredPositionTitle === "string"
    ? rule.requiredPositionTitle
    : formatLabel(typeof rule.requiredPositionCode === "string" ? rule.requiredPositionCode : "", fallback);
}

export function EasySignatureBuilder({
  documentTypes,
  onSelectScope,
  onSelectStatus,
  selectedChain,
  selectedStatus,
  unitTypes
}: EasySignatureBuilderProps) {
  const { t } = useI18n();

  return (
    <PanelCard className="h-full overflow-hidden" title={t("admin.signatureRules.builder.title")}>
      {selectedChain ? (
        <div className="space-y-3">
          <section className="flex gap-3 rounded-lg border border-slate-100 bg-slate-50/40 p-3">
            <StepNumber>1</StepNumber>
            <div className="min-w-0 flex-1">
              <h3 className="text-sm font-bold text-slate-950">{t("admin.signatureRules.builder.selectScope")}</h3>
              <div className="mt-2 grid gap-2 sm:grid-cols-2 min-[1800px]:grid-cols-3">
                <label className="min-w-0 space-y-1 text-xs font-bold text-slate-600">
                  <span>{t("admin.signatureRules.builder.documentType")}</span>
                  <SelectFilter
                    className="w-full min-w-0"
                    onChange={(event) => onSelectScope(event.target.value, selectedChain.originUnitType?.id ? String(selectedChain.originUnitType.id) : "any")}
                    value={selectedChain.documentTypeId ? String(selectedChain.documentTypeId) : "all"}
                  >
                    <option value="all">{t("admin.signatureRules.directory.documentTypeAll")}</option>
                    {documentTypes.map((documentType) => (
                      <option key={documentType.id} value={documentType.id}>{documentType.name}</option>
                    ))}
                  </SelectFilter>
                </label>
                <label className="min-w-0 space-y-1 text-xs font-bold text-slate-600">
                  <span>{t("admin.signatureRules.builder.originUnitType")}</span>
                  <SelectFilter
                    className="w-full min-w-0"
                    onChange={(event) => onSelectScope(selectedChain.documentTypeId ? String(selectedChain.documentTypeId) : "all", event.target.value)}
                    value={selectedChain.originUnitType?.id ? String(selectedChain.originUnitType.id) : "any"}
                  >
                    <option value="any">{t("admin.signatureRules.directory.originAll")}</option>
                    {unitTypes.map((unitType) => (
                      <option key={unitType.id} value={unitType.id}>{unitType.name}</option>
                    ))}
                  </SelectFilter>
                </label>
                <label className="min-w-0 space-y-1 text-xs font-bold text-slate-600">
                  <span>{t("admin.signatureRules.builder.ruleStatus")}</span>
                  <SelectFilter className="w-full min-w-0" onChange={(event) => onSelectStatus(event.target.value)} value={selectedStatus}>
                    <option value="all">{t("admin.signatureRules.directory.statusAll")}</option>
                    <option value="active">{t("admin.signatureRules.status.active")}</option>
                    <option value="draft">{t("admin.signatureRules.status.draft")}</option>
                    <option value="inactive">{t("admin.signatureRules.status.inactive")}</option>
                    <option value="archived">{t("admin.signatureRules.status.archived")}</option>
                  </SelectFilter>
                </label>
              </div>
            </div>
          </section>

          <section className="flex gap-3 rounded-lg border border-slate-100 bg-slate-50/40 p-3">
            <StepNumber>2</StepNumber>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="text-sm font-bold text-slate-950">{t("admin.signatureRules.builder.buildChain")}</h3>
                <div className="rounded-lg border border-slate-200 bg-white p-0.5 text-xs font-bold">
                  <span className={selectedChain.chainMode === "sequential" ? "inline-flex rounded-md bg-[#061d49] px-3 py-1.5 text-white" : "inline-flex px-3 py-1.5 text-slate-600"}>
                    {t("admin.signatureRules.builder.sequential")}
                  </span>
                  <span className={selectedChain.chainMode === "parallel" ? "inline-flex rounded-md bg-[#061d49] px-3 py-1.5 text-white" : "inline-flex px-3 py-1.5 text-slate-600"}>
                    {t("admin.signatureRules.builder.parallel")}
                  </span>
                </div>
              </div>
              <div className="mt-3 flex max-w-full gap-3 overflow-x-auto overflow-y-hidden pb-2">
                {selectedChain.signatureRules.map((rule, index) => {
                  const finalizes = booleanField(rule, "can_finalize_document");
                  const title = signerTitle(rule, t("admin.signatureRules.builder.configuredSignatory"));

                  return (
                    <article className="relative min-w-[8.5rem] rounded-xl border border-blue-200 bg-blue-50/70 p-3 text-center" key={String(rule.id || index)}>
                      <span className="absolute -top-2 start-2 flex h-6 w-6 items-center justify-center rounded-full bg-[#061d49] text-xs font-bold text-white">{index + 1}</span>
                      <Icon className="mx-auto h-6 w-6 text-[#061d49]" name={finalizes ? "shield" : "users"} />
                      <p className="mt-2 truncate text-sm font-bold text-[#061d49]">{title}</p>
                      <p className="truncate text-xs text-slate-500">{formatLabel(typeof rule.requiredPositionCode === "string" ? rule.requiredPositionCode : "")}</p>
                      <div className="mt-2">
                        <StatusBadge tone={signStepTone(rule)}>
                          {finalizes ? t("admin.signatureRules.builder.final") : booleanField(rule, "is_required") || !("is_required" in rule) ? t("admin.signatureRules.builder.required") : t("admin.signatureRules.builder.optional")}
                        </StatusBadge>
                      </div>
                    </article>
                  );
                })}
                <button className="min-w-[7rem] rounded-xl border border-dashed border-blue-300 bg-white px-3 py-2 text-sm font-bold text-[#061d49]" type="button">
                  + {t("admin.signatureRules.builder.addSigner")}
                </button>
              </div>
            </div>
          </section>

          <section className="flex gap-3 rounded-lg border border-slate-100 bg-slate-50/40 p-3">
            <StepNumber>3</StepNumber>
            <div className="min-w-0 flex-1">
              <h3 className="text-sm font-bold text-slate-950">{t("admin.signatureRules.builder.finalSerial")}</h3>
              <div className="mt-2 grid gap-2 md:grid-cols-2">
                <label className="min-w-0 space-y-1 text-xs font-bold text-slate-600">
                  <span>{t("admin.signatureRules.builder.finalSignatory")}</span>
                  <SelectFilter className="w-full min-w-0" value={selectedChain.finalSignatory} onChange={() => undefined}>
                    <option value={selectedChain.finalSignatory}>{selectedChain.finalSignatory}</option>
                  </SelectFilter>
                </label>
                <div className="flex min-w-0 flex-col justify-between gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm sm:flex-row sm:items-end">
                  <span className="min-w-0 font-semibold leading-5 text-slate-700">{t("admin.signatureRules.builder.serialAfterFinal")}</span>
                  <StatusBadge tone={selectedChain.checks.serialTriggerSet ? "green" : "amber"}>
                    {selectedChain.checks.serialTriggerSet ? t("admin.signatureRules.builder.enabled") : t("admin.signatureRules.builder.notConfigured")}
                  </StatusBadge>
                </div>
              </div>
            </div>
          </section>

          <section className="flex gap-3 rounded-lg border border-slate-100 bg-slate-50/40 p-3">
            <StepNumber>4</StepNumber>
            <div className="min-w-0 flex-1">
              <h3 className="text-sm font-bold text-slate-950">{t("admin.signatureRules.builder.forwardedVisibility")}</h3>
              <div className="mt-2 grid gap-2 md:grid-cols-2">
                <label className="min-w-0 space-y-1 text-xs font-bold text-slate-600">
                  <span>{t("admin.signatureRules.builder.visibilityPolicy")}</span>
                  <SelectFilter className="w-full min-w-0" value={selectedChain.visibilityPolicy} onChange={() => undefined}>
                    <option value={selectedChain.visibilityPolicy}>{selectedChain.visibilityPolicy}</option>
                  </SelectFilter>
                </label>
                <div className="flex min-w-0 flex-col gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm sm:flex-row sm:items-center">
                  <span className="font-semibold leading-5 text-slate-700">{t("admin.signatureRules.builder.hideChildLater")}</span>
                  <StatusBadge tone={selectedChain.visibilityRule ? "green" : "slate"}>{selectedChain.visibilityRule ? t("common.yes") : t("common.no")}</StatusBadge>
                </div>
              </div>
            </div>
          </section>

          <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm leading-6 text-emerald-900">
            <p className="font-bold">{t("admin.signatureRules.builder.whatThisMeansTitle")}</p>
            <p>{t("admin.signatureRules.builder.whatThisMeans", {
              documentType: selectedChain.documentTypeLabel,
              finalSignatory: selectedChain.finalSignatory,
              origin: selectedChain.originUnitLabel
            })}</p>
          </div>

          <div className="grid gap-2 sm:grid-cols-3">
            <Button icon="export" variant="primary">{t("admin.signatureRules.builder.saveRule")}</Button>
            <Button icon="document">{t("admin.signatureRules.builder.saveDraft")}</Button>
            <Button>{t("admin.signatureRules.builder.cancel")}</Button>
          </div>
        </div>
      ) : (
        <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
          {t("admin.signatureRules.builder.empty")}
        </div>
      )}
    </PanelCard>
  );
}
