import { useEffect, useMemo, useState } from "react";
import { adminApi, signatureApi } from "../../api";
import type { DocumentType, JsonRecord, Position, UnitType } from "../../api";
import { AdminPageHeader } from "../../components/admin";
import {
  buildSignatureConflicts,
  buildSignatureRuleRows,
  EasySignatureBuilder,
  SignatureConflictQueue,
  SignatureFlowPreview,
  SignaturePlacementPreview,
  SignatureRuleDirectory,
  SignatureRuleHelp,
  SignatureRuleInspector,
  SignatureRuleStats,
  SignatureRuleTemplates
} from "../../components/admin/signature-rules";
import type { SignatureRulesPageData } from "../../components/admin/signature-rules";
import { Button } from "../../components/ui";
import { useI18n } from "../../i18n";

const emptyData: SignatureRulesPageData = {
  documentTypes: [],
  positions: [],
  serialRules: [],
  signatureRules: [],
  unitTypes: [],
  visibilityRules: []
};

async function safe<T>(promise: Promise<T>, fallback: T) {
  try {
    return await promise;
  } catch {
    return fallback;
  }
}

function chooseDefaultChain(rows: ReturnType<typeof buildSignatureRuleRows>) {
  return rows.find((row) => row.status === "active" && row.warningIssues.length === 0)
    || rows.find((row) => row.status === "active")
    || rows[0]
    || null;
}

function findMatchingChain(
  rows: ReturnType<typeof buildSignatureRuleRows>,
  documentTypeId: string,
  originUnitTypeId: string,
  status: string
) {
  return rows.find((row) => {
    const matchesDocumentType = documentTypeId === "all" || String(row.documentTypeId || "") === documentTypeId;
    const matchesOrigin = originUnitTypeId === "any" || String(row.originUnitType?.id || "") === originUnitTypeId;
    const matchesStatus = status === "all" || row.status === status;
    return matchesDocumentType && matchesOrigin && matchesStatus;
  }) || null;
}

export function AdminSignatureRulesPage() {
  const { t } = useI18n();
  const [data, setData] = useState<SignatureRulesPageData>(emptyData);
  const [loading, setLoading] = useState(true);
  const [selectedChainId, setSelectedChainId] = useState<string | null>(null);
  const [builderStatus, setBuilderStatus] = useState("all");

  useEffect(() => {
    let alive = true;

    async function loadSignatureRules() {
      setLoading(true);
      const [signatureRules, serialRules, visibilityRules, documentTypes, unitTypes, positions] = await Promise.all([
        safe(signatureApi.listSignatureRules(), [] as JsonRecord[]),
        safe(signatureApi.listSerialRules(), [] as JsonRecord[]),
        safe(adminApi.visibilityRules.list(), [] as JsonRecord[]),
        safe(adminApi.documentTypes.list(), [] as DocumentType[]),
        safe(adminApi.unitTypes.list(), [] as UnitType[]),
        safe(adminApi.positions.list(), [] as Position[])
      ]);

      if (alive) {
        setData({ documentTypes, positions, serialRules, signatureRules, unitTypes, visibilityRules });
        setLoading(false);
      }
    }

    void loadSignatureRules();

    return () => {
      alive = false;
    };
  }, []);

  const rows = useMemo(() => buildSignatureRuleRows(data), [data]);
  const conflictQueue = useMemo(() => buildSignatureConflicts(rows), [rows]);

  useEffect(() => {
    const selectedStillExists = selectedChainId ? rows.some((row) => row.id === selectedChainId) : false;
    if (!selectedStillExists) {
      setSelectedChainId(chooseDefaultChain(rows)?.id || null);
    }
  }, [rows, selectedChainId]);

  const selectedChain = rows.find((row) => row.id === selectedChainId) || null;
  const stats = {
    activeChains: rows.filter((row) => row.status === "active").length,
    documentTypes: new Set(rows.map((row) => row.documentTypeId).filter(Boolean)).size,
    finalRules: data.signatureRules.filter((rule) => rule.can_finalize_document === true || rule.can_finalize_document === 1).length,
    total: data.signatureRules.length,
    visibilityRules: data.visibilityRules.length,
    warnings: conflictQueue.length
  };

  function handleSelectScope(documentTypeId: string, originUnitTypeId: string) {
    const match = findMatchingChain(rows, documentTypeId, originUnitTypeId, builderStatus)
      || findMatchingChain(rows, documentTypeId, originUnitTypeId, "all");

    if (match) {
      setSelectedChainId(match.id);
    }
  }

  function handleSelectStatus(status: string) {
    setBuilderStatus(status);

    if (!selectedChain) {
      return;
    }

    const match = findMatchingChain(
      rows,
      selectedChain.documentTypeId ? String(selectedChain.documentTypeId) : "all",
      selectedChain.originUnitType?.id ? String(selectedChain.originUnitType.id) : "any",
      status
    ) || (status === "all" ? selectedChain : rows.find((row) => row.status === status) || null);

    if (match) {
      setSelectedChainId(match.id);
    }
  }

  return (
    <div className="space-y-4">
      <AdminPageHeader
        actions={(
          <>
            <Button icon="plus" variant="primary">{t("admin.signatureRules.actions.newRule")}</Button>
            <Button icon="template">{t("admin.signatureRules.actions.useTemplate")}</Button>
            <Button icon="settings" variant="primary">{t("admin.signatureRules.actions.guidedBuilder")}</Button>
            <Button icon="export">{t("admin.signatureRules.actions.exportRules")}</Button>
          </>
        )}
        description={t("admin.signatureRules.description")}
        title={t("admin.signatureRules.title")}
      />

      <SignatureRuleStats
        labels={{
          activeChains: t("admin.signatureRules.stats.activeChains"),
          documentTypes: t("admin.signatureRules.stats.documentTypes"),
          finalRules: t("admin.signatureRules.stats.finalRules"),
          total: t("admin.signatureRules.stats.total"),
          visibilityRules: t("admin.signatureRules.stats.visibilityRules"),
          warnings: t("admin.signatureRules.stats.warnings")
        }}
        loading={loading}
        stats={stats}
      />

      <section className="grid min-w-0 gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(24rem,.7fr)] min-[1800px]:grid-cols-[minmax(0,1.08fr)_minmax(24rem,.82fr)_minmax(27rem,.72fr)]">
        <div className="min-w-0">
          <EasySignatureBuilder
            documentTypes={data.documentTypes}
            onSelectScope={handleSelectScope}
            onSelectStatus={handleSelectStatus}
            selectedChain={selectedChain}
            selectedStatus={builderStatus}
            unitTypes={data.unitTypes}
          />
        </div>
        <div className="min-w-0 space-y-4">
          <SignatureFlowPreview selectedChain={selectedChain} />
          <SignaturePlacementPreview selectedChain={selectedChain} />
        </div>
        <div className="min-w-0 xl:col-span-2 min-[1800px]:col-span-1">
          <SignatureRuleInspector selectedChain={selectedChain} />
        </div>
      </section>

      <section className="min-w-0 space-y-4">
        <SignatureRuleDirectory
          documentTypes={data.documentTypes}
          onSelectChain={setSelectedChainId}
          rows={rows}
          selectedChainId={selectedChainId}
          unitTypes={data.unitTypes}
        />
        <div className="grid min-w-0 gap-4 lg:grid-cols-2 xl:grid-cols-3">
          <SignatureRuleTemplates />
          <SignatureRuleHelp />
          <SignatureConflictQueue rows={conflictQueue} />
        </div>
      </section>
    </div>
  );
}
