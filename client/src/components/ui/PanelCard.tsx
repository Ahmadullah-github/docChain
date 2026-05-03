import type { ReactNode } from "react";
import { cx } from "../../lib/classNames";

type PanelCardProps = {
  actions?: ReactNode;
  bodyClassName?: string;
  children: ReactNode;
  className?: string;
  headerClassName?: string;
  title?: ReactNode;
};

export function PanelCard({ actions, bodyClassName, children, className, headerClassName, title }: PanelCardProps) {
  return (
    <section className={cx("min-w-0 overflow-hidden rounded-lg border border-slate-200/80 bg-white shadow-[0_1px_2px_rgba(15,23,42,0.06)]", className)}>
      {title || actions ? (
        <header className={cx("flex min-w-0 items-center justify-between gap-4 border-b border-slate-200/80 bg-white px-4 py-3", headerClassName)}>
          {title ? <h2 className="min-w-0 truncate text-base font-bold text-slate-950">{title}</h2> : <span />}
          {actions}
        </header>
      ) : null}
      <div className={cx("p-4", bodyClassName)}>{children}</div>
    </section>
  );
}
