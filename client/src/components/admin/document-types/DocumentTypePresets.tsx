import { useI18n } from "../../../i18n";
import { Button, Icon, PanelCard } from "../../ui";

export function DocumentTypePresets() {
  const { t } = useI18n();
  const presets = [
    [t("admin.documentTypes.presets.officialLetter"), "OFFICIAL_LETTER"],
    [t("admin.documentTypes.presets.internalMemo"), "INTERNAL_MEMO"],
    [t("admin.documentTypes.presets.committeeReport"), "COMMITTEE_REPORT"],
    [t("admin.documentTypes.presets.policyDocument"), "POLICY_DOC"]
  ];

  return (
    <PanelCard className="overflow-hidden" title={t("admin.documentTypes.presets.title")}>
      <div className="space-y-2">
        {presets.map(([label, code]) => (
          <article className="flex flex-col gap-3 rounded-lg border border-slate-200 bg-white px-3 py-2 sm:flex-row sm:items-center sm:justify-between" key={code}>
            <div className="flex min-w-0 items-center gap-3">
              <Icon className="h-5 w-5 shrink-0 text-[#061d49]" name="document" />
              <div className="min-w-0">
                <p className="truncate text-sm font-bold text-slate-800">{label}</p>
                <p className="truncate font-mono text-xs text-slate-500">{code}</p>
              </div>
            </div>
            <Button className="w-full shrink-0 px-3 py-1.5 text-xs sm:w-auto" icon="template">{t("admin.documentTypes.presets.usePreset")}</Button>
          </article>
        ))}
      </div>
    </PanelCard>
  );
}
