import { useI18n } from "../../../i18n";
import { Button, Icon, PanelCard, SelectFilter, StatusBadge } from "../../ui";
import { formatLabel } from "./serialSettingsUtils";
import type { SerialRuleRow } from "./types";

type SerialFormatBuilderProps = {
  onSelectStatus: (status: string) => void;
  selectedRule: SerialRuleRow | null;
  selectedStatus: string;
};

function TokenChip({ token }: { token: string }) {
  return (
    <span className="inline-flex rounded-full bg-blue-50 px-3 py-1 text-xs font-bold text-[#061d49] ring-1 ring-blue-200">
      {token}
    </span>
  );
}

export function SerialFormatBuilder({ onSelectStatus, selectedRule, selectedStatus }: SerialFormatBuilderProps) {
  const { t } = useI18n();

  return (
    <PanelCard className="h-full overflow-hidden" title={t("admin.serialSettings.builder.title")}>
      {selectedRule ? (
        <div className="space-y-4">
          <section className="rounded-xl border border-slate-100 bg-slate-50/60 p-4">
            <div className="grid gap-3 md:grid-cols-3">
              <label className="min-w-0 space-y-1 text-xs font-bold text-slate-600">
                <span>{t("admin.serialSettings.builder.scope")}</span>
                <SelectFilter className="w-full min-w-0" value={selectedRule.scope} onChange={() => undefined}>
                  <option value={selectedRule.scope}>{formatLabel(selectedRule.scope)}</option>
                </SelectFilter>
              </label>
              <label className="min-w-0 space-y-1 text-xs font-bold text-slate-600">
                <span>{t("admin.serialSettings.builder.resetPolicy")}</span>
                <SelectFilter className="w-full min-w-0" value={selectedRule.resetPolicy} onChange={() => undefined}>
                  <option value={selectedRule.resetPolicy}>{formatLabel(selectedRule.resetPolicy)}</option>
                </SelectFilter>
              </label>
              <label className="min-w-0 space-y-1 text-xs font-bold text-slate-600">
                <span>{t("admin.serialSettings.builder.status")}</span>
                <SelectFilter className="w-full min-w-0" value={selectedStatus} onChange={(event) => onSelectStatus(event.target.value)}>
                  <option value="all">{t("admin.serialSettings.directory.statusAll")}</option>
                  <option value="active">{t("admin.serialSettings.status.active")}</option>
                  <option value="draft">{t("admin.serialSettings.status.draft")}</option>
                  <option value="inactive">{t("admin.serialSettings.status.inactive")}</option>
                  <option value="archived">{t("admin.serialSettings.status.archived")}</option>
                </SelectFilter>
              </label>
            </div>
          </section>

          <section className="rounded-xl border border-slate-200 bg-white p-4">
            <p className="text-xs font-bold uppercase tracking-wide text-slate-500">{t("admin.serialSettings.builder.formatPattern")}</p>
            <div className="mt-2 rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 font-mono text-sm font-bold text-[#061d49] [overflow-wrap:anywhere]">
              {selectedRule.format}
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              <TokenChip token="{YEAR}" />
              <TokenChip token="{MONTH}" />
              <TokenChip token="{SEQUENCE}" />
              <TokenChip token="{ORG}" />
              <TokenChip token="{DOC}" />
            </div>
          </section>

          <section className="rounded-xl border border-emerald-200 bg-emerald-50 p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-xs font-bold uppercase tracking-wide text-emerald-700">{t("admin.serialSettings.builder.sample")}</p>
                <p className="mt-1 font-mono text-2xl font-bold text-emerald-950">{selectedRule.sampleSerial}</p>
              </div>
              <StatusBadge tone={selectedRule.isDefault ? "green" : "blue"}>
                {selectedRule.isDefault ? t("admin.serialSettings.builder.defaultRule") : t("admin.serialSettings.builder.availableRule")}
              </StatusBadge>
            </div>
          </section>

          <div className="rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-sm leading-6 text-[#061d49]">
            <div className="flex gap-3">
              <Icon className="mt-0.5 h-5 w-5 shrink-0" name="serial" />
              <p>{t("admin.serialSettings.builder.explanation", { sample: selectedRule.sampleSerial })}</p>
            </div>
          </div>

          <div className="grid gap-2 sm:grid-cols-3">
            <Button icon="export" variant="primary">{t("admin.serialSettings.builder.saveRule")}</Button>
            <Button icon="document">{t("admin.serialSettings.builder.saveDraft")}</Button>
            <Button>{t("admin.serialSettings.builder.cancel")}</Button>
          </div>
        </div>
      ) : (
        <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
          {t("admin.serialSettings.builder.empty")}
        </div>
      )}
    </PanelCard>
  );
}
