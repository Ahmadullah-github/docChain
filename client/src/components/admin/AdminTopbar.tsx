import type { AuthUser } from "../../api";
import { useAuth } from "../../app/AuthContext";
import { useI18n } from "../../i18n";
import { useNavigate } from "react-router-dom";
import { IconButton, SelectFilter } from "../ui";
import { GlobalSearchBox } from "./GlobalSearchBox";
import { LanguageSwitcher } from "./LanguageSwitcher";
import { NotificationMenu } from "./NotificationMenu";
import { UserMenuButton } from "./UserMenuButton";

type AdminTopbarProps = {
  onMenuClick: () => void;
  user: AuthUser | null;
};

export function AdminTopbar({ onMenuClick, user }: AdminTopbarProps) {
  const auth = useAuth();
  const { t } = useI18n();
  const navigate = useNavigate();
  const activeAssignment = auth.assignments.find((assignment) => assignment.id === auth.activeAssignmentId) || auth.assignments[0] || null;

  async function logout() {
    await auth.logout();
    navigate("/login", { replace: true });
  }

  return (
    <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/95 backdrop-blur">
      <div className="flex h-[78px] items-center gap-4 px-4 lg:px-6">
        <IconButton className="lg:hidden" icon="menu" label={t("admin.topbar.openMenu")} onClick={onMenuClick} />

        <div className="hidden min-w-0 flex-1 md:block">
          <GlobalSearchBox />
        </div>

        <div className="ms-auto flex items-center gap-3">
          <SelectFilter
            aria-label={t("admin.topbar.assignment")}
            className="hidden max-w-64 min-w-40 font-bold text-[#061d49] md:block"
            disabled={!auth.assignments.length || auth.loading}
            onChange={(event) => void auth.selectActiveAssignment(Number(event.target.value))}
            value={activeAssignment?.id || ""}
          >
            {auth.assignments.length ? auth.assignments.map((assignment) => (
              <option key={assignment.id} value={assignment.id}>
                {assignment.positionTitle} - {assignment.unitName}
              </option>
            )) : (
              <option value="">{t("admin.topbar.noAssignment")}</option>
            )}
          </SelectFilter>

          <NotificationMenu />

          <LanguageSwitcher />
          <UserMenuButton
            activeAssignment={activeAssignment}
            label={t("admin.topbar.userMenu")}
            onLogout={() => void logout()}
            roles={auth.roles}
            user={user}
          />
        </div>
      </div>
    </header>
  );
}
