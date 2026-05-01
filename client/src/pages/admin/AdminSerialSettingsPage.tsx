import { useEffect, useMemo, useState } from "react";
import { adminApi, signatureApi } from "../../api";
import type { DocumentType, EntityId, JsonRecord } from "../../api";
import { AdminPageHeader } from "../../components/admin";
import {
  buildSerialConflicts,
  buildSerialRuleRows,
  SerialConflictQueue,
  SerialFormatBuilder,
  SerialGovernanceReminder,
  SerialPreviewPanel,
  SerialRuleDirectory,
  SerialRuleInspector,
  SerialRulePresets,
  SerialSettingsStats
} from "../../components/admin/serial-settings";
import type { SerialSettingsPageData } from "../../components/admin/serial-settings";
import { Button } from "../../components/ui";
import { useI18n } from "../../i18n";

const emptyData: SerialSettingsPageData = {
  documentTypes: [],
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

function chooseDefaultRule(rows: ReturnType<typeof buildSerialRuleRows>) {
  return rows.find((row) => row.status === "active" && row.isDefault)
    || rows.find((row) => row.status === "active" && row.warningIssues.length === 0)
    || rows.find((row) => row.status === "active")
    || rows[0]
    || null;
}

function isFinalSignatureRule(rule: JsonRecord) {
  const value = rule.can_finalize_document;
  return value === true || value === 1 || value === "1" || value === "true";
}

export function AdminSerialSettingsPage() {
  const { t } = useI18n();
  const [data, setData] = useState<SerialSettingsPageData>(emptyData);
  const [loading, setLoading] = useState(true);
  const [selectedRuleId, setSelectedRuleId] = useState<EntityId | null>(null);
  const [builderStatus, setBuilderStatus] = useState("all");

  useEffect(() => {
    let alive = true;

    async function loadSerialSettings() {
      setLoading(true);

      const [serialRules, signatureRules, visibilityRules, documentTypes] = await Promise.all([
        safe(signatureApi.listSerialRules(), [] as JsonRecord[]),
        safe(signatureApi.listSignatureRules(), [] as JsonRecord[]),
        safe(adminApi.visibilityRules.list(), [] as JsonRecord[]),
        safe(adminApi.documentTypes.list(), [] as DocumentType[])
      ]);

      if (alive) {
        setData({ documentTypes, serialRules, signatureRules, visibilityRules });
        setLoading(false);
      }
    }

    void loadSerialSettings();

    return () => {
      alive = false;
    };
  }, []);

  const rows = useMemo(() => buildSerialRuleRows(data), [data]);
  const conflictQueue = useMemo(() => buildSerialConflicts(rows), [rows]);

  useEffect(() => {
    const selectedStillExists = selectedRuleId ? rows.some((row) => row.id === selectedRuleId) : false;
    if (!selectedStillExists) {
      setSelectedRuleId(chooseDefaultRule(rows)?.id || null);
    }
  }, [rows, selectedRuleId]);

  const selectedRule = rows.find((row) => row.id === selectedRuleId) || null;
  const stats = {
    active: rows.filter((row) => row.status === "active").length,
    defaultRules: rows.filter((row) => row.isDefault).length,
    documentTypes: data.documentTypes.filter((documentType) => documentType.requires_serial).length,
    finalSignatureRules: data.signatureRules.filter(isFinalSignatureRule).length,
    total: rows.length,
    warnings: conflictQueue.length
  };

  function handleSelectStatus(status: string) {
    setBuilderStatus(status);

    const match = status === "all"
      ? selectedRule || chooseDefaultRule(rows)
      : rows.find((row) => row.id === selectedRuleId && row.status === status)
        || rows.find((row) => row.status === status)
        || null;

    if (match) {
      setSelectedRuleId(match.id);
    }
  }

  return (
    <div className="space-y-4">
      <AdminPageHeader
        actions={(
          <>
            <Button icon="plus" variant="primary">{t("admin.serialSettings.actions.newRule")}</Button>
            <Button icon="template">{t("admin.serialSettings.actions.usePreset")}</Button>
            <Button icon="serial" variant="primary">{t("admin.serialSettings.actions.testNumber")}</Button>
            <Button icon="export">{t("admin.serialSettings.actions.exportRules")}</Button>
          </>
        )}
        description={t("admin.serialSettings.description")}
        title={t("admin.serialSettings.title")}
      />

      <SerialSettingsStats
        labels={{
          active: t("admin.serialSettings.stats.active"),
          defaultRules: t("admin.serialSettings.stats.defaultRules"),
          documentTypes: t("admin.serialSettings.stats.documentTypes"),
          finalSignatureRules: t("admin.serialSettings.stats.finalSignatureRules"),
          total: t("admin.serialSettings.stats.total"),
          warnings: t("admin.serialSettings.stats.warnings")
        }}
        loading={loading}
        stats={stats}
      />

      <section className="grid min-w-0 gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(24rem,.72fr)] min-[1800px]:grid-cols-[minmax(0,1.05fr)_minmax(24rem,.7fr)_minmax(27rem,.72fr)]">
        <div className="min-w-0">
          <SerialFormatBuilder
            onSelectStatus={handleSelectStatus}
            selectedRule={selectedRule}
            selectedStatus={builderStatus}
          />
        </div>
        <div className="min-w-0">
          <SerialPreviewPanel selectedRule={selectedRule} />
        </div>
        <div className="min-w-0 xl:col-span-2 min-[1800px]:col-span-1">
          <SerialRuleInspector selectedRule={selectedRule} />
        </div>
      </section>

      <section className="min-w-0 space-y-4">
        <SerialRuleDirectory
          onSelectRule={setSelectedRuleId}
          rows={rows}
          selectedRuleId={selectedRuleId}
        />
        <div className="grid min-w-0 gap-4 lg:grid-cols-2 xl:grid-cols-3">
          <SerialRulePresets />
          <SerialGovernanceReminder />
          <SerialConflictQueue rows={conflictQueue} />
        </div>
      </section>
    </div>
  );
}
