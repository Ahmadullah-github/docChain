import type { ReactNode } from "react";
import { useI18n } from "../../../i18n";
import { Button, DataTable, EmptyState, Icon, PanelCard, StatusBadge } from "../../ui";
import {
  assignmentTypeText,
  assignmentTypeTone,
  signText,
  signTone,
  statusText,
  statusTone
} from "./AssignmentDirectory";
import { formatDate, formatDateTime } from "./assignmentUtils";
import type { AssignmentAdminRow } from "./types";

type AssignmentInspectorProps = {
  onEditAssignment?: (row: AssignmentAdminRow) => void;
  onManageAccess?: (row: AssignmentAdminRow) => void;
  onTransferAssignment?: (row: AssignmentAdminRow) => void;
  onViewRules?: (row: AssignmentAdminRow) => void;
  selectedAssignment: AssignmentAdminRow | null;
};

function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return (parts[0]?.[0] || "?") + (parts.length > 1 ? parts[parts.length - 1][0] : "");
}

function InfoItem({ label, value }: { label: ReactNode; value: ReactNode }) {
  return (
    <div className="min-w-0 rounded-lg border border-slate-200 bg-slate-50/70 px-3 py-2.5 text-sm">
      <dt className="text-xs font-bold uppercase tracking-wide text-slate-500">{label}</dt>
      <dd className="mt-1 min-w-0 whitespace-normal font-semibold leading-5 text-slate-950 [overflow-wrap:anywhere]">{value}</dd>
    </div>
  );
}

function RuleRow({ label, value }: { label: ReactNode; value: ReactNode }) {
  return (
    <div className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto] items-center gap-3 py-2 text-sm">
      <dt className="min-w-0 font-semibold text-slate-700">{label}</dt>
      <dd className="min-w-0 max-w-56 text-end text-slate-950 [overflow-wrap:anywhere]">{value}</dd>
    </div>
  );
}

function TimelineEvent({ date, title }: { date: string; title: string }) {
  return (
    <div className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-start gap-3 text-sm">
      <span className="mt-1.5 h-2.5 w-2.5 rounded-full bg-[#0b3c88]" />
      <p className="min-w-0 text-slate-700">{title}</p>
      <time className="force-ltr shrink-0 whitespace-nowrap text-start text-xs text-slate-500">{date}</time>
    </div>
  );
}

export function AssignmentInspector({ onEditAssignment, onManageAccess, onTransferAssignment, onViewRules, selectedAssignment }: AssignmentInspectorProps) {
  const { t } = useI18n();

  if (!selectedAssignment) {
    return (
      <PanelCard title={t("admin.assignments.inspector.title")}>
        <EmptyState label={t("admin.assignments.inspector.empty")} />
      </PanelCard>
    );
  }

  const positionTitle = selectedAssignment.position?.title || selectedAssignment.assignment.positionTitle || "-";
  const unitName = selectedAssignment.unit?.name || selectedAssignment.assignment.unitName || "-";

  return (
    <section className="space-y-3">
      <PanelCard title={t("admin.assignments.inspector.title")}>
        <div className="space-y-4">
          <div className="flex flex-col gap-4 xl:flex-row">
            <div className="flex min-w-0 flex-1 gap-3">
              <div className="relative grid h-16 w-16 shrink-0 place-items-center rounded-full bg-blue-50 text-lg font-bold text-[#061d49] ring-2 ring-blue-100">
                {initials(selectedAssignment.displayName)}
                <span className="absolute bottom-1 end-1 h-4 w-4 rounded-full border-2 border-white bg-emerald-500" />
              </div>
              <div className="min-w-0">
                <h2 className="truncate text-lg font-bold leading-6 text-slate-950" title={selectedAssignment.displayName}>{selectedAssignment.displayName}</h2>
                <p className="force-ltr truncate text-start text-sm font-semibold text-slate-600" title={selectedAssignment.assignmentCode}>{selectedAssignment.assignmentCode}</p>
                <StatusBadge tone={statusTone(selectedAssignment.status)}>{statusText(selectedAssignment.status, t)}</StatusBadge>
                <p className="mt-2 text-sm leading-6 text-slate-600">
                  {t("admin.assignments.inspector.description")}
                </p>
              </div>
            </div>

            <div className="flex shrink-0 flex-wrap items-start gap-2 xl:max-w-56 xl:justify-end">
              <StatusBadge tone={assignmentTypeTone(selectedAssignment.assignmentType)}>
                {assignmentTypeText(selectedAssignment.assignmentType, t)}
              </StatusBadge>
              <StatusBadge tone={signTone(selectedAssignment.signEligibility)}>
                {signText(selectedAssignment.signEligibility, t)}
              </StatusBadge>
            </div>
          </div>

          <dl className="grid gap-2 sm:grid-cols-2">
            <InfoItem label={t("admin.assignments.inspector.primaryUnit")} value={unitName} />
            <InfoItem label={t("admin.assignments.inspector.signatureMode")} value={selectedAssignment.canSign ? t("admin.assignments.signature.pinImage") : t("admin.assignments.signature.notConfigured")} />
            <InfoItem label={t("admin.assignments.inspector.position")} value={positionTitle} />
            <InfoItem label={t("admin.assignments.inspector.startDate")} value={formatDate(selectedAssignment.assignment.starts_at)} />
            <InfoItem label={t("admin.assignments.inspector.assignmentType")} value={assignmentTypeText(selectedAssignment.assignmentType, t)} />
            <InfoItem label={t("admin.assignments.inspector.endDate")} value={formatDate(selectedAssignment.assignment.ends_at)} />
            <InfoItem label={t("admin.assignments.inspector.authorityScope")} value={selectedAssignment.authorityScope} />
            <InfoItem label={t("admin.assignments.inspector.reportsTo")} value={selectedAssignment.reportsTo?.title || t("admin.assignments.inspector.noReportsTo")} />
            <InfoItem label={t("admin.assignments.inspector.canSign")} value={<StatusBadge tone={signTone(selectedAssignment.signEligibility)}>{signText(selectedAssignment.signEligibility, t)}</StatusBadge>} />
            <InfoItem label={t("admin.assignments.inspector.createdBy")} value={t("admin.topbar.systemAdmin")} />
          </dl>

          <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
            <Button className="justify-start px-3 text-start" icon="edit" onClick={() => onEditAssignment?.(selectedAssignment)}>{t("admin.assignments.inspector.editAssignment")}</Button>
            <Button className="justify-start px-3 text-start" icon="move" onClick={() => onTransferAssignment?.(selectedAssignment)}>{t("admin.assignments.inspector.transferHolder")}</Button>
            <Button className="justify-start px-3 text-start" icon="shield" onClick={() => onManageAccess?.(selectedAssignment)}>{t("admin.assignments.inspector.manageAccess")}</Button>
            <Button className="justify-start px-3 text-start" icon="signature" onClick={() => onViewRules?.(selectedAssignment)}>{t("admin.assignments.inspector.viewRules")}</Button>
          </div>
        </div>
      </PanelCard>

      <div className="gap-3 xl:grid-cols-[minmax(22rem,.85fr)_minmax(0,1.15fr)]">

        <PanelCard title={t("admin.assignments.delegations.title")}>
          <DataTable
            columns={[
              {
                key: "holder",
                header: t("admin.assignments.delegations.columns.holder"),
                cell: (row) => <span className="block max-w-44 truncate" title={row.personDisplayName || "-"}>{row.personDisplayName || "-"}</span>,
                className: "w-48"
              },
              {
                key: "type",
                header: t("admin.assignments.delegations.columns.delegationType"),
                cell: (row) => (
                  <StatusBadge tone={row.is_primary ? "blue" : "slate"}>
                    {row.is_primary ? t("admin.assignments.type.primary") : t("admin.assignments.type.delegated")}
                  </StatusBadge>
                )
              },
              {
                key: "canSign",
                header: t("admin.assignments.delegations.columns.canSign"),
                cell: () => <StatusBadge tone={signTone(selectedAssignment.signEligibility)}>{signText(selectedAssignment.signEligibility, t)}</StatusBadge>
              },
              {
                key: "active",
                header: t("admin.assignments.delegations.columns.active"),
                cell: (row) => <StatusBadge tone={row.status === "active" ? "green" : "slate"}>{row.status}</StatusBadge>
              }
            ]}
            containerClassName="max-h-64 overflow-auto"
            emptyLabel={t("admin.assignments.delegations.empty")}
            getRowKey={(row) => row.id}
            rows={selectedAssignment.delegatedAssignments}
            tableClassName="min-w-[42rem]"
          />
        </PanelCard>
      </div>

    </section>
  );
}
