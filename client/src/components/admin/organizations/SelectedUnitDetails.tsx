import type { ReactNode } from "react";
import type { Unit } from "../../../api";
import { useI18n } from "../../../i18n";
import { Button, DataTable, EmptyState, Icon, StatusBadge } from "../../ui";
import { formatDate, formatStatus, iconForUnit } from "./organizationUtils";
import type { UnitAuthorityRow } from "./types";

type SelectedUnitDetailsProps = {
  authorityRows: UnitAuthorityRow[];
  createdLabel: string;
  headPosition: string;
  onAddChildUnit: () => void;
  onAssignHead: () => void;
  onEditUnit: () => void;
  parentUnitName: string;
  selectedUnit: Unit | null;
};

function DetailItem({ label, value }: { label: ReactNode; value: ReactNode }) {
  return (
    <div className="grid min-w-0 grid-cols-[6.75rem_minmax(0,1fr)] gap-2 text-sm sm:grid-cols-[8rem_minmax(0,1fr)]">
      <dt className="font-semibold text-slate-700">{label}</dt>
      <dd className="min-w-0 break-words text-slate-950">{value}</dd>
    </div>
  );
}

export function SelectedUnitDetails({
  authorityRows,
  createdLabel,
  headPosition,
  onAddChildUnit,
  onAssignHead,
  onEditUnit,
  parentUnitName,
  selectedUnit
}: SelectedUnitDetailsProps) {
  const { t } = useI18n();

  if (!selectedUnit) {
    return (
      <section className="min-w-0 rounded-lg border border-slate-200/80 bg-white p-4 shadow-[0_1px_2px_rgba(15,23,42,0.06)]">
        <EmptyState label={t("admin.organizations.details.empty")} />
      </section>
    );
  }

  const assignmentTypeLabels = {
    functional: t("admin.organizations.authority.assignmentType.functional"),
    primary: t("admin.organizations.authority.assignmentType.primary"),
    secondary: t("admin.organizations.authority.assignmentType.secondary")
  };

  return (
    <section className="min-w-0 overflow-hidden rounded-lg border border-slate-200/80 bg-white shadow-[0_1px_2px_rgba(15,23,42,0.06)]">
      <header className="flex min-w-0 flex-col gap-2 border-b border-slate-200/80 bg-white px-4 py-3">
        <h2 className="text-base font-bold text-slate-950">{t("admin.organizations.details.title")}</h2>
        <div className="flex min-w-0 items-center gap-2">
          <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-blue-50 text-[#061d49]">
            <Icon className="h-5 w-5" name={iconForUnit(selectedUnit)} />
          </span>
          <p className="min-w-0 truncate text-sm font-bold text-[#061d49]">
            <span>{selectedUnit.name}</span>
            {selectedUnit.name_local ? <span className="text-slate-500"> / {selectedUnit.name_local}</span> : null}
          </p>
        </div>
      </header>

      <div className="space-y-4 p-4">
        <div className="grid min-w-0 gap-4 2xl:grid-cols-[minmax(0,1fr)_13rem]">
          <div className="min-w-0 rounded-lg border border-slate-200/80 bg-slate-50/30 p-3">
            <dl className="grid min-w-0 gap-x-6 gap-y-3 md:grid-cols-2">
              <DetailItem label={t("admin.organizations.details.unitType")} value={selectedUnit.unitTypeName || selectedUnit.unitTypeCode || "-"} />
              <DetailItem label={t("admin.organizations.details.status")} value={<StatusBadge>{formatStatus(selectedUnit.status)}</StatusBadge>} />
              <DetailItem label={t("admin.organizations.details.parentUnit")} value={parentUnitName} />
              <DetailItem label={t("admin.organizations.details.visibility")} value={t("admin.organizations.details.visibilityInternal")} />
              <DetailItem label={t("admin.organizations.details.code")} value={<span className="force-ltr">{selectedUnit.code}</span>} />
              <DetailItem label={t("admin.organizations.details.created")} value={createdLabel} />
              <DetailItem label={t("admin.organizations.details.headPosition")} value={headPosition} />
              <DetailItem label={t("admin.organizations.details.lastUpdated")} value={formatDate(selectedUnit.updated_at)} />
            </dl>

            <div className="mt-3 border-t border-slate-100 pt-3">
              <p className="text-sm font-semibold text-slate-700">{t("admin.organizations.details.description")}</p>
              <p className="mt-1 text-sm leading-6 text-slate-600">
                {selectedUnit.description || t("admin.organizations.details.noDescription")}
              </p>
            </div>
          </div>

          <div className="grid min-w-0 content-start gap-2 sm:grid-cols-2 2xl:grid-cols-1">
            <Button className="justify-start" icon="edit" onClick={onEditUnit}>{t("admin.organizations.details.edit")}</Button>
            <Button className="justify-start" icon="users" onClick={onAssignHead}>{t("admin.organizations.details.assignHead")}</Button>
            <Button className="justify-start" icon="hierarchy" onClick={onAddChildUnit}>{t("admin.organizations.details.addChildUnit")}</Button>
          </div>
        </div>

        <div className="min-w-0">
          <h3 className="mb-2 text-sm font-bold text-slate-950">{t("admin.organizations.authority.title")}</h3>
          <DataTable
            columns={[
              {
                key: "position",
                header: t("admin.organizations.authority.columns.position"),
                cell: (row) => <span className="font-semibold text-slate-900">{row.positionTitle}</span>
              },
              {
                key: "person",
                header: t("admin.organizations.authority.columns.person"),
                cell: (row) => row.personName
              },
              {
                key: "assignmentType",
                header: t("admin.organizations.authority.columns.assignmentType"),
                cell: (row) => (
                  <StatusBadge tone={row.assignmentType === "primary" ? "blue" : row.assignmentType === "secondary" ? "amber" : "slate"}>
                    {assignmentTypeLabels[row.assignmentType]}
                  </StatusBadge>
                )
              },
              {
                key: "canSign",
                header: t("admin.organizations.authority.columns.canSign"),
                cell: (row) => (
                  <StatusBadge tone={row.canSign ? "green" : "red"}>
                    {row.canSign ? t("common.yes") : t("common.no")}
                  </StatusBadge>
                )
              },
              {
                key: "active",
                header: t("admin.organizations.authority.columns.active"),
                cell: (row) => <StatusBadge>{formatStatus(row.assignment.status)}</StatusBadge>
              }
            ]}
            emptyLabel={t("admin.organizations.authority.empty")}
            getRowKey={(row) => row.assignment.id}
            rows={authorityRows}
          />
        </div>
      </div>
    </section>
  );
}
