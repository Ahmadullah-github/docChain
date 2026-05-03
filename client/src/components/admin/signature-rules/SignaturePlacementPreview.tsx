import { useI18n } from "../../../i18n";
import { Button, PanelCard } from "../../ui";
import type { SignatureRuleChainRow } from "./types";

type SignaturePlacementPreviewProps = {
  onChangePlacement?: (row: SignatureRuleChainRow) => void;
  selectedChain: SignatureRuleChainRow | null;
};

function DocumentPreview({ label }: { label: string }) {
  return (
    <article className="min-w-0 rounded-lg border border-slate-200 bg-white p-2.5">
      <p className="mb-2 text-center text-xs font-bold text-slate-600">{label}</p>
      <div className="space-y-2">
        <span className="block h-1.5 rounded bg-slate-200" />
        <span className="block h-1.5 rounded bg-slate-200" />
        <span className="block h-1.5 w-3/4 rounded bg-slate-200" />
        <span className="block h-1.5 rounded bg-slate-100" />
      </div>
      <div className="ms-auto mt-4 flex h-9 w-14 items-center justify-center rounded border border-blue-300 bg-blue-50 font-serif text-xs text-blue-700">
        Sign
      </div>
    </article>
  );
}

export function SignaturePlacementPreview({ onChangePlacement, selectedChain }: SignaturePlacementPreviewProps) {
  const { t } = useI18n();

  return (
    <PanelCard bodyClassName="p-3 sm:p-4" className="overflow-hidden" title={t("admin.signatureRules.placement.title")}>
      {selectedChain ? (
        <div className="grid min-w-0 gap-3">
          <div className="grid min-w-0 grid-cols-2 gap-3 rounded-lg border border-slate-200 bg-slate-50/70 p-3">
            <DocumentPreview label={t("admin.signatureRules.placement.firstPage")} />
            <DocumentPreview label={t("admin.signatureRules.placement.lastPage")} />
          </div>
          <div className="min-w-0 rounded-lg border border-slate-200 bg-white p-3 text-sm leading-6 text-slate-700">
            <p>{t("admin.signatureRules.placement.description")}</p>
            <p className="mt-1 truncate font-semibold text-slate-950" title={selectedChain.placement}>{selectedChain.placement}</p>
            {onChangePlacement ? <Button className="mt-3 px-3 py-1.5 text-xs" icon="edit" onClick={() => onChangePlacement(selectedChain)}>{t("admin.signatureRules.placement.change")}</Button> : null}
          </div>
        </div>
      ) : (
        <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
          {t("admin.signatureRules.placement.empty")}
        </div>
      )}
    </PanelCard>
  );
}
