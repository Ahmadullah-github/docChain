import type { EntityId } from "../../../api";
import { useI18n } from "../../../i18n";
import { cx } from "../../../lib/classNames";
import { EmptyState, Icon, PanelCard } from "../../ui";
import type { AssignmentAdminRow } from "./types";

type AssignmentRelationshipPreviewProps = {
  onSelectAssignment: (assignmentId: EntityId) => void;
  rows: AssignmentAdminRow[];
  selectedAssignmentId: EntityId | null;
};

function PreviewCard({
  onSelectAssignment,
  row,
  selected
}: {
  onSelectAssignment: (assignmentId: EntityId) => void;
  row: AssignmentAdminRow;
  selected: boolean;
}) {
  return (
    <button
      className={cx(
        "mx-auto flex w-full max-w-60 items-center gap-2 rounded-lg border bg-white px-3 py-2 text-start text-sm shadow-sm transition hover:border-blue-300 hover:bg-blue-50",
        selected ? "border-blue-500 bg-blue-50 ring-1 ring-blue-200" : "border-slate-200"
      )}
      onClick={() => onSelectAssignment(row.id)}
      type="button"
    >
      <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-blue-50 text-[#061d49]">
        <Icon className="h-5 w-5" name={row.signEligibility === "no" ? "users" : "signature"} />
      </span>
      <span className="min-w-0">
        <span className="block truncate font-bold text-[#061d49]">{row.position?.title || row.assignment.positionTitle || "-"}</span>
        <span className="block truncate text-xs text-slate-500">{row.displayName}</span>
        <span className="force-ltr block truncate text-xs text-slate-500">{row.assignmentCode}</span>
      </span>
    </button>
  );
}

function buildPreviewRows(rows: AssignmentAdminRow[], selectedAssignmentId: EntityId | null) {
  if (!rows.length) {
    return [];
  }

  const selected = rows.find((row) => row.id === selectedAssignmentId) || rows[0];
  const byPositionId = new Map(rows.map((row) => [row.position?.id || -row.id, row]));
  const chain: AssignmentAdminRow[] = [];
  let current: AssignmentAdminRow | null = selected;

  while (current) {
    chain.unshift(current);
    current = current.reportsTo ? byPositionId.get(current.reportsTo.id) || null : null;
  }

  const children = rows
    .filter((row) => row.reportsTo?.id === selected.position?.id && row.id !== selected.id)
    .slice(0, 3);

  return [...chain, ...children];
}

export function AssignmentRelationshipPreview({ onSelectAssignment, rows, selectedAssignmentId }: AssignmentRelationshipPreviewProps) {
  const { t } = useI18n();
  const previewRows = buildPreviewRows(rows, selectedAssignmentId);

  return (
    <PanelCard className="h-full" title={t("admin.assignments.relationship.title")}>
      {previewRows.length ? (
        <div className="space-y-3">
          {previewRows.map((row, index) => (
            <div className="relative" key={`${row.id}-${index}`}>
              {index > 0 ? <div className="mx-auto mb-2 h-5 w-px bg-slate-300" /> : null}
              <PreviewCard
                onSelectAssignment={onSelectAssignment}
                row={row}
                selected={row.id === selectedAssignmentId}
              />
            </div>
          ))}
        </div>
      ) : (
        <EmptyState label={t("admin.assignments.relationship.empty")} />
      )}
    </PanelCard>
  );
}
