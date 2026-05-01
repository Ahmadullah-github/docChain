import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { adminApi, routingRulesApi, signatureApi } from "../../api";
import type { DocumentType, EntityId, JsonRecord, Position, RoutingRule, RoutingRuleDetail, UnitType } from "../../api";
import { AdminPageHeader } from "../../components/admin";
import {
  buildConflictQueue,
  buildWorkflowRows,
  EasyWorkflowBuilder,
  WorkflowCanvas,
  WorkflowConflictQueue,
  WorkflowRuleDirectory,
  WorkflowRuleHelp,
  WorkflowRuleInspector,
  WorkflowRuleStats,
  WorkflowRuleTemplates
} from "../../components/admin/workflow-rules";
import type { WorkflowRulesPageData } from "../../components/admin/workflow-rules";
import { Button } from "../../components/ui";
import { useI18n } from "../../i18n";

const emptyData: WorkflowRulesPageData = {
  documentTypes: [],
  positions: [],
  routingDetails: new Map<EntityId, RoutingRuleDetail | null>(),
  routingRules: [],
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

function chooseDefaultRule(rows: ReturnType<typeof buildWorkflowRows>) {
  return rows.find((row) => row.status === "active" && row.warningIssues.length === 0)
    || rows.find((row) => row.status === "active")
    || rows[0]
    || null;
}

function findMatchingRule(
  rows: ReturnType<typeof buildWorkflowRows>,
  documentTypeId: string,
  originUnitTypeId: string,
  status: string
) {
  return rows.find((row) => {
    const matchesDocumentType = documentTypeId === "all" || String(row.documentTypeId || "") === documentTypeId;
    const matchesOrigin = originUnitTypeId === "all" || String(row.originUnitType?.id || "") === originUnitTypeId;
    const matchesStatus = status === "all" || row.status === status;
    return matchesDocumentType && matchesOrigin && matchesStatus;
  }) || null;
}

export function AdminWorkflowRulesPage() {
  const { t } = useI18n();
  const [searchParams] = useSearchParams();
  const [data, setData] = useState<WorkflowRulesPageData>(emptyData);
  const [loading, setLoading] = useState(true);
  const [selectedRuleId, setSelectedRuleId] = useState<EntityId | null>(null);
  const [builderStatus, setBuilderStatus] = useState("all");

  useEffect(() => {
    let alive = true;

    async function loadWorkflowRules() {
      setLoading(true);
      const [
        routingRules,
        signatureRules,
        serialRules,
        visibilityRules,
        documentTypes,
        unitTypes,
        positions
      ] = await Promise.all([
        safe(routingRulesApi.list({ limit: 100 }), [] as RoutingRule[]),
        safe(signatureApi.listSignatureRules(), [] as JsonRecord[]),
        safe(signatureApi.listSerialRules(), [] as JsonRecord[]),
        safe(adminApi.visibilityRules.list(), [] as JsonRecord[]),
        safe(adminApi.documentTypes.list(), [] as DocumentType[]),
        safe(adminApi.unitTypes.list(), [] as UnitType[]),
        safe(adminApi.positions.list(), [] as Position[])
      ]);

      const detailEntries = await Promise.all(
        routingRules.map(async (rule) => [
          rule.id,
          await safe(routingRulesApi.get(rule.id), null as RoutingRuleDetail | null)
        ] as const)
      );

      if (alive) {
        setData({
          documentTypes,
          positions,
          routingDetails: new Map(detailEntries),
          routingRules,
          serialRules,
          signatureRules,
          unitTypes,
          visibilityRules
        });
        setLoading(false);
      }
    }

    void loadWorkflowRules();

    return () => {
      alive = false;
    };
  }, []);

  const rows = useMemo(() => buildWorkflowRows(data), [data]);
  const conflictQueue = useMemo(() => buildConflictQueue(rows), [rows]);

  useEffect(() => {
    const selectedStillExists = selectedRuleId ? rows.some((row) => row.id === selectedRuleId) : false;
    if (!selectedStillExists) {
      setSelectedRuleId(chooseDefaultRule(rows)?.id || null);
    }
  }, [rows, selectedRuleId]);

  useEffect(() => {
    const ruleId = searchParams.get("ruleId");
    const originUnitTypeId = searchParams.get("originUnitTypeId");
    if (!rows.length || (!ruleId && !originUnitTypeId)) {
      return;
    }

    const match = ruleId
      ? rows.find((row) => String(row.id) === ruleId)
      : rows.find((row) => String(row.originUnitType?.id || "") === originUnitTypeId);

    if (match && match.id !== selectedRuleId) {
      setSelectedRuleId(match.id);
    }
  }, [rows, searchParams, selectedRuleId]);

  const selectedRule = rows.find((row) => row.id === selectedRuleId) || null;
  const stats = {
    active: rows.filter((row) => row.status === "active").length,
    documentTypes: new Set(rows.map((row) => row.documentTypeId).filter(Boolean)).size,
    signatureRules: data.signatureRules.length,
    total: rows.length,
    visibilityRules: data.visibilityRules.length,
    warnings: conflictQueue.length
  };

  function handleSelectScope(documentTypeId: string, originUnitTypeId: string) {
    const match = findMatchingRule(rows, documentTypeId, originUnitTypeId, builderStatus)
      || findMatchingRule(rows, documentTypeId, originUnitTypeId, "all");

    if (match) {
      setSelectedRuleId(match.id);
    }
  }

  function handleSelectRuleStatus(status: string) {
    setBuilderStatus(status);

    if (!selectedRule) {
      return;
    }

    const match = findMatchingRule(
      rows,
      selectedRule.documentTypeId ? String(selectedRule.documentTypeId) : "all",
      selectedRule.originUnitType?.id ? String(selectedRule.originUnitType.id) : "all",
      status
    ) || (status === "all" ? selectedRule : rows.find((row) => row.status === status) || null);

    if (match) {
      setSelectedRuleId(match.id);
    }
  }

  return (
    <div className="space-y-4">
      <AdminPageHeader
        actions={(
          <>
            <Button icon="plus" variant="primary">{t("admin.workflowRules.actions.newRule")}</Button>
            <Button icon="template">{t("admin.workflowRules.actions.useTemplate")}</Button>
            <Button icon="settings" variant="primary">{t("admin.workflowRules.actions.guidedBuilder")}</Button>
            <Button icon="export">{t("admin.workflowRules.actions.exportRules")}</Button>
          </>
        )}
        description={t("admin.workflowRules.description")}
        title={t("admin.workflowRules.title")}
      />

      <WorkflowRuleStats
        labels={{
          active: t("admin.workflowRules.stats.active"),
          documentTypes: t("admin.workflowRules.stats.documentTypes"),
          signatureRules: t("admin.workflowRules.stats.signatureRules"),
          total: t("admin.workflowRules.stats.total"),
          visibilityRules: t("admin.workflowRules.stats.visibilityRules"),
          warnings: t("admin.workflowRules.stats.warnings")
        }}
        loading={loading}
        stats={stats}
      />

      <section className="grid min-w-0 gap-4 2xl:grid-cols-[minmax(23rem,1fr)_minmax(23rem,1fr)_minmax(27rem,.8fr)]">
        <div className="min-w-0">
          <EasyWorkflowBuilder
            documentTypes={data.documentTypes}
            onSelectRuleStatus={handleSelectRuleStatus}
            onSelectScope={handleSelectScope}
            selectedRule={selectedRule}
            selectedStatus={builderStatus}
            unitTypes={data.unitTypes}
          />
        </div>
        <div className="min-w-0">
          <WorkflowCanvas selectedRule={selectedRule} />
        </div>
        <div className="min-w-0">
          <WorkflowRuleInspector selectedRule={selectedRule} />
        </div>
      </section>

      <section className="min-w-0 space-y-4">
        <WorkflowRuleDirectory
          documentTypes={data.documentTypes}
          onSelectRule={setSelectedRuleId}
          rows={rows}
          selectedRuleId={selectedRuleId}
          unitTypes={data.unitTypes}
        />
        <div className="grid min-w-0 gap-4 lg:grid-cols-2 xl:grid-cols-3">
          <WorkflowRuleTemplates />
          <WorkflowRuleHelp />
          <WorkflowConflictQueue rows={conflictQueue} />
        </div>
      </section>
    </div>
  );
}
