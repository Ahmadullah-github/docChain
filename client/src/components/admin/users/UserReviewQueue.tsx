import type { EntityId } from "../../../api";
import { useI18n } from "../../../i18n";
import { DataTable, PanelCard, StatusBadge } from "../../ui";
import type { UserReviewQueueRow } from "./types";

type UserReviewQueueProps = {
  onSelectUser?: (userId: EntityId) => void;
  rows: UserReviewQueueRow[];
};

export function UserReviewQueue({ onSelectUser, rows }: UserReviewQueueProps) {
  const { t } = useI18n();
  const statusLabels = {
    awaiting_setup: t("admin.users.reviewQueue.status.awaitingSetup"),
    incomplete_setup: t("admin.users.reviewQueue.status.incompleteSetup"),
    under_review: t("admin.users.reviewQueue.status.underReview")
  };

  return (
    <PanelCard title={t("admin.users.reviewQueue.title")}>
      <DataTable
        columns={[
          {
            key: "user",
            header: t("admin.users.reviewQueue.columns.user"),
            cell: (row) => <span className="block max-w-44 truncate font-semibold text-slate-900">{row.userName}</span>,
            className: "w-48"
          },
          {
            key: "requestedBy",
            header: t("admin.users.reviewQueue.columns.requestedBy"),
            cell: (row) => <span className="block max-w-44 truncate">{row.requestedBy}</span>,
            hideOnMobile: true,
            className: "w-48"
          },
          {
            key: "issue",
            header: t("admin.users.reviewQueue.columns.issue"),
            cell: (row) => <span className="block min-w-48 max-w-[28rem] truncate">{row.issue}</span>
          },
          {
            key: "status",
            header: t("admin.users.reviewQueue.columns.status"),
            cell: (row) => (
              <StatusBadge tone={row.status === "under_review" ? "amber" : row.status === "incomplete_setup" ? "red" : "blue"}>
                {statusLabels[row.status]}
              </StatusBadge>
            )
          },
          {
            key: "date",
            header: t("admin.users.reviewQueue.columns.date"),
            cell: (row) => <span className="force-ltr block whitespace-nowrap text-start">{row.date}</span>,
            hideOnMobile: true,
            className: "w-32"
          }
        ]}
        containerClassName="max-h-[20rem] overflow-auto"
        emptyLabel={t("admin.users.reviewQueue.empty")}
        getRowAriaLabel={(row) => row.userName}
        getRowKey={(row) => row.id}
        onRowClick={onSelectUser ? (row) => onSelectUser(row.userId) : undefined}
        rows={rows}
        tableClassName="min-w-[52rem]"
      />
    </PanelCard>
  );
}
