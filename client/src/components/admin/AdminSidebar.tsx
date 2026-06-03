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

export type AdminNavGroup = {
  labelKey: TranslationKey;
  items: AdminNavItem[];
};

export const adminNavGroups: AdminNavGroup[] = [
  {
    labelKey: "admin.navGroup.structure",
    items: [
      { icon: "building", labelKey: "admin.nav.organizations", to: "/admin/organizations" }
    ]
  },
  {
    labelKey: "admin.navGroup.people",
    items: [
      { icon: "users", labelKey: "admin.nav.users", to: "/admin/users" },
      { icon: "briefcase", labelKey: "admin.nav.positions", to: "/admin/positions" },
      { icon: "audit", labelKey: "admin.nav.assignments", to: "/admin/assignments" }
    ]
  },
  {
    labelKey: "admin.navGroup.documents",
    items: [
      { icon: "document", labelKey: "admin.nav.documentTypes", to: "/admin/document-types" },
      { icon: "settings", labelKey: "admin.nav.documentSettings", to: "/admin/document-settings" },
      { icon: "template", labelKey: "admin.nav.templates", to: "/admin/templates" },
      { icon: "serial", labelKey: "admin.nav.serialSettings", to: "/admin/serial-settings" }
    ]
  }
];

type SidebarNavItemProps = {
  item: AdminNavItem;
  onNavigate?: () => void;
};

export function SidebarNavItem({ item, onNavigate }: SidebarNavItemProps) {
  const location = useLocation();
  const { t } = useI18n();
  const active = location.pathname === item.to || location.pathname.startsWith(item.to);

  return (
    <Link
      className={cx(
        "flex items-center gap-3 border-s-4 px-5 py-2.5 text-sm font-semibold transition",
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
        {adminNavGroups.map((group) => (
          <div className="mb-4" key={group.labelKey}>
            <p className="px-5 pb-1 text-[11px] font-bold uppercase tracking-wide text-blue-100/60">{t(group.labelKey)}</p>
            <div>
              {group.items.map((item) => (
                <SidebarNavItem item={item} key={item.to} onNavigate={onNavigate} />
              ))}
            </div>
          </div>
        ))}
      </nav>
    </aside>
  );
}
