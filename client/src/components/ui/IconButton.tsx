import type { ButtonHTMLAttributes } from "react";
import { cx } from "../../lib/classNames";
import { Icon } from "./Icon";
import type { IconName } from "./Icon";

type IconButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  label: string;
  icon: IconName;
};

export function IconButton({ className, icon, label, type = "button", ...props }: IconButtonProps) {
  return (
    <button
      aria-label={label}
      className={cx(
        "inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-slate-200 bg-white text-[#061d49] shadow-sm shadow-slate-900/5 transition hover:border-slate-300 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#061d49]/15",
        className
      )}
      type={type}
      {...props}
    >
      <Icon className="h-5 w-5" name={icon} />
    </button>
  );
}
