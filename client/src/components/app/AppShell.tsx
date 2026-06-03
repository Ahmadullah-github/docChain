import { useEffect, useState } from "react";
import { Link, Outlet, useLocation } from "react-router-dom";
import { signatureApi } from "../../api";
import { useAuth } from "../../app/AuthContext";
import { IconButton } from "../ui";
import { AppSidebar } from "./AppSidebar";
import { AppTopbar } from "./AppTopbar";

export function AppShell() {
  const auth = useAuth();
  const location = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [needsSignature, setNeedsSignature] = useState(false);

  useEffect(() => {
    let active = true;
    if (!auth.user || !auth.activeAssignmentId) {
      setNeedsSignature(false);
      return () => {
        active = false;
      };
    }

    signatureApi.getProfile()
      .then((profile) => {
        if (active) {
          setNeedsSignature(!profile);
        }
      })
      .catch(() => {
        if (active) {
          setNeedsSignature(false);
        }
      });

    return () => {
      active = false;
    };
  }, [auth.activeAssignmentId, auth.user]);

  return (
    <div className="min-h-screen bg-[#f6f8fb] text-slate-950">
      <div className="hidden lg:fixed lg:inset-y-0 lg:start-0 lg:block">
        <AppSidebar />
      </div>

      {mobileOpen ? (
        <div className="fixed inset-0 z-50 lg:hidden">
          <button
            aria-label="Close navigation"
            className="absolute inset-0 bg-slate-950/50"
            onClick={() => setMobileOpen(false)}
            type="button"
          />
          <div className="absolute inset-y-0 start-0 flex">
            <AppSidebar onNavigate={() => setMobileOpen(false)} />
            <IconButton
              className="m-3 border-white/30 bg-white/95"
              icon="x"
              label="Close navigation"
              onClick={() => setMobileOpen(false)}
            />
          </div>
        </div>
      ) : null}

      <div className="lg:ps-60">
        <AppTopbar onMenuClick={() => setMobileOpen(true)} />
        {needsSignature && location.pathname !== "/app/signature-profile" ? (
          <div className="border-b border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
            <div className="mx-auto flex max-w-6xl items-center justify-between gap-3">
              <span className="font-semibold">Set up your signature profile before signing documents.</span>
              <Link className="rounded-lg bg-amber-700 px-3 py-1.5 text-xs font-bold text-white" to="/app/signature-profile">Set up signature</Link>
            </div>
          </div>
        ) : null}
        <main className="min-w-0 px-3 py-5 lg:px-4">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
