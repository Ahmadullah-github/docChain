import { useEffect, useMemo, useState } from "react";
import { adminApi, documentApi, routingRulesApi, signatureApi } from "../../api";
import type { DocumentListItem, DocumentType, EntityId, JsonRecord, RoutingRule } from "../../api";
import { AdminPageHeader } from "../../components/admin";
import {
  buildDocumentTypeConflicts,
  buildDocumentTypeRows,
  DocumentTypeCoveragePanel,
  DocumentTypeDirectory,
  DocumentTypeGovernanceReminder,
  DocumentTypeInspector,
  DocumentTypePresets,
  DocumentTypeProfileBuilder,
  DocumentTypeStats,
  DocumentTypeValidationQueue
} from "../../components/admin/document-types";
import type { DocumentTypePageData } from "../../components/admin/document-types";
import { Button } from "../../components/ui";
import { useI18n } from "../../i18n";

const emptyData: DocumentTypePageData = {
  documentTypes: [],
  documents: [],
  routingRules: [],
  serialRules: [],
  signatureRules: [],
  visibilityRules: []
};

async function safe<T>(promise: Promise<T>, fallback: T) {
  try {
    return await promise;
  } catch {
    return fallback;
  }
}

function chooseDefaultType(rows: ReturnType<typeof buildDocumentTypeRows>) {
  return rows.find((row) => row.status === "active" && row.warningIssues.length === 0)
    || rows.find((row) => row.status === "active")
    || rows[0]
    || null;
}

export function AdminDocumentTypesPage() {
  const { t } = useI18n();
  const [data, setData] = useState<DocumentTypePageData>(emptyData);
  const [loading, setLoading] = useState(true);
  const [selectedTypeId, setSelectedTypeId] = useState<EntityId | null>(null);
  const [builderStatus, setBuilderStatus] = useState("all");

  useEffect(() => {
    let alive = true;

    async function loadDocumentTypes() {
      setLoading(true);

      const [documentTypes, routingRules, signatureRules, serialRules, visibilityRules, documents] = await Promise.all([
        safe(adminApi.documentTypes.list(), [] as DocumentType[]),
        safe(routingRulesApi.list({ limit: 200 }), [] as RoutingRule[]),
        safe(signatureApi.listSignatureRules(), [] as JsonRecord[]),
        safe(signatureApi.listSerialRules(), [] as JsonRecord[]),
        safe(adminApi.visibilityRules.list(), [] as JsonRecord[]),
        safe(documentApi.list({ limit: 200 }), [] as DocumentListItem[])
      ]);

      if (alive) {
        setData({ documentTypes, documents, routingRules, serialRules, signatureRules, visibilityRules });
        setLoading(false);
      }
    }

    void loadDocumentTypes();

    return () => {
      alive = false;
    };
  }, []);

  const rows = useMemo(() => buildDocumentTypeRows(data), [data]);
  const conflictQueue = useMemo(() => buildDocumentTypeConflicts(rows), [rows]);

  useEffect(() => {
    const selectedStillExists = selectedTypeId ? rows.some((row) => row.id === selectedTypeId) : false;
    if (!selectedStillExists) {
      setSelectedTypeId(chooseDefaultType(rows)?.id || null);
    }
  }, [rows, selectedTypeId]);

  const selectedType = rows.find((row) => row.id === selectedTypeId) || null;
  const stats = {
    active: rows.filter((row) => row.status === "active").length,
    routed: rows.filter((row) => row.checks.routingConfigured).length,
    serialRequired: rows.filter((row) => row.requiresSerial).length,
    signed: rows.filter((row) => row.checks.signatureConfigured).length,
    total: rows.length,
    warnings: conflictQueue.length
  };

  function handleSelectStatus(status: string) {
    setBuilderStatus(status);

    const match = status === "all"
      ? selectedType || chooseDefaultType(rows)
      : rows.find((row) => row.id === selectedTypeId && row.status === status)
        || rows.find((row) => row.status === status)
        || null;

    if (match) {
      setSelectedTypeId(match.id);
    }
  }

  return (
    <div className="space-y-4">
      <AdminPageHeader
        actions={(
          <>
            <Button icon="plus" variant="primary">{t("admin.documentTypes.actions.newType")}</Button>
            <Button icon="template">{t("admin.documentTypes.actions.usePreset")}</Button>
            <Button icon="workflow" variant="primary">{t("admin.documentTypes.actions.viewMatrix")}</Button>
            <Button icon="export">{t("admin.documentTypes.actions.exportTypes")}</Button>
          </>
        )}
        description={t("admin.documentTypes.description")}
        title={t("admin.documentTypes.title")}
      />

      <DocumentTypeStats
        labels={{
          active: t("admin.documentTypes.stats.active"),
          routed: t("admin.documentTypes.stats.routed"),
          serialRequired: t("admin.documentTypes.stats.serialRequired"),
          signed: t("admin.documentTypes.stats.signed"),
          total: t("admin.documentTypes.stats.total"),
          warnings: t("admin.documentTypes.stats.warnings")
        }}
        loading={loading}
        stats={stats}
      />

      <section className="grid min-w-0 gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(24rem,.72fr)] min-[1800px]:grid-cols-[minmax(0,1.05fr)_minmax(24rem,.72fr)_minmax(27rem,.72fr)]">
        <div className="min-w-0">
          <DocumentTypeProfileBuilder
            onSelectStatus={handleSelectStatus}
            selectedStatus={builderStatus}
            selectedType={selectedType}
          />
        </div>
        <div className="min-w-0">
          <DocumentTypeCoveragePanel selectedType={selectedType} />
        </div>
        <div className="min-w-0 xl:col-span-2 min-[1800px]:col-span-1">
          <DocumentTypeInspector selectedType={selectedType} />
        </div>
      </section>

      <section className="min-w-0 space-y-4">
        <DocumentTypeDirectory
          onSelectType={setSelectedTypeId}
          rows={rows}
          selectedTypeId={selectedTypeId}
        />
        <div className="grid min-w-0 gap-4 lg:grid-cols-2 xl:grid-cols-3">
          <DocumentTypePresets />
          <DocumentTypeGovernanceReminder />
          <DocumentTypeValidationQueue rows={conflictQueue} />
        </div>
      </section>
    </div>
  );
}
