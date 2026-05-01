import { useI18n } from "../../../i18n";
import { Button, Icon, PanelCard, SelectFilter, StatusBadge } from "../../ui";
import { statusTone } from "./documentTypeUtils";
import type { DocumentTypeRow } from "./types";

type DocumentTypeProfileBuilderProps = {
  onSelectStatus: (status: string) => void;
  selectedStatus: string;
  selectedType: DocumentTypeRow | null;
};

function FieldCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 rounded-xl border border-slate-200 bg-white px-4 py-3">
      <p className="text-xs font-bold uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-1 break-words text-sm font-bold leading-5 text-slate-900">{value}</p>
    </div>
  );
}

export function DocumentTypeProfileBuilder({ onSelectStatus, selectedStatus, selectedType }: DocumentTypeProfileBuilderProps) {
  const { t } = useI18n();

  return (
    <PanelCard className="h-full overflow-hidden" title={t("admin.documentTypes.builder.title")}>
      {selectedType ? (
        <div className="space-y-4">
          <section className="rounded-2xl border border-blue-100 bg-[radial-gradient(circle_at_top_left,#dbeafe,transparent_34%),linear-gradient(135deg,#fff,#f8fbff)] p-4">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
              <div className="min-w-0">
                <p className="text-xs font-bold uppercase tracking-wide text-blue-700">{t("admin.documentTypes.builder.selectedType")}</p>
                <h2 className="mt-2 text-balance text-2xl font-black leading-7 text-[#061d49]">{selectedType.name}</h2>
                <p className="mt-1 font-mono text-sm font-bold text-slate-500">{selectedType.code}</p>
              </div>
              <div className="flex shrink-0 flex-wrap gap-2">
                <StatusBadge tone={statusTone(selectedType.status)}>{selectedType.status}</StatusBadge>
                <StatusBadge tone={selectedType.requiresSerial ? "green" : "slate"}>
                  {selectedType.requiresSerial ? t("admin.documentTypes.builder.serialRequired") : t("admin.documentTypes.builder.serialOptional")}
                </StatusBadge>
              </div>
            </div>
          </section>

          <section className="rounded-xl border border-slate-100 bg-slate-50/60 p-4">
            <div className="grid gap-3 md:grid-cols-3">
              <FieldCard label={t("admin.documentTypes.builder.code")} value={selectedType.code} />
              <FieldCard
                label={t("admin.documentTypes.builder.serial")}
                value={selectedType.requiresSerial ? t("common.yes") : t("common.no")}
              />
              <label className="min-w-0 space-y-1 text-xs font-bold text-slate-600">
                <span>{t("admin.documentTypes.builder.status")}</span>
                <SelectFilter className="w-full min-w-0" value={selectedStatus} onChange={(event) => onSelectStatus(event.target.value)}>
                  <option value="all">{t("admin.documentTypes.directory.statusAll")}</option>
                  <option value="active">{t("admin.documentTypes.status.active")}</option>
                  <option value="draft">{t("admin.documentTypes.status.draft")}</option>
                  <option value="inactive">{t("admin.documentTypes.status.inactive")}</option>
                  <option value="archived">{t("admin.documentTypes.status.archived")}</option>
                </SelectFilter>
              </label>
            </div>
          </section>

          <section className="rounded-xl border border-slate-200 bg-white p-4">
            <p className="text-xs font-bold uppercase tracking-wide text-slate-500">{t("admin.documentTypes.builder.description")}</p>
            <p className="mt-2 text-sm leading-6 text-slate-700">{selectedType.description}</p>
          </section>

          <div className="rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-sm leading-6 text-[#061d49]">
            <div className="flex gap-3">
              <Icon className="mt-0.5 h-5 w-5 shrink-0" name="document" />
              <p>
                {t("admin.documentTypes.builder.explanation", {
                  code: selectedType.code,
                  routing: selectedType.routingRulesCount,
                  signatures: selectedType.signatureRulesCount
                })}
              </p>
            </div>
          </div>

          <div className="grid gap-2 sm:grid-cols-3">
            <Button icon="document" variant="primary">{t("admin.documentTypes.builder.saveType")}</Button>
            <Button icon="template">{t("admin.documentTypes.builder.saveDraft")}</Button>
            <Button>{t("admin.documentTypes.builder.cancel")}</Button>
          </div>
        </div>
      ) : (
        <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
          {t("admin.documentTypes.builder.empty")}
        </div>
      )}
    </PanelCard>
  );
}
