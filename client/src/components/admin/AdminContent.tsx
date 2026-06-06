import type { ReactNode } from "react";

type AdminContentProps = {
  children: ReactNode;
  compact?: boolean;
};

export function AdminContent({ children, compact = false }: AdminContentProps) {
  return (
    <main className={`min-w-0 w-full px-4 lg:px-8 ${compact ? "py-2" : "py-5"}`}>
      {children}
    </main>
  );
}
