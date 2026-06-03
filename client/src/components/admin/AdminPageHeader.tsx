import type { ReactNode } from "react";

type AdminPageHeaderProps = {
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
};

export function AdminPageHeader({ actions, description, title }: AdminPageHeaderProps) {
  return (
    <div className="mb-4 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
      <div className="min-w-0">
        <h1 className="text-2xl font-bold tracking-tight text-slate-950">{title}</h1>
      </div>
      {actions ? <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">{actions}</div> : null}
    </div>
  );
}
