import type { ButtonHTMLAttributes, ReactNode } from "react";
import { cx } from "../../lib/classNames";
import { Icon } from "./Icon";
import type { IconName } from "./Icon";

type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  children: ReactNode;
  icon?: IconName;
  variant?: ButtonVariant;
};

const variants: Record<ButtonVariant, string> = {
  primary: "border-[#061d49] bg-[#061d49] text-white shadow-sm shadow-slate-900/10 hover:bg-[#082861]",
  secondary: "border-slate-200 bg-white text-[#061d49] shadow-sm shadow-slate-900/5 hover:border-slate-300 hover:bg-slate-50",
  ghost: "border-transparent bg-transparent text-slate-700 hover:bg-slate-100",
  danger: "border-red-200 bg-red-50 text-red-700 hover:border-red-300 hover:bg-red-100"
};

export function Button({ children, className, icon, type = "button", variant = "secondary", ...props }: ButtonProps) {
  return (
    <button
      className={cx(
        "inline-flex min-h-10 max-w-full items-center justify-center gap-2 rounded-lg border px-4 py-2 text-sm font-semibold leading-5 transition focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#061d49]/15 disabled:cursor-not-allowed disabled:opacity-60",
        variants[variant],
        className
      )}
      type={type}
      {...props}
    >
      {icon ? <Icon className="h-4 w-4" name={icon} /> : null}
      {children}
    </button>
  );
}
