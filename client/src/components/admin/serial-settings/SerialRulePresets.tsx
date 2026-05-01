import { useI18n } from "../../../i18n";
import { Button, Icon, PanelCard } from "../../ui";

export function SerialRulePresets() {
  const { t } = useI18n();
  const presets = [
    [t("admin.serialSettings.presets.yearly"), "DOC-{YEAR}-{SEQUENCE}"],
    [t("admin.serialSettings.presets.monthly"), "DOC-{YEAR}-{MONTH}-{SEQUENCE}"],
    [t("admin.serialSettings.presets.unitScoped"), "{ORG}-{DOC}-{YY}-{SEQUENCE}"],
    [t("admin.serialSettings.presets.legacy"), "DC-{YY}-{SEQ}"]
  ];

  return (
    <PanelCard className="overflow-hidden" title={t("admin.serialSettings.presets.title")}>
      <div className="space-y-2">
        {presets.map(([label, format]) => (
          <article className="flex flex-col gap-3 rounded-lg border border-slate-200 bg-white px-3 py-2 sm:flex-row sm:items-center sm:justify-between" key={label}>
            <div className="flex min-w-0 items-center gap-3">
              <Icon className="h-5 w-5 shrink-0 text-[#061d49]" name="serial" />
              <div className="min-w-0">
                <p className="truncate text-sm font-bold text-slate-800">{label}</p>
                <p className="truncate font-mono text-xs text-slate-500">{format}</p>
              </div>
            </div>
            <Button className="w-full shrink-0 px-3 py-1.5 text-xs sm:w-auto" icon="template">{t("admin.serialSettings.presets.usePreset")}</Button>
          </article>
        ))}
      </div>
    </PanelCard>
  );
}
