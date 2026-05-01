import { Icon } from "./Icon";

type EmptyStateProps = {
  label: string;
};

export function EmptyState({ label }: EmptyStateProps) {
  return (
    <div className="grid min-h-28 place-items-center rounded-lg border border-dashed border-slate-300 bg-slate-50 px-4 py-6 text-center text-sm text-slate-500">
      <div>
        <Icon className="mx-auto mb-2 h-6 w-6 text-slate-400" name="document" />
        {label}
      </div>
    </div>
  );
}
