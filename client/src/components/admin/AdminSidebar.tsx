import { Link, useLocation } from "react-router-dom";
import { cx } from "../../lib/classNames";
import { useI18n } from "../../i18n";
import type { TranslationKey } from "../../i18n";
import { BrandLogo } from "../BrandLogo";
import { Icon } from "../ui";
import type { IconName } from "../ui";

export type AdminNavItem = {
  icon: IconName;
  labelKey: TranslationKey;
  to: string;
};

export const adminNavItems: AdminNavItem[] = [
  { icon: "dashboard", labelKey: "admin.nav.dashboard", to: "/admin/dashboard" },
  { icon: "building", labelKey: "admin.nav.organizations", to: "/admin/organizations" },
  { icon: "hierarchy", labelKey: "admin.nav.units", to: "/admin/units" },
  { icon: "users", labelKey: "admin.nav.users", to: "/admin/users" },
  { icon: "briefcase", labelKey: "admin.nav.positions", to: "/admin/positions" },
  { icon: "audit", labelKey: "admin.nav.assignments", to: "/admin/assignments" },
  { icon: "workflow", labelKey: "admin.nav.workflowRules", to: "/admin/workflow-rules" },
  { icon: "signature", labelKey: "admin.nav.signatureRules", to: "/admin/signature-rules" },
  { icon: "serial", labelKey: "admin.nav.serialSettings", to: "/admin/serial-settings" },
  { icon: "document", labelKey: "admin.nav.documentTypes", to: "/admin/document-types" },
  { icon: "template", labelKey: "admin.nav.templates", to: "/admin/templates" },
  { icon: "shield", labelKey: "admin.nav.auditLogs", to: "/admin/audit-logs" },
  { icon: "reports", labelKey: "admin.nav.reports", to: "/admin/reports" },
  { icon: "settings", labelKey: "admin.nav.settings", to: "/admin/settings" }
];

type SidebarNavItemProps = {
  item: AdminNavItem;
  onNavigate?: () => void;
};

export function SidebarNavItem({ item, onNavigate }: SidebarNavItemProps) {
  const location = useLocation();
  const { t } = useI18n();
  const active = location.pathname === item.to || (item.to !== "/admin/dashboard" && location.pathname.startsWith(item.to));

  return (
    <Link
      className={cx(
        "flex items-center gap-3 border-s-4 px-5 py-3 text-sm font-semibold transition",
        active
          ? "border-blue-400 bg-blue-900/60 text-white"
          : "border-transparent text-blue-50/90 hover:bg-white/10 hover:text-white"
      )}
      onClick={onNavigate}
      to={item.to}
    >
      <Icon className="h-5 w-5 shrink-0" name={item.icon} />
      <span>{t(item.labelKey)}</span>
    </Link>
  );
}

type AdminSidebarProps = {
  onNavigate?: () => void;
};

export function AdminSidebar({ onNavigate }: AdminSidebarProps) {
  const { t } = useI18n();

  return (
    <aside className="flex h-full w-60 shrink-0 flex-col bg-[#031b3a] text-white">
      <div className="flex h-[78px] items-center gap-3 border-b border-white/10 px-5">
        <BrandLogo alt={t("admin.brand.title")} className="h-12 w-12 rounded-xl ring-white/20" />
        <div className="min-w-0">
          <p className="text-lg font-bold leading-tight">{t("admin.brand.title")}</p>
        </div>
      </div>

      <nav className="flex-1 overflow-y-auto py-4">
        {adminNavItems.map((item) => (
          <SidebarNavItem item={item} key={item.to} onNavigate={onNavigate} />
        ))}
      </nav>

      <div className="border-t border-white/10 px-5 py-5 text-xs text-blue-100">
        <div className="mb-5 flex items-center gap-2 font-semibold text-white">
          <Icon className="h-5 w-5" name="shield" />
          {t("admin.sidebar.security")}
        </div>
        <p>{t("admin.sidebar.version")}</p>
      </div>
    </aside>
  );
}
