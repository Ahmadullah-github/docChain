import { Link, useLocation } from "react-router-dom";
import { useAuth } from "../../app/AuthContext";
import { BrandLogo } from "../BrandLogo";
import { Icon } from "../ui";
import type { IconName } from "../ui";
import { cx } from "../../lib/classNames";

type AppNavItem = {
  icon: IconName;
  label: string;
  to: string;
};

const appNavItems: AppNavItem[] = [
  { icon: "dashboard", label: "Work", to: "/app/work" },
  { icon: "document", label: "Documents", to: "/app/documents" },
  { icon: "userPlus", label: "Walk-in Issuance", to: "/app/walk-in-issuance" },
  { icon: "signature", label: "Signature", to: "/app/signature-profile" }
];

type AppSidebarProps = {
  onNavigate?: () => void;
};

function AppSidebarLink({ item, onNavigate }: { item: AppNavItem; onNavigate?: () => void }) {
  const location = useLocation();
  const active = location.pathname === item.to || (item.to !== "/app/work" && location.pathname.startsWith(item.to));

  return (
    <Link
      className={cx(
        "flex items-center gap-3 border-s-4 px-5 py-3 text-sm font-semibold transition",
        active
          ? "border-cyan-300 bg-white/12 text-white"
          : "border-transparent text-slate-200 hover:bg-white/10 hover:text-white"
      )}
      onClick={onNavigate}
      to={item.to}
    >
      <Icon className="h-5 w-5 shrink-0" name={item.icon} />
      <span>{item.label}</span>
    </Link>
  );
}

export function AppSidebar({ onNavigate }: AppSidebarProps) {
  const auth = useAuth();

  return (
    <aside className="flex h-full w-60 shrink-0 flex-col bg-[#092540] text-white">
      <div className="flex h-[72px] items-center gap-3 border-b border-white/10 px-5">
        <BrandLogo alt="DocChain" className="h-11 w-11 rounded-xl ring-white/20" />
        <div className="min-w-0">
          <p className="text-lg font-bold leading-tight">DocChain</p>
          <p className="truncate text-xs text-cyan-100">Staff workspace</p>
        </div>
      </div>

      <nav className="flex-1 overflow-y-auto py-4">
        {appNavItems.map((item) => (
          <AppSidebarLink item={item} key={item.to} onNavigate={onNavigate} />
        ))}
      </nav>

      {auth.isAdmin ? (
        <div className="border-t border-white/10 p-4">
          <Link
            className="flex items-center gap-2 rounded-lg border border-white/15 bg-white/10 px-3 py-2 text-sm font-bold text-white transition hover:bg-white/15"
            onClick={onNavigate}
            to="/admin/dashboard"
          >
            <Icon className="h-4 w-4" name="shield" />
            Admin
          </Link>
        </div>
      ) : null}
    </aside>
  );
}
