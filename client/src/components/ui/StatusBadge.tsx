import { cx } from "../../lib/classNames";

type StatusBadgeProps = {
  children: string;
  tone?: "green" | "amber" | "red" | "blue" | "slate";
};

const statusToneByValue: Record<string, StatusBadgeProps["tone"]> = {
  active: "green",
  allowed: "green",
  completed: "green",
  draft: "slate",
  inactive: "slate",
  pending: "amber",
  optional: "amber",
  suspended: "red",
  disabled: "slate",
  denied: "red",
  archived: "slate"
};

const toneClasses = {
  green: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  amber: "bg-amber-50 text-amber-700 ring-amber-200",
  red: "bg-red-50 text-red-700 ring-red-200",
  blue: "bg-blue-50 text-blue-700 ring-blue-200",
  slate: "bg-slate-100 text-slate-700 ring-slate-200"
};

export function StatusBadge({ children, tone }: StatusBadgeProps) {
  const normalized = children.toLowerCase().replaceAll("_", " ");
  const resolvedTone = tone || statusToneByValue[children.toLowerCase()] || "blue";

  return (
    <span className={cx("inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ring-1", toneClasses[resolvedTone])}>
      {normalized}
    </span>
  );
}
