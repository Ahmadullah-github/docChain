import { createContext, useContext, useEffect, useState } from "react";
import { authApi } from "../api";
import type { AuthAssignment, AuthRole, AuthUser } from "../api";

export type AuthState = {
  activeAssignmentId: number | null;
  assignments: AuthAssignment[];
  user: AuthUser | null;
  roles: AuthRole[];
  loading: boolean;
  isAdmin: boolean;
  refresh: () => Promise<void>;
  logout: () => Promise<void>;
  selectActiveAssignment: (assignmentId: number) => Promise<void>;
};

const AuthContext = createContext<AuthState | null>(null);

export function useAuth() {
  const value = useContext(AuthContext);
  if (!value) {
    throw new Error("useAuth must be used inside AuthContext.");
  }
  return value;
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [activeAssignmentId, setActiveAssignmentId] = useState<number | null>(null);
  const [assignments, setAssignments] = useState<AuthAssignment[]>([]);
  const [roles, setRoles] = useState<AuthRole[]>([]);
  const [user, setUser] = useState<AuthState["user"]>(null);
  const [loading, setLoading] = useState(true);

  async function refresh() {
    setLoading(true);
    try {
      const session = await authApi.me();
      setActiveAssignmentId(session.activeAssignmentId);
      setAssignments(session.assignments);
      setRoles(session.roles);
      setUser(session.user);
    } catch {
      authApi.clearSessionToken();
      setActiveAssignmentId(null);
      setAssignments([]);
      setRoles([]);
      setUser(null);
    } finally {
      setLoading(false);
    }
  }

  async function logout() {
    await authApi.logout();
    setActiveAssignmentId(null);
    setAssignments([]);
    setRoles([]);
    setUser(null);
  }

  async function selectActiveAssignment(assignmentId: number) {
    setLoading(true);
    try {
      const session = await authApi.selectActiveAssignment(assignmentId);
      setActiveAssignmentId(session.activeAssignmentId);
      setAssignments(session.assignments);
      setRoles(session.roles);
      setUser(session.user);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void refresh();
  }, []);

  return (
    <AuthContext.Provider
      value={{
        activeAssignmentId,
        assignments,
        isAdmin: roles.some((role) => ["system_admin", "admin_staff"].includes(role.name)),
        loading,
        logout,
        refresh,
        roles,
        selectActiveAssignment,
        user
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}
