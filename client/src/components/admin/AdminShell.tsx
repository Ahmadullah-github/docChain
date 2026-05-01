import { useState } from "react";
import { Outlet } from "react-router-dom";
import { useAuth } from "../../app/AuthContext";
import { useI18n } from "../../i18n";
import { IconButton } from "../ui";
import { AdminContent } from "./AdminContent";
import { AdminSidebar } from "./AdminSidebar";
import { AdminTopbar } from "./AdminTopbar";

export function AdminShell() {
  const auth = useAuth();
  const { t } = useI18n();
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <div className="min-h-screen bg-[#f7f9fc] text-slate-950">
      <div className="hidden lg:fixed lg:inset-y-0 lg:start-0 lg:block">
        <AdminSidebar />
      </div>

      {mobileOpen ? (
        <div className="fixed inset-0 z-50 lg:hidden">
          <button
            aria-label={t("admin.topbar.closeMenu")}
            className="absolute inset-0 bg-slate-950/50"
            onClick={() => setMobileOpen(false)}
            type="button"
          />
          <div className="absolute inset-y-0 start-0 flex">
            <AdminSidebar onNavigate={() => setMobileOpen(false)} />
            <IconButton
              className="m-3 border-white/30 bg-white/95"
              icon="x"
              label={t("admin.topbar.closeMenu")}
              onClick={() => setMobileOpen(false)}
            />
          </div>
        </div>
      ) : null}

      <div className="lg:ps-60">
        <AdminTopbar onMenuClick={() => setMobileOpen(true)} user={auth.user} />
        <AdminContent>
          <Outlet />
        </AdminContent>
      </div>
    </div>
  );
}
