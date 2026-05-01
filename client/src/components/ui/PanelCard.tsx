import type { ReactNode } from "react";
import { cx } from "../../lib/classNames";

type PanelCardProps = {
  children: ReactNode;
  className?: string;
  title?: ReactNode;
  actions?: ReactNode;
};

export function PanelCard({ actions, children, className, title }: PanelCardProps) {
  return (
    <section className={cx("min-w-0 overflow-hidden rounded-lg border border-slate-200/80 bg-white shadow-[0_1px_2px_rgba(15,23,42,0.06)]", className)}>
      {title || actions ? (
        <header className="flex min-w-0 items-center justify-between gap-4 border-b border-slate-200/80 bg-white px-4 py-3">
          {title ? <h2 className="min-w-0 truncate text-base font-bold text-slate-950">{title}</h2> : <span />}
          {actions}
        </header>
      ) : null}
      <div className="p-4">{children}</div>
    </section>
  );
}
