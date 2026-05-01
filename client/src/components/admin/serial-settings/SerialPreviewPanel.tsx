import { useI18n } from "../../../i18n";
import { Icon, PanelCard, StatusBadge } from "../../ui";
import type { SerialRuleRow } from "./types";

type SerialPreviewPanelProps = {
  selectedRule: SerialRuleRow | null;
};

export function SerialPreviewPanel({ selectedRule }: SerialPreviewPanelProps) {
  const { t } = useI18n();

  return (
    <PanelCard className="h-full overflow-hidden" title={t("admin.serialSettings.preview.title")}>
      {selectedRule ? (
        <div className="space-y-4">
          <div className="rounded-2xl border border-blue-200 bg-[radial-gradient(circle_at_top,#dbeafe,transparent_42%),linear-gradient(180deg,#fff,#eff6ff)] p-5 text-center">
            <p className="text-xs font-bold uppercase tracking-wide text-slate-500">{t("admin.serialSettings.preview.nextSerial")}</p>
            <p className="mt-3 break-words font-mono text-3xl font-black tracking-tight text-[#061d49]">{selectedRule.sampleSerial}</p>
            <div className="mt-4 flex justify-center gap-2">
              <StatusBadge tone="blue">{selectedRule.resetPolicy}</StatusBadge>
              <StatusBadge tone={selectedRule.isDefault ? "green" : "slate"}>{selectedRule.isDefault ? "default" : "secondary"}</StatusBadge>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            {[
              [t("admin.serialSettings.preview.documentCreated"), "document"],
              [t("admin.serialSettings.preview.finalSignature"), "signature"],
              [t("admin.serialSettings.preview.serialAssigned"), "serial"]
            ].map(([label, icon], index) => (
              <article className="rounded-xl border border-slate-200 bg-white p-3 text-center" key={label}>
                <span className="mx-auto flex h-10 w-10 items-center justify-center rounded-full bg-blue-50 text-[#061d49]">
                  <Icon className="h-5 w-5" name={icon as "document" | "signature" | "serial"} />
                </span>
                <p className="mt-2 text-xs font-bold text-slate-700">{index + 1}. {label}</p>
              </article>
            ))}
          </div>

          <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm leading-6 text-slate-700">
            {t("admin.serialSettings.preview.note")}
          </div>
        </div>
      ) : (
        <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
          {t("admin.serialSettings.preview.empty")}
        </div>
      )}
    </PanelCard>
  );
}
