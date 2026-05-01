import { useEffect, useMemo, useState } from "react";
import type { EntityId, Unit } from "../../../api";
import { useI18n } from "../../../i18n";
import { cx } from "../../../lib/classNames";
import { Button, EmptyState, Icon, SearchInput } from "../../ui";
import {
  buildUnitTree,
  collectUnitIds,
  iconForUnit,
  normalizeSearch,
  unitMatchesSearch
} from "./unitUtils";
import type { UnitTypeOption } from "./types";
import type { UnitTreeNode } from "../organizations/types";

type UnitsHierarchyNavigatorProps = {
  onSelectUnit: (unitId: EntityId) => void;
  selectedUnitId: EntityId | null;
  unitTypes: UnitTypeOption[];
  units: Unit[];
};

function filterTree(nodes: UnitTreeNode[], search: string, typeFilter: string): UnitTreeNode[] {
  return nodes.flatMap((node) => {
    const children = filterTree(node.children, search, typeFilter);
    const matchesType = typeFilter === "all" || node.unitTypeCode === typeFilter;
    const matchesSearch = unitMatchesSearch(node, search);

    if ((matchesType && matchesSearch) || children.length) {
      return [{ ...node, children }];
    }

    return [];
  });
}

function NavigatorRow({
  depth,
  expandedIds,
  node,
  moreLabel,
  onSelectUnit,
  onToggle,
  selectedUnitId
}: {
  depth: number;
  expandedIds: Set<EntityId>;
  node: UnitTreeNode;
  moreLabel: string;
  onSelectUnit: (unitId: EntityId) => void;
  onToggle: (unitId: EntityId) => void;
  selectedUnitId: EntityId | null;
}) {
  const expanded = expandedIds.has(node.id);
  const selected = selectedUnitId === node.id;
  const hasChildren = node.children.length > 0;

  return (
    <li>
      <div
        className={cx(
          "group flex min-w-0 items-center gap-2 rounded-lg px-2 py-1.5 text-sm transition",
          selected ? "bg-blue-50 text-[#061d49] ring-1 ring-blue-100" : "text-slate-700 hover:bg-slate-50"
        )}
        style={{ paddingInlineStart: `${depth * 1.15 + 0.35}rem` }}
      >
        <button
          aria-label={expanded ? "Collapse unit" : "Expand unit"}
          className={cx(
            "grid h-5 w-5 shrink-0 place-items-center rounded text-slate-400 transition hover:bg-white hover:text-[#061d49]",
            !hasChildren && "invisible"
          )}
          onClick={() => onToggle(node.id)}
          type="button"
        >
          <Icon className={cx("h-3.5 w-3.5 transition", expanded && "rotate-180")} name="chevronDown" />
        </button>
        <button
          className="flex min-w-0 flex-1 items-center gap-2 text-start"
          onClick={() => onSelectUnit(node.id)}
          type="button"
        >
          <Icon className="h-4 w-4 shrink-0 text-[#061d49]" name={iconForUnit(node)} />
          <span className="min-w-0 truncate font-medium">{node.name}</span>
          {node.name_local ? <span className="hidden min-w-0 truncate text-slate-400 md:inline">/ {node.name_local}</span> : null}
        </button>
        <button
          aria-label={moreLabel}
          className="grid h-7 w-7 shrink-0 place-items-center rounded text-slate-400 opacity-0 transition hover:bg-white hover:text-[#061d49] group-hover:opacity-100"
          type="button"
        >
          <Icon className="h-4 w-4" name="more" />
        </button>
      </div>
      {hasChildren && expanded ? (
        <ul className="ms-[18px] border-s border-dotted border-slate-300 ps-1">
          {node.children.map((child) => (
            <NavigatorRow
              depth={depth + 1}
              expandedIds={expandedIds}
              key={child.id}
              moreLabel={moreLabel}
              node={child}
              onSelectUnit={onSelectUnit}
              onToggle={onToggle}
              selectedUnitId={selectedUnitId}
            />
          ))}
        </ul>
      ) : null}
    </li>
  );
}

export function UnitsHierarchyNavigator({ onSelectUnit, selectedUnitId, unitTypes, units }: UnitsHierarchyNavigatorProps) {
  const { t } = useI18n();
  const [expandedIds, setExpandedIds] = useState<Set<EntityId>>(new Set());
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");

  const tree = useMemo(() => buildUnitTree(units), [units]);
  const allIds = useMemo(() => collectUnitIds(tree), [tree]);
  const filteredTree = useMemo(() => filterTree(tree, normalizeSearch(search), typeFilter), [search, tree, typeFilter]);

  useEffect(() => {
    setExpandedIds((current) => {
      if (search || typeFilter !== "all") {
        return new Set(allIds);
      }

      if (current.size || !tree.length) {
        return current;
      }

      return new Set(tree.map((node) => node.id));
    });
  }, [allIds, search, tree, typeFilter]);

  function toggle(unitId: EntityId) {
    setExpandedIds((current) => {
      const next = new Set(current);
      if (next.has(unitId)) {
        next.delete(unitId);
      } else {
        next.add(unitId);
      }
      return next;
    });
  }

  return (
    <section className="rounded-xl border border-slate-200 bg-white shadow-sm">
      <header className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 px-4 py-3">
        <h2 className="text-base font-bold text-slate-950">{t("admin.units.navigator.title")}</h2>
        <div className="flex gap-2">
          <Button className="px-3 py-1.5 text-xs" onClick={() => setExpandedIds(new Set(allIds))}>{t("admin.units.navigator.expandAll")}</Button>
          <Button className="px-3 py-1.5 text-xs" onClick={() => setExpandedIds(new Set())}>{t("admin.units.navigator.collapseAll")}</Button>
        </div>
      </header>

      <div className="space-y-3 p-4">
        <SearchInput
          onChange={(event) => setSearch(event.target.value)}
          placeholder={t("admin.units.navigator.search")}
          value={search}
        />

        <div className="flex flex-wrap gap-2">
          <button
            className={cx(
              "rounded-lg border px-3 py-1.5 text-xs font-semibold transition",
              typeFilter === "all" ? "border-[#061d49] bg-[#061d49] text-white" : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
            )}
            onClick={() => setTypeFilter("all")}
            type="button"
          >
            {t("admin.units.navigator.all")}
          </button>
          {unitTypes.map((unitType) => (
            <button
              className={cx(
                "rounded-lg border px-3 py-1.5 text-xs font-semibold transition",
                typeFilter === unitType.code ? "border-[#061d49] bg-[#061d49] text-white" : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
              )}
              key={unitType.id}
              onClick={() => setTypeFilter(unitType.code)}
              type="button"
            >
              {unitType.name}
            </button>
          ))}
        </div>

        {filteredTree.length ? (
          <ul className="max-h-[455px] space-y-1 overflow-auto pe-1">
            {filteredTree.map((node) => (
              <NavigatorRow
                depth={0}
                expandedIds={expandedIds}
                key={node.id}
                moreLabel={t("admin.units.navigator.more")}
                node={node}
                onSelectUnit={onSelectUnit}
                onToggle={toggle}
                selectedUnitId={selectedUnitId}
              />
            ))}
          </ul>
        ) : (
          <EmptyState label={t("admin.units.navigator.empty")} />
        )}
      </div>
    </section>
  );
}
