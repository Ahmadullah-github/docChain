import type { ReactNode } from "react";
import { cx } from "../../../../lib/classNames";

type InspectorSectionProps = {
  children: ReactNode;
  className?: string;
  defaultOpen?: boolean;
  title: string;
};

export function InspectorSection({ children, className, defaultOpen = true, title }: InspectorSectionProps) {
  return (
    <details className={cx("group rounded-md border border-slate-200 bg-white", className)} open={defaultOpen}>
      <summary className="flex cursor-pointer select-none items-center justify-between gap-2 px-3 py-2 text-[11px] font-black uppercase tracking-wide text-slate-500 transition hover:bg-slate-50">
        <span className="truncate">{title}</span>
        <span className="text-slate-300 transition group-open:rotate-180">v</span>
      </summary>
      <div className="space-y-3 border-t border-slate-200 bg-white px-3 py-3">
        {children}
      </div>
    </details>
  );
}
