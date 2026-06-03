import type { ReactNode } from "react";
import { cx } from "../../../../lib/classNames";

type CanvasWorkbenchProps = {
  children: ReactNode;
  maximized: boolean;
};

export function CanvasWorkbench({ children, maximized }: CanvasWorkbenchProps) {
  return (
    <section className={cx(
      "flex min-h-0 flex-col overflow-hidden rounded-md border border-slate-200 bg-slate-100 shadow-sm shadow-slate-900/5",
      maximized ? "h-[calc(100vh-5.5rem)]" : "h-[calc(100vh-7.25rem)] min-h-[44rem]"
    )}>
      {children}
    </section>
  );
}
