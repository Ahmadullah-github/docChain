import { useI18n } from "../../../i18n";
import { DataTable, IconButton, PanelCard, StatusBadge } from "../../ui";
import type { StructuralChangeRow } from "./types";

type StructuralChangeQueueProps = {
  rows: StructuralChangeRow[];
};

export function StructuralChangeQueue({ rows }: StructuralChangeQueueProps) {
  const { t } = useI18n();

  const statusLabels = {
    awaiting_approval: t("admin.units.changeQueue.status.awaitingApproval"),
    draft: t("admin.units.changeQueue.status.draft"),
    pending_review: t("admin.units.changeQueue.status.pendingReview")
  };
  const typeLabels = {
    create: t("admin.units.changeQueue.type.create"),
    reassign: t("admin.units.changeQueue.type.reassign"),
    update: t("admin.units.changeQueue.type.update")
  };

  return (
    <PanelCard
      actions={<IconButton className="h-8 w-8 border-transparent" icon="filter" label={t("admin.units.changeQueue.filter")} />}
      title={t("admin.units.changeQueue.title")}
    >
      <DataTable
        columns={[
          {
            key: "number",
            header: "#",
            cell: (_row, index) => index + 1,
            className: "w-12"
          },
          {
            key: "request",
            header: t("admin.units.changeQueue.columns.request"),
            cell: (row) => <span className="font-semibold text-slate-900">{row.request}</span>
          },
          {
            key: "unit",
            header: t("admin.units.changeQueue.columns.unit"),
            cell: (row) => row.unitName,
            hideOnMobile: true
          },
          {
            key: "requestedBy",
            header: t("admin.units.changeQueue.columns.requestedBy"),
            cell: (row) => row.requestedBy,
            hideOnMobile: true
          },
          {
            key: "type",
            header: t("admin.units.changeQueue.columns.type"),
            cell: (row) => typeLabels[row.type]
          },
          {
            key: "status",
            header: t("admin.units.changeQueue.columns.status"),
            cell: (row) => (
              <StatusBadge tone={row.status === "pending_review" ? "amber" : row.status === "awaiting_approval" ? "blue" : "slate"}>
                {statusLabels[row.status]}
              </StatusBadge>
            )
          },
          {
            key: "date",
            header: t("admin.units.changeQueue.columns.date"),
            cell: (row) => row.date,
            hideOnMobile: true
          }
        ]}
        emptyLabel={t("admin.units.changeQueue.empty")}
        getRowKey={(row) => row.id}
        rows={rows}
      />
    </PanelCard>
  );
}
