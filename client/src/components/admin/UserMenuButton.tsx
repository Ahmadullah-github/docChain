import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import type { AuthAssignment, AuthRole, AuthUser } from "../../api";
import { useI18n } from "../../i18n";
import { Icon } from "../ui";

type UserMenuButtonProps = {
  label: string;
  onClick?: () => void;
  activeAssignment?: AuthAssignment | null;
  onLogout?: () => void;
  roles?: AuthRole[];
  settingsTo?: string;
  user: AuthUser | null;
};

function initials(name?: string) {
  if (!name) {
    return "A";
  }

  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();
}

export function UserMenuButton({ activeAssignment, label, onClick, onLogout, roles = [], settingsTo = "/app/signature-profile", user }: UserMenuButtonProps) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    function onPointerDown(event: PointerEvent) {
      if (!wrapperRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    }

    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, []);

  return (
    <div className="relative" ref={wrapperRef}>
      <button
        aria-expanded={open}
        aria-label={label}
        className="flex items-center gap-2 rounded-full py-1 ps-1 pe-2 transition hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#061d49]/15"
        onClick={() => {
          setOpen((current) => !current);
          onClick?.();
        }}
        title={label}
        type="button"
      >
        <span className="grid h-10 w-10 place-items-center rounded-full bg-slate-200 text-sm font-bold text-[#061d49] ring-2 ring-white">
          {initials(user?.displayName)}
        </span>
        <Icon className="h-4 w-4 text-slate-600" name="chevronDown" />
      </button>

      {open ? (
        <div className="absolute end-0 top-12 z-50 w-72 overflow-hidden rounded-lg border border-slate-200 bg-white shadow-xl shadow-slate-900/15">
          <div className="border-b border-slate-200 px-4 py-3">
            <p className="truncate text-sm font-bold text-slate-950">{user?.displayName || t("admin.userMenu.unknownUser")}</p>
            <p className="truncate text-xs text-slate-500">{user?.email}</p>
            {activeAssignment ? (
              <p className="mt-2 rounded-lg bg-blue-50 px-3 py-2 text-xs font-semibold text-[#061d49]">
                {activeAssignment.positionTitle} · {activeAssignment.unitName}
              </p>
            ) : null}
          </div>
          <div className="space-y-1 p-2">
            <Link className="block rounded-lg px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50" onClick={() => setOpen(false)} to={settingsTo}>
              {t("admin.userMenu.settings")}
            </Link>
            <div className="rounded-lg px-3 py-2">
              <p className="text-xs font-bold uppercase tracking-wide text-slate-500">{t("admin.userMenu.roles")}</p>
              <p className="mt-1 text-sm text-slate-700">{roles.map((role) => role.displayName || role.name).join(", ") || "-"}</p>
            </div>
            <button
              className="flex w-full items-center justify-between rounded-lg px-3 py-2 text-sm font-semibold text-red-700 hover:bg-red-50"
              onClick={() => {
                setOpen(false);
                onLogout?.();
              }}
              type="button"
            >
              {t("app.logout")}
              <Icon className="h-4 w-4" name="x" />
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
