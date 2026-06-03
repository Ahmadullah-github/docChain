import { useI18n } from "../../../i18n";
import { Button, Icon, PanelCard } from "../../ui";
import type { SerialRulePreset } from "./types";

type SerialRulePresetsProps = {
  onUsePreset?: (preset: SerialRulePreset) => void;
};

export function serialPresetDefinitions(t: ReturnType<typeof useI18n>["t"]): SerialRulePreset[] {
  return [
    { codePrefix: "YEARLY", format: "DOC-{YEAR}-{SEQUENCE}", label: t("admin.serialSettings.presets.yearly"), resetPolicy: "yearly", scope: "global", sequencePadding: 6 },
    { codePrefix: "MONTHLY", format: "DOC-{YEAR}-{MONTH}-{SEQUENCE}", label: t("admin.serialSettings.presets.monthly"), resetPolicy: "monthly", scope: "global", sequencePadding: 5 },
    { codePrefix: "UNIT", format: "{ORG}-{DOC}-{YY}-{SEQUENCE}", label: t("admin.serialSettings.presets.unitScoped"), resetPolicy: "yearly", scope: "origin_unit_document_type", sequencePadding: 4 },
    { codePrefix: "LEGACY", format: "DC-{YY}-{SEQ}", label: t("admin.serialSettings.presets.legacy"), resetPolicy: "never", scope: "global", sequencePadding: 4 }
  ];
}

export function SerialRulePresets({ onUsePreset }: SerialRulePresetsProps) {
  const { t } = useI18n();
  const presets = serialPresetDefinitions(t);

  return (
    <PanelCard className="overflow-hidden" title={t("admin.serialSettings.presets.title")}>
      <div className="space-y-2">
        {presets.map((preset) => (
          <article className="flex flex-col gap-3 rounded-lg border border-slate-200 bg-white px-3 py-2 transition hover:border-blue-200 hover:bg-blue-50/30 sm:flex-row sm:items-center sm:justify-between" key={preset.label}>
            <div className="flex min-w-0 items-center gap-3">
              <Icon className="h-5 w-5 shrink-0 text-[#061d49]" name="serial" />
              <div className="min-w-0">
                <p className="truncate text-sm font-bold text-slate-800">{preset.label}</p>
                <p className="force-ltr truncate text-start font-mono text-xs text-slate-500" title={preset.format}>{preset.format}</p>
              </div>
            </div>
            <Button className="w-full shrink-0 px-3 py-1.5 text-xs sm:w-auto" icon="template" onClick={() => onUsePreset?.(preset)}>{t("admin.serialSettings.presets.usePreset")}</Button>
          </article>
        ))}
      </div>
    </PanelCard>
  );
}
