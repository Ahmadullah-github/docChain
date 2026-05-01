import type { ReactNode } from "react";
import { useI18n } from "../../../i18n";
import { Button, DataTable, EmptyState, Icon, PanelCard, StatusBadge } from "../../ui";
import { authorityText, statusText, statusTone, unitTypeText } from "./PositionDirectory";
import type { PositionAdminRow } from "./types";

type PositionInspectorProps = {
  onAssignPosition: (row: PositionAdminRow) => void;
  onClonePosition: (row: PositionAdminRow) => void;
  onEditPosition: (row: PositionAdminRow) => void;
  onViewRules: (row: PositionAdminRow) => void;
  selectedPosition: PositionAdminRow | null;
};

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

export function PositionInspector({
  onAssignPosition,
  onClonePosition,
  onEditPosition,
  onViewRules,
  selectedPosition
}: PositionInspectorProps) {
  const { t } = useI18n();

  if (!selectedPosition) {
    return (
      <PanelCard title={t("admin.positions.inspector.title")}>
        <EmptyState label={t("admin.positions.inspector.empty")} />
      </PanelCard>
    );
  }

  const finalizesDocument = selectedPosition.canSign && selectedPosition.position.authority_level >= 70;
  const currentHolder = selectedPosition.currentHolder || t("admin.positions.status.vacant");

  return (
    <section className="space-y-3">
      <PanelCard title={t("admin.positions.inspector.title")}>
        <div className="space-y-4">
          <div className="flex flex-col gap-4 xl:flex-row">
            <div className="flex min-w-0 flex-1 gap-4">
              <div className="grid h-16 w-16 shrink-0 place-items-center rounded-full border-2 border-blue-100 bg-blue-50 text-[#061d49]">
                <Icon className="h-8 w-8" name="briefcase" />
              </div>
              <div className="min-w-0">
                <h2 className="text-balance text-lg font-bold leading-6 text-slate-950">{selectedPosition.position.title}</h2>
                <p className="force-ltr mt-0.5 text-start text-sm font-semibold text-slate-600">{selectedPosition.position.code}</p>
                <StatusBadge tone={statusTone(selectedPosition.status)}>{statusText(selectedPosition.status, t)}</StatusBadge>
                <p className="mt-2 text-sm leading-6 text-slate-600">
                  {selectedPosition.position.description || t("admin.positions.inspector.description")}
                </p>
              </div>
            </div>

            <div className="flex shrink-0 flex-wrap items-start gap-2 xl:max-w-64 xl:justify-end">
              <StatusBadge tone={selectedPosition.canSign ? "green" : "red"}>
                {selectedPosition.canSign ? t("admin.positions.inspector.canSign") : t("admin.positions.signature.notConfigured")}
              </StatusBadge>
              <StatusBadge tone={selectedPosition.status === "vacant" ? "amber" : "green"}>
                {selectedPosition.status === "vacant" ? t("admin.positions.status.vacant") : t("admin.positions.status.occupied")}
              </StatusBadge>
            </div>
          </div>

          <dl className="grid gap-2 sm:grid-cols-2">
            <InfoItem label={t("admin.positions.inspector.primaryUnit")} value={selectedPosition.primaryUnit?.name || selectedPosition.unitScope || t("admin.positions.unitType.unassigned")} />
            <InfoItem label={t("admin.positions.inspector.unitType")} value={unitTypeText(selectedPosition, t)} />
            <InfoItem label={t("admin.positions.inspector.reportsTo")} value={selectedPosition.reportsTo?.title || t("admin.positions.inspector.noReportsTo")} />
            <InfoItem label={t("admin.positions.inspector.authorityScope")} value={authorityText(selectedPosition.authorityBand, t)} />
            <InfoItem label={t("admin.positions.inspector.signatureMode")} value={selectedPosition.canSign ? t("admin.positions.signature.pinImage") : t("admin.positions.signature.notConfigured")} />
            <InfoItem label={t("admin.positions.inspector.currentHolder")} value={currentHolder} />
          </dl>

          <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
            <Button className="justify-start px-3 text-start" icon="edit" onClick={() => onEditPosition(selectedPosition)}>{t("admin.positions.inspector.editPosition")}</Button>
            <Button className="justify-start px-3 text-start" icon="users" onClick={() => onAssignPosition(selectedPosition)}>{t("admin.positions.inspector.assignHolder")}</Button>
            <Button className="justify-start px-3 text-start" icon="signature" onClick={() => onViewRules(selectedPosition)}>{t("admin.positions.inspector.viewRules")}</Button>
            <Button className="justify-start px-3 text-start" icon="document" onClick={() => onClonePosition(selectedPosition)}>{t("admin.positions.inspector.clonePosition")}</Button>
          </div>
        </div>
      </PanelCard>

      <div className="grid gap-3 xl:grid-cols-[minmax(22rem,.85fr)_minmax(0,1.15fr)]">
        <PanelCard title={t("admin.positions.rules.title")}>
          <dl className="divide-y divide-slate-100 rounded-lg border border-slate-200 px-3 py-2">
            <RuleRow label={t("admin.positions.rules.workflowRole")} value={authorityText(selectedPosition.authorityBand, t)} />
            <RuleRow label={t("admin.positions.rules.signatureRequired")} value={<StatusBadge tone={selectedPosition.canSign ? "green" : "slate"}>{selectedPosition.canSign ? t("common.yes") : t("admin.positions.rules.notRequired")}</StatusBadge>} />
            <RuleRow label={t("admin.positions.rules.finalizesDocument")} value={<StatusBadge tone={finalizesDocument ? "green" : "amber"}>{finalizesDocument ? t("common.yes") : t("admin.positions.rules.optional")}</StatusBadge>} />
            <RuleRow label={t("admin.positions.rules.visibility")} value={t("admin.positions.rules.parentControlled")} />
            <RuleRow label={t("admin.positions.rules.assignmentBasis")} value={t("admin.positions.rules.activeAssignment")} />
            <RuleRow label={t("admin.positions.rules.auditTracking")} value={t("admin.positions.rules.allLogged")} />
          </dl>
        </PanelCard>

        <PanelCard title={t("admin.positions.assignments.title")}>
          <DataTable
            columns={[
              {
                key: "holder",
                header: t("admin.positions.assignments.columns.holder"),
                cell: (row) => row.personDisplayName || "-"
              },
              {
                key: "type",
                header: t("admin.positions.assignments.columns.assignmentType"),
                cell: (row) => (
                  <StatusBadge tone={row.is_primary ? "blue" : "slate"}>
                    {row.is_primary ? t("admin.positions.assignments.type.primary") : t("admin.positions.assignments.type.delegated")}
                  </StatusBadge>
                )
              },
              {
                key: "canSign",
                header: t("admin.positions.assignments.columns.canSign"),
                cell: () => (
                  <StatusBadge tone={selectedPosition.canSign ? "green" : "red"}>
                    {selectedPosition.canSign ? t("common.yes") : t("common.no")}
                  </StatusBadge>
                )
              },
              {
                key: "active",
                header: t("admin.positions.assignments.columns.active"),
                cell: (row) => <StatusBadge tone={row.status === "active" ? "green" : "slate"}>{row.status}</StatusBadge>
              }
            ]}
            containerClassName="max-h-64 overflow-auto"
            emptyLabel={t("admin.positions.assignments.empty")}
            getRowKey={(row) => row.id}
            rows={selectedPosition.activeAssignments}
            tableClassName="min-w-[42rem]"
          />
        </PanelCard>
      </div>
    </section>
  );
}
