import type { ReactNode } from "react";
import type { Unit } from "../../../api";
import { useI18n } from "../../../i18n";
import { Button, DataTable, EmptyState, Icon, StatusBadge } from "../../ui";
import {
  countChildren,
  formatStatus,
  iconForUnit
} from "./unitUtils";
import type { UnitLeadershipRow } from "./types";

type UnitInspectorProps = {
  headPosition: string;
  leadershipRows: UnitLeadershipRow[];
  parentUnitName: string;
  selectedUnit: Unit | null;
  units: Unit[];
};

function InspectorItem({ label, value }: { label: ReactNode; value: ReactNode }) {
  return (
    <div className="grid grid-cols-[minmax(6.5rem,.85fr)_1fr] gap-2 text-sm">
      <dt className="font-semibold text-slate-700">{label}</dt>
      <dd className="min-w-0 text-slate-950">{value}</dd>
    </div>
  );
}

export function UnitInspector({ headPosition, leadershipRows, parentUnitName, selectedUnit, units }: UnitInspectorProps) {
  const { t } = useI18n();

  if (!selectedUnit) {
    return (
      <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <EmptyState label={t("admin.units.inspector.empty")} />
      </section>
    );
  }

  const assignmentTypeLabels = {
    functional: t("admin.units.leadership.assignmentType.functional"),
    primary: t("admin.units.leadership.assignmentType.primary"),
    secondary: t("admin.units.leadership.assignmentType.secondary")
  };
  const workflowScope = selectedUnit.unitTypeCode === "faculty"
    ? t("admin.units.inspector.workflowScope.faculty")
    : selectedUnit.unitTypeCode === "department"
      ? t("admin.units.inspector.workflowScope.department")
      : selectedUnit.unitTypeCode === "committee"
        ? t("admin.units.inspector.workflowScope.committee")
        : selectedUnit.unitTypeCode === "vice_chancellery"
          ? t("admin.units.inspector.workflowScope.viceChancellery")
          : selectedUnit.unitTypeCode === "university"
            ? t("admin.units.inspector.workflowScope.university")
            : t("admin.units.inspector.workflowScope.default");
  const visibility = selectedUnit.status === "active"
    ? t("admin.units.inspector.visibility.included")
    : t("admin.units.inspector.visibility.limited");

  return (
    <section className="rounded-xl border border-slate-200 bg-white shadow-sm">
      <header className="border-b border-slate-200 px-4 py-3">
        <h2 className="text-base font-bold text-slate-950">{t("admin.units.inspector.title")}</h2>
      </header>

      <div className="space-y-4 p-4">
        <div>
          <p className="text-xs font-bold uppercase text-slate-500">{t("admin.units.inspector.selectedUnit")}</p>
          <div className="mt-2 flex items-start justify-between gap-3">
            <div className="flex min-w-0 gap-2">
              <Icon className="mt-0.5 h-5 w-5 shrink-0 text-[#061d49]" name={iconForUnit(selectedUnit)} />
              <h3 className="min-w-0 text-lg font-bold leading-tight text-slate-950">
                <span>{selectedUnit.name}</span>
                {selectedUnit.name_local ? <span className="text-slate-500"> / {selectedUnit.name_local}</span> : null}
              </h3>
            </div>
            <StatusBadge>{formatStatus(selectedUnit.status)}</StatusBadge>
          </div>
        </div>

        <dl className="grid gap-x-4 gap-y-2 md:grid-cols-2 xl:grid-cols-1 2xl:grid-cols-2">
          <InspectorItem label={t("admin.units.inspector.unitType")} value={selectedUnit.unitTypeName || selectedUnit.unitTypeCode || "-"} />
          <InspectorItem label={t("admin.units.inspector.level")} value={selectedUnit.unitTypeCode === "university" ? 1 : selectedUnit.unitTypeCode === "vice_chancellery" ? 2 : selectedUnit.unitTypeCode === "faculty" ? 3 : 4} />
          <InspectorItem label={t("admin.units.inspector.code")} value={<span className="force-ltr">{selectedUnit.code}</span>} />
          <InspectorItem label={t("admin.units.inspector.childUnits")} value={countChildren(selectedUnit.id, units)} />
          <InspectorItem label={t("admin.units.inspector.parentUnit")} value={parentUnitName} />
          <InspectorItem label={t("admin.units.inspector.workflowScope")} value={workflowScope} />
          <InspectorItem label={t("admin.units.inspector.headPosition")} value={headPosition} />
          <InspectorItem label={t("admin.units.inspector.visibility")} value={visibility} />
        </dl>

        <div>
          <p className="text-sm font-semibold text-slate-700">{t("admin.units.inspector.description")}</p>
          <p className="mt-1 text-sm leading-6 text-slate-600">
            {selectedUnit.description || t("admin.units.inspector.noDescription")}
          </p>
        </div>

        <div className="grid gap-2 sm:grid-cols-2">
          <Button className="justify-start" icon="edit">{t("admin.units.inspector.editUnit")}</Button>
          <Button className="justify-start" icon="users">{t("admin.units.inspector.assignPosition")}</Button>
          <Button className="justify-start" icon="hierarchy">{t("admin.units.inspector.addChild")}</Button>
          <Button className="justify-start" icon="move">{t("admin.units.inspector.moveUnit")}</Button>
          <Button className="justify-start sm:col-span-2" icon="shield">{t("admin.units.inspector.viewRules")}</Button>
        </div>

        <div className="border-t border-slate-200 pt-4">
          <h3 className="mb-3 text-sm font-bold text-slate-950">{t("admin.units.governance.title")}</h3>
          <div className="space-y-3">
            <InspectorItem label={t("admin.units.governance.routingContext")} value={t("admin.units.governance.routingValue")} />
            <InspectorItem label={t("admin.units.governance.signatureVisibility")} value={t("admin.units.governance.signatureValue")} />
            <InspectorItem label={t("admin.units.governance.auditTracking")} value={t("admin.units.governance.auditValue")} />
          </div>
        </div>

        <div className="border-t border-slate-200 pt-4">
          <h3 className="mb-2 text-sm font-bold text-slate-950">{t("admin.units.leadership.title")}</h3>
          <DataTable
            columns={[
              {
                key: "position",
                header: t("admin.units.leadership.columns.position"),
                cell: (row) => <span className="font-semibold text-slate-900">{row.positionTitle}</span>
              },
              {
                key: "person",
                header: t("admin.units.leadership.columns.person"),
                cell: (row) => row.personName
              },
              {
                key: "assignmentType",
                header: t("admin.units.leadership.columns.assignmentType"),
                cell: (row) => (
                  <StatusBadge tone={row.assignmentType === "primary" ? "blue" : row.assignmentType === "secondary" ? "amber" : "slate"}>
                    {assignmentTypeLabels[row.assignmentType]}
                  </StatusBadge>
                )
              },
              {
                key: "canSign",
                header: t("admin.units.leadership.columns.canSign"),
                cell: (row) => (
                  <StatusBadge tone={row.canSign ? "green" : "amber"}>
                    {row.canSign ? t("common.yes") : t("admin.units.leadership.optional")}
                  </StatusBadge>
                )
              }
            ]}
            emptyLabel={t("admin.units.leadership.empty")}
            getRowKey={(row) => row.assignment.id}
            rows={leadershipRows.slice(0, 4)}
          />
        </div>
      </div>
    </section>
  );
}
