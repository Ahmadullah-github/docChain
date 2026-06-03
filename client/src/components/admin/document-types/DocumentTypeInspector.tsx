import { useI18n } from "../../../i18n";
import { Button, Icon, PanelCard, StatusBadge } from "../../ui";
import { statusTone } from "./documentTypeUtils";
import type { DocumentTypeRow } from "./types";

type DocumentTypeInspectorProps = {
  onCloneType?: (row: DocumentTypeRow) => void;
  onDisableType?: (row: DocumentTypeRow) => void;
  onEditType?: (row: DocumentTypeRow) => void;
  selectedType: DocumentTypeRow | null;
};

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50/70 px-3 py-2">
      <dt className="text-[0.68rem] font-bold uppercase tracking-wide text-slate-500">{label}</dt>
      <dd className="mt-1 whitespace-normal break-normal text-sm font-semibold leading-5 text-slate-900 [overflow-wrap:anywhere]">{value}</dd>
    </div>
  );
}

export function DocumentTypeInspector({ onCloneType, onDisableType, onEditType, selectedType }: DocumentTypeInspectorProps) {
  const { t } = useI18n();

  return (
    <div className="space-y-3">
      <PanelCard className="overflow-hidden" title={t("admin.documentTypes.inspector.title")}>
        {selectedType ? (
          <div className="space-y-4">
            <div className="flex gap-3">
              <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-blue-50 text-[#061d49] ring-1 ring-blue-200">
                <Icon className="h-7 w-7" name="document" />
              </div>
              <div className="min-w-0">
                <h3 className="text-balance text-lg font-bold leading-6 text-slate-950">{selectedType.name}</h3>
                <p className="mt-1 font-mono text-sm font-semibold text-slate-500">{selectedType.code}</p>
                <div className="mt-2 flex flex-wrap gap-2">
                  <StatusBadge tone={statusTone(selectedType.status)}>{selectedType.status}</StatusBadge>
                  <StatusBadge tone="green">{t("admin.documentTypes.inspector.serialRequired")}</StatusBadge>
                </div>
              </div>
            </div>

            <dl className="grid gap-2">
              <DetailRow label={t("admin.documentTypes.inspector.name")} value={selectedType.name} />
              <DetailRow label={t("admin.documentTypes.inspector.code")} value={selectedType.code} />
              <DetailRow label={t("admin.documentTypes.inspector.status")} value={selectedType.status} />
              <DetailRow label={t("admin.documentTypes.inspector.documents")} value={String(selectedType.documentCount)} />
              <DetailRow label={t("admin.documentTypes.inspector.templateBindings")} value={String(selectedType.templateBindingsCount)} />
              <DetailRow label={t("admin.documentTypes.inspector.serialRequired")} value={t("common.yes")} />
            </dl>

            <div className="grid gap-2 sm:grid-cols-3">
              <Button disabled={!onEditType} icon="edit" onClick={() => onEditType?.(selectedType)}>{t("admin.documentTypes.inspector.editType")}</Button>
              <Button disabled={!onCloneType} icon="template" onClick={() => onCloneType?.(selectedType)}>{t("admin.documentTypes.inspector.cloneType")}</Button>
              <Button disabled={!onDisableType || selectedType.status !== "active"} icon="pause" onClick={() => onDisableType?.(selectedType)} variant="danger">{t("admin.documentTypes.inspector.disableType")}</Button>
            </div>
          </div>
        ) : (
          <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
            {t("admin.documentTypes.inspector.empty")}
          </div>
        )}
      </PanelCard>
    </div>
  );
}
