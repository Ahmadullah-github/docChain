import type { InputHTMLAttributes } from "react";
import { cx } from "../../lib/classNames";
import { Icon } from "./Icon";

type SearchInputProps = InputHTMLAttributes<HTMLInputElement> & {
  wrapperClassName?: string;
};

export function SearchInput({ className, wrapperClassName, ...props }: SearchInputProps) {
  return (
    <div className={cx("relative", wrapperClassName)}>
      <Icon className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" name="search" />
      <input
        className={cx(
          "min-h-10 w-full rounded-lg border border-slate-200 bg-white py-2 pe-3 ps-10 text-sm leading-5 text-slate-800 shadow-sm shadow-slate-900/5 outline-none transition placeholder:text-slate-400 focus:border-[#061d49] focus:ring-4 focus:ring-[#061d49]/10",
          className
        )}
        type="search"
        {...props}
      />
    </div>
  );
}
