import type { ReactNode } from "react";

type AdminContentProps = {
  children: ReactNode;
};

export function AdminContent({ children }: AdminContentProps) {
  return (
    <main className="min-w-0 w-full px-3 py-5 lg:px-4">
      {children}
    </main>
  );
}
