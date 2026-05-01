import type { ReactNode } from "react";
import { cx } from "../../lib/classNames";
import { Icon } from "./Icon";
import type { IconName } from "./Icon";

type MetricCardProps = {
  icon: IconName;
  label: ReactNode;
  value: ReactNode;
  hint?: ReactNode;
  tone?: "navy" | "green" | "amber" | "red" | "slate";
};

const tones = {
  navy: "text-[#061d49]",
  green: "text-emerald-700",
  amber: "text-amber-600",
  red: "text-red-600",
  slate: "text-slate-600"
};

const surfaces = {
  navy: "bg-blue-50",
  green: "bg-emerald-50",
  amber: "bg-amber-50",
  red: "bg-red-50",
  slate: "bg-slate-100"
};

export function MetricCard({ hint, icon, label, tone = "navy", value }: MetricCardProps) {
  return (
    <article className="flex min-h-[76px] min-w-0 items-center gap-3 rounded-lg border border-slate-200/80 bg-white px-4 py-3 shadow-[0_1px_2px_rgba(15,23,42,0.06)]">
      <div className={cx("grid h-10 w-10 shrink-0 place-items-center rounded-lg", surfaces[tone], tones[tone])}>
        <Icon className="h-6 w-6" name={icon} />
      </div>
      <div className="min-w-0">
        <p className="text-sm font-medium leading-5 text-slate-600">{label}</p>
        <p className="mt-0.5 text-2xl font-bold leading-none text-slate-950">{value}</p>
        {hint ? <p className="mt-1 truncate text-xs text-slate-500">{hint}</p> : null}
      </div>
    </article>
  );
}
