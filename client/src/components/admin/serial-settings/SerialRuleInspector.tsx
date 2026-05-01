import { useI18n } from "../../../i18n";
import { Button, Icon, PanelCard, StatusBadge } from "../../ui";
import { formatLabel, statusTone } from "./serialSettingsUtils";
import type { SerialSettingsChecks, SerialRuleRow } from "./types";

type SerialRuleInspectorProps = {
  selectedRule: SerialRuleRow | null;
};

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50/70 px-3 py-2">
      <dt className="text-[0.68rem] font-bold uppercase tracking-wide text-slate-500">{label}</dt>
      <dd className="mt-1 whitespace-normal break-normal text-sm font-semibold leading-5 text-slate-900 [overflow-wrap:anywhere]">{value}</dd>
    </div>
  );
}

function checkItems(checks: SerialSettingsChecks, t: ReturnType<typeof useI18n>["t"]) {
  return [
    [t("admin.serialSettings.checks.activeRule"), checks.activeRule],
    [t("admin.serialSettings.checks.defaultRule"), checks.defaultRuleSet],
    [t("admin.serialSettings.checks.yearToken"), checks.formatHasYear],
    [t("admin.serialSettings.checks.sequenceToken"), checks.formatHasSequence],
    [t("admin.serialSettings.checks.documentTypes"), checks.documentTypesCovered]
  ] as Array<[string, boolean]>;
}

export function SerialRuleInspector({ selectedRule }: SerialRuleInspectorProps) {
  const { t } = useI18n();

  return (
    <div className="space-y-3">
      <PanelCard className="overflow-hidden" title={t("admin.serialSettings.inspector.title")}>
        {selectedRule ? (
          <div className="space-y-4">
            <div className="flex gap-3">
              <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-blue-50 text-[#061d49] ring-1 ring-blue-200">
                <Icon className="h-7 w-7" name="serial" />
              </div>
              <div className="min-w-0">
                <h3 className="text-balance text-lg font-bold leading-6 text-slate-950">{selectedRule.name}</h3>
                <p className="mt-1 text-sm font-semibold text-slate-500">{selectedRule.code}</p>
                <div className="mt-2 flex flex-wrap gap-2">
                  <StatusBadge tone={statusTone(selectedRule.status)}>{selectedRule.status}</StatusBadge>
                  <StatusBadge tone={selectedRule.isDefault ? "green" : "blue"}>{selectedRule.isDefault ? "default" : "secondary"}</StatusBadge>
                </div>
              </div>
            </div>

            <dl className="grid gap-2">
              <DetailRow label={t("admin.serialSettings.inspector.ruleName")} value={selectedRule.name} />
              <DetailRow label={t("admin.serialSettings.inspector.ruleCode")} value={selectedRule.code} />
              <DetailRow label={t("admin.serialSettings.inspector.format")} value={selectedRule.format} />
              <DetailRow label={t("admin.serialSettings.inspector.scope")} value={formatLabel(selectedRule.scope)} />
              <DetailRow label={t("admin.serialSettings.inspector.resetPolicy")} value={formatLabel(selectedRule.resetPolicy)} />
              <DetailRow label={t("admin.serialSettings.inspector.padding")} value={String(selectedRule.sequencePadding)} />
              <DetailRow label={t("admin.serialSettings.inspector.lastUpdated")} value={selectedRule.lastUpdated} />
              <DetailRow label={t("admin.serialSettings.inspector.notes")} value={selectedRule.notes} />
            </dl>

            <div className="grid gap-2 sm:grid-cols-2">
              <Button icon="edit">{t("admin.serialSettings.inspector.editRule")}</Button>
              <Button icon="template">{t("admin.serialSettings.inspector.cloneRule")}</Button>
              <Button icon="pause" variant="danger">{t("admin.serialSettings.inspector.disableRule")}</Button>
              <Button icon="view">{t("admin.serialSettings.inspector.previewResult")}</Button>
            </div>
          </div>
        ) : (
          <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
            {t("admin.serialSettings.inspector.empty")}
          </div>
        )}
      </PanelCard>

      {selectedRule ? (
        <PanelCard title={t("admin.serialSettings.checks.title")}>
          <div className="space-y-3">
            {checkItems(selectedRule.checks, t).map(([label, ok]) => (
              <div className="flex items-center gap-3 text-sm" key={label}>
                <span className={`flex h-6 w-6 items-center justify-center rounded-full ${ok ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"}`}>
                  <Icon className="h-4 w-4" name={ok ? "activity" : "shield"} />
                </span>
                <span className="font-medium text-slate-700">{label}</span>
              </div>
            ))}
          </div>
        </PanelCard>
      ) : null}
    </div>
  );
}
