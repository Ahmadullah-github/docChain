import type { SelectHTMLAttributes } from "react";
import { cx } from "../../lib/classNames";

export function SelectFilter({ className, children, ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      className={cx(
        "min-h-10 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium leading-5 text-slate-700 shadow-sm shadow-slate-900/5 outline-none transition focus:border-[#061d49] focus:ring-4 focus:ring-[#061d49]/10",
        className
      )}
      {...props}
    >
      {children}
    </select>
  );
}
