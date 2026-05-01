import type { ReactNode } from "react";
import { cx } from "../../lib/classNames";

type ToolbarProps = {
  children: ReactNode;
  className?: string;
};

export function Toolbar({ children, className }: ToolbarProps) {
  return (
    <div className={cx("flex min-w-0 flex-wrap items-center gap-2", className)}>
      {children}
    </div>
  );
}
