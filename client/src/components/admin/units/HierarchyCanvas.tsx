import { useMemo, useState } from "react";
import type { ComponentProps } from "react";
import type { AdminAssignment, EntityId, Unit } from "../../../api";
import { useI18n } from "../../../i18n";
import { cx } from "../../../lib/classNames";
import { Button, EmptyState, Icon, IconButton } from "../../ui";
import {
  buildUnitTree,
  flattenTreeLevels,
  formatStatus,
  iconForUnit
} from "./unitUtils";
import type { UnitCanvasMode, UnitCardModel, UnitZoomLevel } from "./types";

type HierarchyCanvasProps = {
  assignments: AdminAssignment[];
  onSelectUnit: (unitId: EntityId) => void;
  selectedUnitId: EntityId | null;
  units: Unit[];
};

const zoomClassByLevel: Record<UnitZoomLevel, string> = {
  compact: "w-44",
  normal: "w-56",
  large: "w-64"
};

function UnitCanvasCard({
  model,
  onSelectUnit,
  selected
}: {
  model: UnitCardModel;
  onSelectUnit: (unitId: EntityId) => void;
  selected: boolean;
}) {
  return (
    <button
      className={cx(
        "relative min-h-[92px] rounded-lg border bg-white p-3 text-start shadow-sm transition hover:border-blue-300 hover:shadow",
        selected ? "border-blue-500 bg-blue-50/60 ring-1 ring-blue-200" : "border-slate-200"
      )}
      onClick={() => onSelectUnit(model.id)}
      type="button"
    >
      <span className={cx(
        "absolute end-3 top-3 h-2.5 w-2.5 rounded-full",
        model.status === "active" ? "bg-emerald-500" : "bg-slate-300"
      )} />
      <div className="flex gap-3 pe-3">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-blue-50 text-[#061d49]">
          <Icon className="h-6 w-6" name={iconForUnit(model.unit)} />
        </span>
        <div className="min-w-0">
          <p className="truncate text-sm font-bold text-[#061d49]">{model.name}</p>
          {model.nameLocal ? <p className="truncate text-xs text-slate-500">{model.nameLocal}</p> : null}
          <p className="mt-1 text-xs text-slate-600">
            {model.unit.code ? <span className="force-ltr">{model.unit.code}</span> : "-"}
          </p>
          <p className="text-xs text-slate-600">{model.typeName} · {model.activeAssignments}</p>
        </div>
      </div>
    </button>
  );
}

function LegendItem({ icon, label }: { icon: ComponentProps<typeof Icon>["name"]; label: string }) {
  return (
    <span className="inline-flex items-center gap-2 text-xs font-medium text-slate-600">
      <Icon className="h-4 w-4 text-[#061d49]" name={icon} />
      {label}
    </span>
  );
}

export function HierarchyCanvas({ assignments, onSelectUnit, selectedUnitId, units }: HierarchyCanvasProps) {
  const { t } = useI18n();
  const [mode, setMode] = useState<UnitCanvasMode>("tree");
  const [zoom, setZoom] = useState<UnitZoomLevel>("normal");

  const assignmentsByUnitId = useMemo(() => {
    const map = new Map<EntityId, AdminAssignment[]>();
    for (const assignment of assignments) {
      map.set(assignment.unit_id, [...(map.get(assignment.unit_id) || []), assignment]);
    }
    return map;
  }, [assignments]);
  const levels = useMemo(() => flattenTreeLevels(buildUnitTree(units), assignmentsByUnitId), [assignmentsByUnitId, units]);

  function zoomIn() {
    setZoom((current) => current === "compact" ? "normal" : "large");
  }

  function zoomOut() {
    setZoom((current) => current === "large" ? "normal" : "compact");
  }

  return (
    <section className="rounded-xl border border-slate-200 bg-white shadow-sm">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-4 py-3">
        <h2 className="text-base font-bold text-slate-950">{t("admin.units.canvas.title")}</h2>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            className="px-3 py-1.5 text-xs"
            icon="hierarchy"
            onClick={() => setMode("tree")}
            variant={mode === "tree" ? "primary" : "secondary"}
          >
            {t("admin.units.canvas.treeView")}
          </Button>
          <Button
            className="px-3 py-1.5 text-xs"
            icon="workflow"
            onClick={() => setMode("map")}
            variant={mode === "map" ? "primary" : "secondary"}
          >
            {t("admin.units.canvas.mapView")}
          </Button>
          <IconButton className="h-9 w-9" icon="zoomOut" label={t("admin.units.canvas.zoomOut")} onClick={zoomOut} />
          <IconButton className="h-9 w-9" icon="zoomIn" label={t("admin.units.canvas.zoomIn")} onClick={zoomIn} />
          <IconButton className="h-9 w-9" icon="fullscreen" label={t("admin.units.canvas.fullscreen")} />
        </div>
      </header>

      <div className="min-h-[445px] overflow-auto p-4">
        {levels.length ? (
          <div className={cx("min-w-max space-y-8", mode === "map" && "space-y-5")}>
            {levels.map((level, index) => (
              <div className="relative" key={index}>
                {index > 0 ? <div className="absolute -top-5 left-1/2 h-5 border-s border-slate-300" /> : null}
                <div className={cx("flex justify-center gap-4", mode === "map" && "justify-start")}>
                  {level.map((model) => (
                    <div className={zoomClassByLevel[zoom]} key={model.id}>
                      <UnitCanvasCard
                        model={{ ...model, status: formatStatus(model.status) }}
                        onSelectUnit={onSelectUnit}
                        selected={selectedUnitId === model.id}
                      />
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <EmptyState label={t("admin.units.canvas.empty")} />
        )}
      </div>

      <footer className="flex flex-wrap gap-4 border-t border-slate-200 px-4 py-3">
        <LegendItem icon="building" label={t("admin.units.legend.university")} />
        <LegendItem icon="hierarchy" label={t("admin.units.legend.viceChancellery")} />
        <LegendItem icon="document" label={t("admin.units.legend.faculty")} />
        <LegendItem icon="building" label={t("admin.units.legend.department")} />
        <LegendItem icon="briefcase" label={t("admin.units.legend.office")} />
        <LegendItem icon="users" label={t("admin.units.legend.committee")} />
      </footer>
    </section>
  );
}
