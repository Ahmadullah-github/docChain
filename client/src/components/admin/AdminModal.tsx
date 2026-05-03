import type { ReactNode } from "react";
import { useI18n } from "../../i18n";
import { cx } from "../../lib/classNames";
import { IconButton } from "../ui";

type AdminModalProps = {
  bodyClassName?: string;
  children: ReactNode;
  description?: ReactNode;
  footer?: ReactNode;
  onClose: () => void;
  open: boolean;
  size?: "fullscreen" | "lg" | "md";
  title: ReactNode;
};

const sizeClasses = {
  fullscreen: "h-[calc(100vh-2rem)] max-h-[calc(100vh-2rem)] max-w-none w-[calc(100vw-2rem)]",
  lg: "max-w-3xl",
  md: "max-w-xl"
};

export function AdminModal({ bodyClassName, children, description, footer, onClose, open, size = "md", title }: AdminModalProps) {
  const { t } = useI18n();

  if (!open) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center px-3 py-6">
      <button
        aria-label={t("admin.modal.closeDialog")}
        className="absolute inset-0 bg-slate-950/45"
        onClick={onClose}
        type="button"
      />
      <section
        aria-modal="true"
        className={cx("relative flex max-h-[calc(100vh-3rem)] w-full min-w-0 flex-col overflow-hidden rounded-lg border border-slate-200 bg-white shadow-2xl shadow-slate-950/20", sizeClasses[size])}
        role="dialog"
      >
        <header className="flex min-w-0 items-start justify-between gap-4 border-b border-slate-200 px-4 py-3">
          <div className="min-w-0">
            <h2 className="text-base font-bold text-slate-950">{title}</h2>
            {description ? <p className="mt-1 text-sm leading-5 text-slate-600">{description}</p> : null}
          </div>
          <IconButton className="h-8 w-8 shrink-0 border-transparent" icon="x" label={t("admin.modal.closeDialog")} onClick={onClose} />
        </header>
        <div className={cx("min-h-0 flex-1 overflow-y-auto p-4", bodyClassName)}>{children}</div>
        {footer ? <footer className="flex flex-wrap items-center justify-end gap-2 border-t border-slate-200 bg-slate-50 px-4 py-3">{footer}</footer> : null}
      </section>
    </div>
  );
}
