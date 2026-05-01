import type { ChangeEvent } from "react";
import type { DocumentType, UnitType } from "../../../api";
import { useI18n } from "../../../i18n";
import { Button, Icon, PanelCard, SelectFilter, StatusBadge } from "../../ui";
import { formatLabel } from "./workflowRuleUtils";
import type { WorkflowRuleRow } from "./types";

type EasyWorkflowBuilderProps = {
  documentTypes: DocumentType[];
  onSelectRuleStatus: (status: string) => void;
  onSelectScope: (documentTypeId: string, originUnitTypeId: string) => void;
  selectedRule: WorkflowRuleRow | null;
  selectedStatus: string;
  unitTypes: UnitType[];
};

function noopChange(_event: ChangeEvent<HTMLSelectElement>) {
  return undefined;
}

function StepNumber({ children }: { children: string }) {
  return (
    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#061d49] text-sm font-bold text-white shadow-sm">
      {children}
    </span>
  );
}

export function EasyWorkflowBuilder({
  documentTypes,
  onSelectRuleStatus,
  onSelectScope,
  selectedRule,
  selectedStatus,
  unitTypes
}: EasyWorkflowBuilderProps) {
  const { t } = useI18n();

  return (
    <PanelCard className="h-full" title={t("admin.workflowRules.builder.title")}>
      {selectedRule ? (
        <div className="space-y-3">
          <section className="flex gap-3 rounded-lg border border-slate-100 bg-slate-50/40 p-3">
            <StepNumber>1</StepNumber>
            <div className="min-w-0 flex-1">
              <h3 className="text-sm font-bold text-slate-950">{t("admin.workflowRules.builder.selectScope")}</h3>
              <div className="mt-2 grid gap-2 lg:grid-cols-3">
                <label className="space-y-1 text-xs font-bold text-slate-600">
                  <span>{t("admin.workflowRules.builder.documentType")}</span>
                  <SelectFilter
                    className="w-full"
                    onChange={(event) => onSelectScope(event.target.value, selectedRule.originUnitType?.id ? String(selectedRule.originUnitType.id) : "all")}
                    value={selectedRule.documentTypeId ? String(selectedRule.documentTypeId) : "all"}
                  >
                    <option value="all">{t("admin.workflowRules.directory.documentTypeAll")}</option>
                    {documentTypes.map((documentType) => (
                      <option key={documentType.id} value={documentType.id}>{documentType.name}</option>
                    ))}
                  </SelectFilter>
                </label>
                <label className="space-y-1 text-xs font-bold text-slate-600">
                  <span>{t("admin.workflowRules.builder.originUnitType")}</span>
                  <SelectFilter
                    className="w-full"
                    onChange={(event) => onSelectScope(selectedRule.documentTypeId ? String(selectedRule.documentTypeId) : "all", event.target.value)}
                    value={selectedRule.originUnitType?.id ? String(selectedRule.originUnitType.id) : "all"}
                  >
                    <option value="all">{t("admin.workflowRules.directory.originAll")}</option>
                    {unitTypes.map((unitType) => (
                      <option key={unitType.id} value={unitType.id}>{unitType.name}</option>
                    ))}
                  </SelectFilter>
                </label>
                <label className="space-y-1 text-xs font-bold text-slate-600">
                  <span>{t("admin.workflowRules.builder.ruleStatus")}</span>
                  <SelectFilter className="w-full" onChange={(event) => onSelectRuleStatus(event.target.value)} value={selectedStatus}>
                    <option value="all">{t("admin.workflowRules.directory.statusAll")}</option>
                    <option value="active">{t("admin.workflowRules.status.active")}</option>
                    <option value="draft">{t("admin.workflowRules.status.draft")}</option>
                    <option value="inactive">{t("admin.workflowRules.status.inactive")}</option>
                    <option value="archived">{t("admin.workflowRules.status.archived")}</option>
                  </SelectFilter>
                </label>
              </div>
            </div>
          </section>

          <section className="flex gap-3 rounded-lg border border-slate-100 bg-slate-50/40 p-3">
            <StepNumber>2</StepNumber>
            <div className="min-w-0 flex-1">
              <h3 className="text-sm font-bold text-slate-950">{t("admin.workflowRules.builder.routingPath")}</h3>
              <div className="mt-2 grid gap-2 md:grid-cols-2 xl:grid-cols-4">
                <label className="space-y-1 text-xs font-bold text-slate-600">
                  <span>{t("admin.workflowRules.builder.fromPosition")}</span>
                  <SelectFilter className="w-full" onChange={noopChange} value={selectedRule.fromPositionLabel}>
                    <option value={selectedRule.fromPositionLabel}>{selectedRule.fromPositionLabel}</option>
                  </SelectFilter>
                </label>
                <label className="space-y-1 text-xs font-bold text-slate-600">
                  <span>{t("admin.workflowRules.builder.toUnit")}</span>
                  <SelectFilter className="w-full" onChange={noopChange} value={selectedRule.toUnitLabel}>
                    <option value={selectedRule.toUnitLabel}>{selectedRule.toUnitLabel}</option>
                  </SelectFilter>
                </label>
                <label className="space-y-1 text-xs font-bold text-slate-600">
                  <span>{t("admin.workflowRules.builder.toPosition")}</span>
                  <SelectFilter className="w-full" onChange={noopChange} value={selectedRule.toPositionLabel}>
                    <option value={selectedRule.toPositionLabel}>{selectedRule.toPositionLabel}</option>
                  </SelectFilter>
                </label>
                <label className="space-y-1 text-xs font-bold text-slate-600">
                  <span>{t("admin.workflowRules.builder.action")}</span>
                  <SelectFilter className="w-full" onChange={noopChange} value={selectedRule.actionLabel}>
                    <option value={selectedRule.actionLabel}>{selectedRule.actionLabel}</option>
                  </SelectFilter>
                </label>
              </div>
            </div>
          </section>

          <section className="flex gap-3 rounded-lg border border-slate-100 bg-slate-50/40 p-3">
            <StepNumber>3</StepNumber>
            <div className="min-w-0 flex-1">
              <h3 className="text-sm font-bold text-slate-950">{t("admin.workflowRules.builder.signatureChain")}</h3>
              <div className="mt-2 flex max-h-32 gap-2 overflow-x-auto overflow-y-hidden pb-2">
                {selectedRule.signatureRules.length ? selectedRule.signatureRules.map((signatureRule, index) => {
                  const title = typeof signatureRule.requiredPositionTitle === "string"
                    ? signatureRule.requiredPositionTitle
                    : formatLabel(typeof signatureRule.requiredPositionCode === "string" ? signatureRule.requiredPositionCode : "", t("admin.workflowRules.builder.configuredSignatory"));
                  const isRequired = signatureRule.is_required !== false && signatureRule.is_required !== 0;
                  const finalizes = signatureRule.can_finalize_document === true || signatureRule.can_finalize_document === 1;

                  return (
                    <article className="relative min-w-[8.5rem] rounded-lg border border-blue-200 bg-blue-50/70 p-2.5 text-center" key={String(signatureRule.id || index)}>
                      <span className="absolute -top-2 start-2 flex h-6 w-6 items-center justify-center rounded-full bg-[#061d49] text-xs font-bold text-white">{index + 1}</span>
                      <Icon className="mx-auto h-5 w-5 text-[#061d49]" name={finalizes ? "shield" : "signature"} />
                      <p className="mt-1.5 truncate text-sm font-bold text-[#061d49]">{title}</p>
                      <div className="mt-2">
                        <StatusBadge tone={finalizes ? "blue" : isRequired ? "green" : "amber"}>
                          {finalizes ? t("admin.workflowRules.builder.final") : isRequired ? t("admin.workflowRules.builder.required") : t("admin.workflowRules.builder.optional")}
                        </StatusBadge>
                      </div>
                    </article>
                  );
                }) : (
                  <article className="w-full rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm font-semibold text-amber-800">
                    {t("admin.workflowRules.builder.noSignatureChain")}
                  </article>
                )}
              </div>
              <div className="mt-2 flex flex-wrap gap-3 text-xs font-semibold text-slate-600">
                <span>{t("admin.workflowRules.builder.chainMode")}</span>
                <StatusBadge tone="blue">{t("admin.workflowRules.builder.sequential")}</StatusBadge>
                <span>{t("admin.workflowRules.builder.stepRequirement")}</span>
                <StatusBadge tone={selectedRule.checks.finalSignatureDefined ? "green" : "amber"}>
                  {selectedRule.checks.finalSignatureDefined ? t("admin.workflowRules.builder.required") : t("admin.workflowRules.builder.optional")}
                </StatusBadge>
              </div>
            </div>
          </section>

          <section className="flex gap-3 rounded-lg border border-slate-100 bg-slate-50/40 p-3">
            <StepNumber>4</StepNumber>
            <div className="min-w-0 flex-1">
              <h3 className="text-sm font-bold text-slate-950">{t("admin.workflowRules.builder.visibilitySerial")}</h3>
              <div className="mt-2 grid gap-2 md:grid-cols-3">
                <label className="space-y-1 text-xs font-bold text-slate-600">
                  <span>{t("admin.workflowRules.builder.visibilityPolicy")}</span>
                  <SelectFilter className="w-full" onChange={noopChange} value={selectedRule.visibilityPolicy}>
                    <option value={selectedRule.visibilityPolicy}>{selectedRule.visibilityPolicy}</option>
                  </SelectFilter>
                </label>
                <label className="space-y-1 text-xs font-bold text-slate-600">
                  <span>{t("admin.workflowRules.builder.hideChildSignaturesLater")}</span>
                  <SelectFilter className="w-full" onChange={noopChange} value={selectedRule.visibilityRule ? "yes" : "no"}>
                    <option value={selectedRule.visibilityRule ? "yes" : "no"}>
                      {selectedRule.visibilityRule ? t("common.yes") : t("common.no")}
                    </option>
                  </SelectFilter>
                </label>
                <label className="space-y-1 text-xs font-bold text-slate-600">
                  <span>{t("admin.workflowRules.builder.generateSerialAfterFinal")}</span>
                  <SelectFilter className="w-full" onChange={noopChange} value={selectedRule.serialTrigger}>
                    <option value={selectedRule.serialTrigger}>{selectedRule.serialTrigger}</option>
                  </SelectFilter>
                </label>
              </div>
            </div>
          </section>

          <div className="rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-sm leading-6 text-[#061d49]">
            <p className="font-bold">{t("admin.workflowRules.builder.whatThisMeansTitle")}</p>
            <p>{t("admin.workflowRules.builder.whatThisMeans", {
              action: selectedRule.actionLabel,
              documentType: selectedRule.documentTypeLabel,
              finalSignatory: selectedRule.finalSignatory,
              origin: selectedRule.originUnitLabel
            })}</p>
          </div>

          <div className="grid gap-2 sm:grid-cols-3">
            <Button icon="export" variant="primary">{t("admin.workflowRules.builder.saveRule")}</Button>
            <Button icon="serial">{t("admin.workflowRules.builder.saveDraft")}</Button>
            <Button variant="secondary">{t("admin.workflowRules.builder.cancel")}</Button>
          </div>
        </div>
      ) : (
        <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
          {t("admin.workflowRules.builder.noRule")}
        </div>
      )}
    </PanelCard>
  );
}
