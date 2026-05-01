import type { EntityId } from "../../../api";
import { useI18n } from "../../../i18n";
import { DataTable, PanelCard, StatusBadge } from "../../ui";
import type { PositionReviewQueueRow } from "./types";

type PositionReviewQueueProps = {
  onSelectPosition?: (positionId: EntityId) => void;
  rows: PositionReviewQueueRow[];
};

function issueText(issue: PositionReviewQueueRow["issue"], t: ReturnType<typeof useI18n>["t"]) {
  switch (issue) {
    case "position_vacant":
      return t("admin.positions.reviewQueue.issue.vacant");
    case "new_position_request":
      return t("admin.positions.reviewQueue.issue.newRequest");
    case "role_update":
      return t("admin.positions.reviewQueue.issue.roleUpdate");
  }
}

function statusText(status: PositionReviewQueueRow["status"], t: ReturnType<typeof useI18n>["t"]) {
  switch (status) {
    case "pending_review":
      return t("admin.positions.reviewQueue.status.pendingReview");
    case "awaiting_approval":
      return t("admin.positions.reviewQueue.status.awaitingApproval");
    case "draft":
      return t("admin.positions.reviewQueue.status.draft");
  }
}

function statusTone(status: PositionReviewQueueRow["status"]) {
  switch (status) {
    case "pending_review":
      return "amber";
    case "awaiting_approval":
      return "blue";
    case "draft":
      return "slate";
  }
}

export function PositionReviewQueue({ onSelectPosition, rows }: PositionReviewQueueProps) {
  const { t } = useI18n();

  return (
    <PanelCard title={t("admin.positions.reviewQueue.title")}>
      <DataTable
        columns={[
          {
            key: "position",
            header: t("admin.positions.reviewQueue.columns.position"),
            cell: (row) => <span className="block max-w-56 truncate font-semibold text-slate-900" title={row.positionTitle}>{row.positionTitle}</span>,
            className: "w-60"
          },
          {
            key: "issue",
            header: t("admin.positions.reviewQueue.columns.issue"),
            cell: (row) => <span className="block max-w-44 truncate" title={issueText(row.issue, t)}>{issueText(row.issue, t)}</span>,
            className: "w-48"
          },
          {
            key: "requestedBy",
            header: t("admin.positions.reviewQueue.columns.requestedBy"),
            cell: (row) => <span className="block max-w-44 truncate" title={row.requestedBy}>{row.requestedBy}</span>,
            className: "w-48"
          },
          {
            key: "status",
            header: t("admin.positions.reviewQueue.columns.status"),
            cell: (row) => <StatusBadge tone={statusTone(row.status)}>{statusText(row.status, t)}</StatusBadge>
          },
          {
            key: "date",
            header: t("admin.positions.reviewQueue.columns.date"),
            cell: (row) => <span className="force-ltr block whitespace-nowrap text-start">{row.date}</span>,
            hideOnMobile: true,
            className: "w-36"
          }
        ]}
        containerClassName="max-h-72 overflow-auto"
        emptyLabel={t("admin.positions.reviewQueue.empty")}
        getRowAriaLabel={(row) => row.positionTitle}
        getRowKey={(row) => row.id}
        onRowClick={onSelectPosition ? (row) => onSelectPosition(row.positionId) : undefined}
        rows={rows}
        tableClassName="min-w-[48rem]"
      />
    </PanelCard>
  );
}
