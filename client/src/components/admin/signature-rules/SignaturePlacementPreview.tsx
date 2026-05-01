import { useI18n } from "../../../i18n";
import { Button, PanelCard } from "../../ui";
import type { SignatureRuleChainRow } from "./types";

type SignaturePlacementPreviewProps = {
  selectedChain: SignatureRuleChainRow | null;
};

function DocumentPreview({ label }: { label: string }) {
  return (
    <article className="min-w-0 rounded-lg border border-slate-200 bg-white p-3 shadow-sm">
      <p className="mb-2 text-center text-xs font-bold text-slate-600">{label}</p>
      <div className="space-y-2">
        <span className="block h-1.5 rounded bg-slate-200" />
        <span className="block h-1.5 rounded bg-slate-200" />
        <span className="block h-1.5 w-3/4 rounded bg-slate-200" />
        <span className="block h-1.5 rounded bg-slate-100" />
      </div>
      <div className="ms-auto mt-5 flex h-10 w-16 items-center justify-center rounded border border-blue-300 bg-blue-50 font-serif text-blue-700">
        Sign
      </div>
    </article>
  );
}

export function SignaturePlacementPreview({ selectedChain }: SignaturePlacementPreviewProps) {
  const { t } = useI18n();

  return (
    <PanelCard className="overflow-hidden" title={t("admin.signatureRules.placement.title")}>
      {selectedChain ? (
        <div className="grid min-w-0 grid-cols-2 gap-3">
          <DocumentPreview label={t("admin.signatureRules.placement.firstPage")} />
          <DocumentPreview label={t("admin.signatureRules.placement.lastPage")} />
          <div className="col-span-2 min-w-0 text-sm leading-6 text-slate-700">
            <p>{t("admin.signatureRules.placement.description")}</p>
            <p className="mt-1 font-semibold text-slate-950">{selectedChain.placement}</p>
            <Button className="mt-3 px-3 py-1.5 text-xs" icon="edit">{t("admin.signatureRules.placement.change")}</Button>
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
