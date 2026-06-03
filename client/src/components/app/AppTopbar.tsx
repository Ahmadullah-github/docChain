import { useNavigate } from "react-router-dom";
import { useAuth } from "../../app/AuthContext";
import { NotificationMenu, LanguageSwitcher, UserMenuButton } from "../admin";
import { IconButton, SearchInput, SelectFilter } from "../ui";

type AppTopbarProps = {
  onMenuClick: () => void;
};

export function AppTopbar({ onMenuClick }: AppTopbarProps) {
  const auth = useAuth();
  const navigate = useNavigate();
  const activeAssignment = auth.assignments.find((assignment) => assignment.id === auth.activeAssignmentId) || auth.assignments[0] || null;

  async function logout() {
    await auth.logout();
    navigate("/login", { replace: true });
  }

  return (
    <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/95 backdrop-blur">
      <div className="flex h-[72px] items-center gap-4 px-4 lg:px-6">
        <IconButton className="lg:hidden" icon="menu" label="Open navigation" onClick={onMenuClick} />

        <div className="hidden min-w-0 flex-1 md:block">
          <SearchInput
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                const value = event.currentTarget.value.trim();
                if (value) {
                  navigate(`/app/documents?q=${encodeURIComponent(value)}`);
                }
              }
            }}
            placeholder="Search documents..."
            wrapperClassName="mx-auto max-w-xl"
          />
        </div>

        <div className="ms-auto flex items-center gap-3">
          <SelectFilter
            aria-label="Active assignment"
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
              <option value="">No assignment</option>
            )}
          </SelectFilter>

          <NotificationMenu routeForItem={(item) => item.document_id ? `/app/documents/${item.document_id}` : "/app/work"} />
          <LanguageSwitcher />
          <UserMenuButton
            activeAssignment={activeAssignment}
            label="User menu"
            onLogout={() => void logout()}
            roles={auth.roles}
            settingsTo="/app/signature-profile"
            user={auth.user}
          />
        </div>
      </div>
    </header>
  );
}
