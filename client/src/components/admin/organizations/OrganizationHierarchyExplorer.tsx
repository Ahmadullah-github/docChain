import { useEffect, useMemo, useState } from "react";
import type { EntityId, Unit } from "../../../api";
import { useI18n } from "../../../i18n";
import { cx } from "../../../lib/classNames";
import { Button, EmptyState, Icon, SearchInput } from "../../ui";
import {
  buildUnitTree,
  collectUnitIds,
  filterUnitTree,
  iconForUnit,
  normalizeSearch
} from "./organizationUtils";
import type { UnitTreeNode } from "./types";

type OrganizationHierarchyExplorerProps = {
  onSelectUnit: (unitId: EntityId) => void;
  selectedUnitId: EntityId | null;
  units: Unit[];
};

function TreeRow({
  depth,
  expandedIds,
  node,
  onSelectUnit,
  onToggle,
  selectedUnitId
}: {
  depth: number;
  expandedIds: Set<EntityId>;
  node: UnitTreeNode;
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
          selected ? "bg-blue-50 text-[#061d49] ring-1 ring-blue-200 shadow-sm" : "text-slate-700 hover:bg-slate-50"
        )}
        style={{ paddingInlineStart: `${depth * 1.35 + 0.5}rem` }}
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
          <span className={cx("min-w-0 truncate", depth === 0 && "font-bold text-[#061d49]")}>{node.name}</span>
          {node.name_local ? <span className="hidden min-w-0 truncate text-slate-400 md:inline">/ {node.name_local}</span> : null}
        </button>
      </div>
      {hasChildren && expanded ? (
        <ul className="ms-[18px] border-s border-dotted border-slate-300 ps-1">
          {node.children.map((child) => (
            <TreeRow
              depth={depth + 1}
              expandedIds={expandedIds}
              key={child.id}
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

export function OrganizationHierarchyExplorer({ onSelectUnit, selectedUnitId, units }: OrganizationHierarchyExplorerProps) {
  const { t } = useI18n();
  const [expandedIds, setExpandedIds] = useState<Set<EntityId>>(new Set());
  const [search, setSearch] = useState("");

  const tree = useMemo(() => buildUnitTree(units), [units]);
  const allIds = useMemo(() => collectUnitIds(tree), [tree]);
  const visibleTree = useMemo(() => filterUnitTree(tree, normalizeSearch(search)), [search, tree]);

  useEffect(() => {
    if (search) {
      setExpandedIds(new Set(allIds));
      return;
    }

    setExpandedIds((current) => {
      if (current.size || !tree.length) {
        return current;
      }

      return new Set(tree.map((node) => node.id));
    });
  }, [allIds, search, tree]);

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
    <section className="min-w-0 overflow-hidden rounded-lg border border-slate-200/80 bg-white shadow-[0_1px_2px_rgba(15,23,42,0.06)]">
      <header className="border-b border-slate-200/80 bg-white px-4 py-3">
        <h2 className="text-base font-bold text-slate-950">{t("admin.organizations.hierarchy.title")}</h2>
      </header>
      <div className="space-y-3 p-4">
        <div className="flex min-w-0 flex-col gap-2 lg:flex-row">
          <SearchInput
            onChange={(event) => setSearch(event.target.value)}
            placeholder={t("admin.organizations.hierarchy.search")}
            value={search}
            wrapperClassName="min-w-0 flex-1"
          />
          <div className="grid min-w-0 grid-cols-2 gap-2 lg:flex lg:shrink-0">
            <Button className="px-3" onClick={() => setExpandedIds(new Set(allIds))} variant="secondary">
              {t("admin.organizations.hierarchy.expandAll")}
            </Button>
            <Button className="px-3" onClick={() => setExpandedIds(new Set())} variant="secondary">
              {t("admin.organizations.hierarchy.collapseAll")}
            </Button>
          </div>
        </div>

        {visibleTree.length ? (
          <ul className="max-h-[388px] space-y-1 overflow-auto pe-1">
            {visibleTree.map((node) => (
              <TreeRow
                depth={0}
                expandedIds={expandedIds}
                key={node.id}
                node={node}
                onSelectUnit={onSelectUnit}
                onToggle={toggle}
                selectedUnitId={selectedUnitId}
              />
            ))}
          </ul>
        ) : (
          <EmptyState label={t("admin.organizations.hierarchy.empty")} />
        )}
      </div>
    </section>
  );
}
