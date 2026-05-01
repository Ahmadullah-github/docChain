import type { EntityId } from "../../../api";
import { useI18n } from "../../../i18n";
import { cx } from "../../../lib/classNames";
import { EmptyState, Icon, PanelCard } from "../../ui";
import type { PositionAdminRow } from "./types";

type PositionHierarchyPreviewProps = {
  onSelectPosition: (positionId: EntityId) => void;
  rows: PositionAdminRow[];
  selectedPositionId: EntityId | null;
};

function PreviewCard({
  onSelectPosition,
  row,
  selected
}: {
  onSelectPosition: (positionId: EntityId) => void;
  row: PositionAdminRow;
  selected: boolean;
}) {
  return (
    <button
      className={cx(
        "mx-auto flex w-full max-w-56 items-center gap-2 rounded-lg border bg-white px-3 py-2 text-start text-sm shadow-sm transition hover:border-blue-300 hover:bg-blue-50",
        selected ? "border-blue-500 bg-blue-50 ring-1 ring-blue-200" : "border-slate-200"
      )}
      onClick={() => onSelectPosition(row.id)}
      type="button"
    >
      <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-blue-50 text-[#061d49]">
        <Icon className="h-5 w-5" name={row.canSign ? "signature" : "briefcase"} />
      </span>
      <span className="min-w-0">
        <span className="block truncate font-bold text-[#061d49]">{row.position.title}</span>
        <span className="force-ltr block truncate text-xs text-slate-500">{row.position.code}</span>
      </span>
    </button>
  );
}

function buildPreviewRows(rows: PositionAdminRow[], selectedPositionId: EntityId | null) {
  if (!rows.length) {
    return [];
  }

  const selected = rows.find((row) => row.id === selectedPositionId) || rows[0];
  const byPositionId = new Map(rows.map((row) => [row.position.id, row]));
  const chain: PositionAdminRow[] = [];
  let current: PositionAdminRow | null = selected;

  while (current) {
    chain.unshift(current);
    current = current.reportsTo ? byPositionId.get(current.reportsTo.id) || null : null;
  }

  const children = rows
    .filter((row) => row.reportsTo?.id === selected.position.id)
    .slice(0, 3);

  return [...chain, ...children];
}

export function PositionHierarchyPreview({ onSelectPosition, rows, selectedPositionId }: PositionHierarchyPreviewProps) {
  const { t } = useI18n();
  const previewRows = buildPreviewRows(rows, selectedPositionId);

  return (
    <PanelCard className="h-full" title={t("admin.positions.hierarchy.title")}>
      {previewRows.length ? (
        <div className="space-y-3">
          {previewRows.map((row, index) => (
            <div className="relative" key={`${row.id}-${index}`}>
              {index > 0 ? <div className="mx-auto mb-2 h-5 w-px bg-slate-300" /> : null}
              <PreviewCard
                onSelectPosition={onSelectPosition}
                row={row}
                selected={row.id === selectedPositionId}
              />
            </div>
          ))}
        </div>
      ) : (
        <EmptyState label={t("admin.positions.hierarchy.empty")} />
      )}
    </PanelCard>
  );
}
