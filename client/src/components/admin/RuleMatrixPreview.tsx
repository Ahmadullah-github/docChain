import type { RoutingRuleDetail } from "../../api";
import { useI18n } from "../../i18n";
import { DataTable, StatusBadge } from "../ui";

type RuleMatrixPreviewProps = {
  emptyLabel: string;
  rules: RoutingRuleDetail[];
};

function text(value: unknown, fallback = "-") {
  return value == null || value === "" ? fallback : String(value);
}

export function RuleMatrixPreview({ emptyLabel, rules }: RuleMatrixPreviewProps) {
  const { t } = useI18n();

  return (
    <DataTable
      columns={[
        {
          key: "documentType",
          header: t("admin.dashboard.routing.columns.documentType"),
          cell: (row) => text(row.rule.documentTypeCode || row.rule.document_type_id, t("common.all"))
        },
        {
          key: "from",
          header: t("admin.dashboard.routing.columns.from"),
          cell: (row) => text(row.rule.fromUnitTypeCode || row.rule.from_unit_type_id, t("common.any")),
          hideOnMobile: true
        },
        {
          key: "action",
          header: t("admin.dashboard.routing.columns.action"),
          cell: (row) => <span className="font-medium text-slate-900">{text(row.rule.action)}</span>
        },
        {
          key: "to",
          header: t("admin.dashboard.routing.columns.to"),
          cell: (row) => text(row.rule.toUnitTypeCode || row.rule.to_unit_type_id, t("common.any")),
          hideOnMobile: true
        },
        {
          key: "allowed",
          header: t("admin.dashboard.routing.columns.allowed"),
          cell: (row) => <StatusBadge>{text(row.rule.allowed)}</StatusBadge>
        }
      ]}
      emptyLabel={emptyLabel}
      getRowKey={(row) => row.rule.id}
      rows={rules}
    />
  );
}
