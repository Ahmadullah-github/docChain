import type { JsonRecord } from "../../api";
import { useI18n } from "../../i18n";
import { DataTable, StatusBadge } from "../ui";

type SignatureRuleMatrixProps = {
  emptyLabel: string;
  rules: JsonRecord[];
};

function text(value: unknown, fallback = "-") {
  return value == null || value === "" ? fallback : String(value);
}

export function SignatureRuleMatrix({ emptyLabel, rules }: SignatureRuleMatrixProps) {
  const { t } = useI18n();

  return (
    <DataTable
      columns={[
        {
          key: "step",
          header: t("admin.dashboard.signature.columns.step"),
          cell: (row) => text(row.step_number)
        },
        {
          key: "document",
          header: t("admin.dashboard.signature.columns.documentType"),
          cell: (row) => text(row.documentTypeCode || row.document_type_id)
        },
        {
          key: "position",
          header: t("admin.dashboard.signature.columns.requiredPosition"),
          cell: (row) => <span className="font-medium text-slate-900">{text(row.requiredPositionTitle || row.required_position_id)}</span>
        },
        {
          key: "required",
          header: t("admin.dashboard.signature.columns.required"),
          cell: (row) => <StatusBadge tone={row.is_required ? "green" : "amber"}>{row.is_required ? t("common.yes") : t("common.no")}</StatusBadge>,
          hideOnMobile: true
        },
        {
          key: "finalizes",
          header: t("admin.dashboard.signature.columns.finalizes"),
          cell: (row) => <StatusBadge tone={row.can_finalize_document ? "green" : "slate"}>{row.can_finalize_document ? t("common.yes") : t("common.no")}</StatusBadge>
        }
      ]}
      emptyLabel={emptyLabel}
      getRowKey={(row, index) => Number(row.id || index)}
      rows={rules}
    />
  );
}
