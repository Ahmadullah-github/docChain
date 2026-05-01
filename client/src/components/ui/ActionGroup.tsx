import type { ReactNode } from "react";

type ActionGroupProps = {
  children: ReactNode;
};

export function ActionGroup({ children }: ActionGroupProps) {
  return (
    <div className="flex flex-wrap items-center justify-end gap-2">
      {children}
    </div>
  );
}
