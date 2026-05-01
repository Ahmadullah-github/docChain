import type { Unit } from "../../api";
import { cx } from "../../lib/classNames";
import { EmptyState, Icon } from "../ui";
import type { IconName } from "../ui";

type HierarchyMiniTreeProps = {
  emptyLabel: string;
  units: Unit[];
};

type TreeNode = Unit & {
  children: TreeNode[];
};

function iconForUnit(unit: Unit): IconName {
  switch (unit.unitTypeCode) {
    case "university":
    case "faculty":
    case "department":
      return "building";
    case "vice_chancellery":
      return "hierarchy";
    case "committee":
      return "users";
    default:
      return "document";
  }
}

function buildTree(units: Unit[]) {
  const byId = new Map<number, TreeNode>();
  for (const unit of units) {
    byId.set(unit.id, { ...unit, children: [] });
  }

  const roots: TreeNode[] = [];
  for (const node of byId.values()) {
    const parentId = node.parent_unit_id || null;
    const parent = parentId ? byId.get(parentId) : null;
    if (parent) {
      parent.children.push(node);
    } else {
      roots.push(node);
    }
  }

  return roots;
}

function TreeRow({ depth, node }: { depth: number; node: TreeNode }) {
  return (
    <li>
      <div
        className={cx(
          "flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm text-slate-700 hover:bg-blue-50",
          depth === 0 && "font-bold text-[#061d49]"
        )}
        style={{ paddingInlineStart: `${depth * 1.25 + 0.5}rem` }}
      >
        <Icon className="h-4 w-4 shrink-0 text-[#061d49]" name={iconForUnit(node)} />
        <span className="min-w-0 truncate">{node.name}</span>
        {node.name_local ? <span className="hidden truncate text-slate-400 md:inline">/ {node.name_local}</span> : null}
      </div>
      {node.children.length ? (
        <ul className="border-s border-slate-200">
          {node.children.slice(0, 8).map((child) => (
            <TreeRow depth={depth + 1} key={child.id} node={child} />
          ))}
        </ul>
      ) : null}
    </li>
  );
}

export function HierarchyMiniTree({ emptyLabel, units }: HierarchyMiniTreeProps) {
  const roots = buildTree(units);

  if (!roots.length) {
    return <EmptyState label={emptyLabel} />;
  }

  return (
    <ul className="space-y-1">
      {roots.slice(0, 4).map((node) => (
        <TreeRow depth={0} key={node.id} node={node} />
      ))}
    </ul>
  );
}
