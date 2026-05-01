import { useI18n } from "../../../i18n";
import { DataTable, PanelCard, StatusBadge } from "../../ui";
import type { AssignmentReviewQueueRow } from "./types";

type AssignmentReviewQueueProps = {
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

export function AssignmentReviewQueue({ rows }: AssignmentReviewQueueProps) {
  const { t } = useI18n();

  return (
    <PanelCard title={t("admin.assignments.reviewQueue.title")}>
      <DataTable
        columns={[
          {
            key: "position",
            header: t("admin.assignments.reviewQueue.columns.position"),
            cell: (row) => <span className="font-semibold text-slate-900">{row.positionTitle}</span>
          },
          {
            key: "issue",
            header: t("admin.assignments.reviewQueue.columns.issue"),
            cell: (row) => issueText(row.issue, t)
          },
          {
            key: "requestedBy",
            header: t("admin.assignments.reviewQueue.columns.requestedBy"),
            cell: (row) => row.requestedBy,
            hideOnMobile: true
          },
          {
            key: "status",
            header: t("admin.assignments.reviewQueue.columns.status"),
            cell: (row) => <StatusBadge tone={statusTone(row.status)}>{statusText(row.status, t)}</StatusBadge>
          },
          {
            key: "date",
            header: t("admin.assignments.reviewQueue.columns.date"),
            cell: (row) => row.date,
            hideOnMobile: true
          }
        ]}
        emptyLabel={t("admin.assignments.reviewQueue.empty")}
        getRowKey={(row) => row.id}
        rows={rows}
      />
    </PanelCard>
  );
}
