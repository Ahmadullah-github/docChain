import type { EntityId } from "../../../api";
import { useI18n } from "../../../i18n";
import { DataTable, PanelCard, StatusBadge } from "../../ui";
import type { AssignmentReviewQueueRow } from "./types";

type AssignmentReviewQueueProps = {
  onSelectAssignment?: (assignmentId: EntityId) => void;
  rows: AssignmentReviewQueueRow[];
};

function issueText(issue: AssignmentReviewQueueRow["issue"], t: ReturnType<typeof useI18n>["t"]) {
  switch (issue) {
    case "position_vacant":
      return t("admin.assignments.reviewQueue.issue.positionVacant");
    case "delegation_update":
      return t("admin.assignments.reviewQueue.issue.delegationUpdate");
    case "temporary_renewal":
      return t("admin.assignments.reviewQueue.issue.temporaryRenewal");
    case "pending_assignment":
      return t("admin.assignments.reviewQueue.issue.pendingAssignment");
  }
}

function statusText(status: AssignmentReviewQueueRow["status"], t: ReturnType<typeof useI18n>["t"]) {
  switch (status) {
    case "pending_review":
      return t("admin.assignments.reviewQueue.status.pendingReview");
    case "awaiting_approval":
      return t("admin.assignments.reviewQueue.status.awaitingApproval");
    case "draft":
      return t("admin.assignments.reviewQueue.status.draft");
  }
}

function statusTone(status: AssignmentReviewQueueRow["status"]) {
  switch (status) {
    case "pending_review":
      return "amber";
    case "awaiting_approval":
      return "blue";
    case "draft":
      return "slate";
  }
}

export function AssignmentReviewQueue({ onSelectAssignment, rows }: AssignmentReviewQueueProps) {
  const { t } = useI18n();

  return (
    <PanelCard title={t("admin.assignments.reviewQueue.title")}>
      <DataTable
        columns={[
          {
            key: "position",
            header: t("admin.assignments.reviewQueue.columns.position"),
            cell: (row) => <span className="block max-w-56 truncate font-semibold text-slate-900" title={row.positionTitle}>{row.positionTitle}</span>,
            className: "w-60"
          },
          {
            key: "issue",
            header: t("admin.assignments.reviewQueue.columns.issue"),
            cell: (row) => <span className="block max-w-48 truncate" title={issueText(row.issue, t)}>{issueText(row.issue, t)}</span>,
            className: "w-52"
          },
          {
            key: "requestedBy",
            header: t("admin.assignments.reviewQueue.columns.requestedBy"),
            cell: (row) => <span className="block max-w-44 truncate" title={row.requestedBy}>{row.requestedBy}</span>,
            hideOnMobile: true,
            className: "w-48"
          },
          {
            key: "status",
            header: t("admin.assignments.reviewQueue.columns.status"),
            cell: (row) => <StatusBadge tone={statusTone(row.status)}>{statusText(row.status, t)}</StatusBadge>
          },
          {
            key: "date",
            header: t("admin.assignments.reviewQueue.columns.date"),
            cell: (row) => <span className="force-ltr block whitespace-nowrap text-start">{row.date}</span>,
            hideOnMobile: true,
            className: "w-36"
          }
        ]}
        containerClassName="max-h-72 overflow-auto"
        emptyLabel={t("admin.assignments.reviewQueue.empty")}
        getRowAriaLabel={(row) => row.positionTitle}
        getRowKey={(row) => row.id}
        onRowClick={onSelectAssignment ? (row) => onSelectAssignment(row.assignmentId) : undefined}
        rows={rows}
        tableClassName="min-w-[52rem]"
      />
    </PanelCard>
  );
}
