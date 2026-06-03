import type { ComponentProps, ReactNode } from "react";
import { useI18n } from "../../../i18n";
import { Button, DataTable, EmptyState, PanelCard, StatusBadge } from "../../ui";
import { formatDateTime, initials, statusLabel } from "./userUtils";
import type { UserAdminRow } from "./types";

type UserInspectorProps = {
  onAssignUser: (row: UserAdminRow) => void;
  onEditUser: (row: UserAdminRow) => void;
  onManageAccess: (row: UserAdminRow) => void;
  onResetPassword: (row: UserAdminRow) => void;
  selectedUser: UserAdminRow | null;
};

function InfoItem({ label, value }: { label: ReactNode; value: ReactNode }) {
  return (
    <div className="grid grid-cols-[minmax(6.5rem,.75fr)_minmax(0,1fr)] gap-2 text-sm leading-5">
      <dt className="font-semibold text-slate-700">{label}</dt>
      <dd className="min-w-0 break-words text-slate-950">{value}</dd>
    </div>
  );
}

export function UserInspector({ onAssignUser, onEditUser, onManageAccess, onResetPassword, selectedUser }: UserInspectorProps) {
  const { t } = useI18n();

  if (!selectedUser) {
    return (
      <PanelCard title={t("admin.users.inspector.title")}>
        <EmptyState label={t("admin.users.inspector.empty")} />
      </PanelCard>
    );
  }

  const assignmentTypeLabels = {
    functional: t("admin.users.assignments.type.functional"),
    primary: t("admin.users.assignments.type.primary"),
    secondary: t("admin.users.assignments.type.secondary")
  };

  return (
    <section className="space-y-3">
      <PanelCard title={t("admin.users.inspector.title")}>
        <div className="space-y-3">
          <div className="space-y-4">
            <div className="flex gap-3">
              <div className="relative grid h-16 w-16 shrink-0 place-items-center rounded-full bg-slate-100 text-lg font-bold text-[#061d49]">
                {initials(selectedUser.user.personDisplayName)}
                <span className="absolute bottom-0.5 end-0.5 h-3.5 w-3.5 rounded-full border-2 border-white bg-emerald-500" />
              </div>
              <div className="min-w-0">
                <h2 className="truncate text-lg font-bold leading-6 text-slate-950">{selectedUser.user.personDisplayName}</h2>
                <p className="truncate text-sm text-slate-600">{selectedUser.roleLabel}</p>
                <p className="force-ltr mt-0.5 truncate text-start text-xs font-semibold text-slate-500">{selectedUser.user.username}</p>
                <StatusBadge>{statusLabel(selectedUser.user.status)}</StatusBadge>
                <p className="mt-2 text-xs leading-5 text-slate-600">
                  {t("admin.users.inspector.description")}
                </p>
              </div>
            </div>

            <dl className="grid gap-y-2.5">
              <InfoItem label={t("admin.users.inspector.primaryUnit")} value={selectedUser.unit?.name || selectedUser.primaryAssignment?.unitName || "-"} />
              <InfoItem label={t("admin.users.directory.columns.username")} value={<span className="force-ltr block truncate text-start" title={selectedUser.user.username}>{selectedUser.user.username}</span>} />
              <InfoItem label={t("admin.users.inspector.email")} value={<span className="force-ltr block truncate text-start" title={selectedUser.user.email}>{selectedUser.user.email}</span>} />
              <InfoItem label={t("admin.users.inspector.primaryPosition")} value={selectedUser.position?.title || selectedUser.primaryAssignment?.positionTitle || "-"} />
              <InfoItem label={t("admin.users.inspector.phone")} value={<span className="force-ltr block truncate text-start">{selectedUser.person?.phone || "-"}</span>} />
              <InfoItem label={t("admin.users.inspector.systemRole")} value={selectedUser.roleLabel} />
              <InfoItem label={t("admin.users.inspector.created")} value={<span className="force-ltr block whitespace-nowrap text-start">{formatDateTime(selectedUser.user.createdAt)}</span>} />
              <InfoItem label={t("admin.users.inspector.userType")} value={t("admin.users.inspector.staff")} />
              <InfoItem label={t("admin.users.inspector.lastLogin")} value={<span className="force-ltr block whitespace-nowrap text-start">{formatDateTime(selectedUser.user.lastLoginAt)}</span>} />
            </dl>
          </div>

          <div className="grid gap-2 sm:grid-cols-2">
            <Button className="justify-start px-3 text-start" icon="edit" onClick={() => onEditUser(selectedUser)}>{t("admin.users.inspector.editUser")}</Button>
            <Button className="justify-start px-3 text-start" icon="lock" onClick={() => onResetPassword(selectedUser)}>{t("admin.users.inspector.resetPassword")}</Button>
            <Button className="justify-start px-3 text-start" icon="users" onClick={() => onAssignUser(selectedUser)}>{t("admin.users.inspector.assignPosition")}</Button>
            <Button className="justify-start px-3 text-start" icon="shield" onClick={() => onManageAccess(selectedUser)}>{t("admin.users.inspector.manageAccess")}</Button>
          </div>
        </div>
      </PanelCard>

      <div className="grid gap-3">

        <PanelCard title={t("admin.users.assignments.title")}>
          <DataTable
            columns={[
              {
                key: "assignment",
                header: t("admin.users.assignments.columns.assignment"),
                cell: (row) => row.positionTitle || "-"
              },
              {
                key: "unit",
                header: t("admin.users.assignments.columns.unit"),
                cell: (row) => row.unitName || "-"
              },
              {
                key: "authority",
                header: t("admin.users.assignments.columns.authority"),
                cell: (row) => (
                  <StatusBadge tone={row.is_primary ? "blue" : "slate"}>
                    {row.is_primary ? assignmentTypeLabels.primary : selectedUser.canSign ? assignmentTypeLabels.secondary : assignmentTypeLabels.functional}
                  </StatusBadge>
                )
              },
              {
                key: "canSign",
                header: t("admin.users.assignments.columns.canSign"),
                cell: () => (
                  <StatusBadge tone={selectedUser.canSign ? "green" : "amber"}>
                    {selectedUser.canSign ? t("common.yes") : t("admin.users.assignments.optional")}
                  </StatusBadge>
                )
              },
              {
                key: "active",
                header: t("admin.users.assignments.columns.active"),
                cell: (row) => <StatusBadge>{row.status}</StatusBadge>
              }
            ]}
            containerClassName="max-h-56 overflow-auto"
            emptyLabel={t("admin.users.assignments.empty")}
            getRowKey={(row) => row.id}
            rows={selectedUser.activeAssignments}
            tableClassName="min-w-[42rem]"
          />
        </PanelCard>
      </div>


    </section>
  );
}

function SecurityRow({ label, tone, value }: { label: ReactNode; tone: ComponentProps<typeof StatusBadge>["tone"]; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
      <span className="min-w-0 truncate font-medium text-slate-700">{label}</span>
      <StatusBadge tone={tone}>{value}</StatusBadge>
    </div>
  );
}

function AccessEvent({ text, time }: { text: string; time: string }) {
  return (
    <div className="flex gap-3 text-sm">
      <span className="mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full bg-[#0b3c88]" />
      <div className="min-w-0 flex-1">
        <p className="text-slate-700">{text}</p>
      </div>
      <time className="force-ltr shrink-0 whitespace-nowrap text-start text-xs text-slate-500">{time}</time>
    </div>
  );
}
