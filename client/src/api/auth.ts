import { setCsrfToken } from "../lib/api";
import { getJson, postJson } from "./http";
import type {
  AuthSession,
  ForgotPasswordInput,
  ForgotPasswordResponse,
  LoginInput,
  ResetPasswordInput,
  ResetPasswordResponse
} from "./types";

export const authApi = {
  async login(input: LoginInput) {
    const session = await postJson<AuthSession>("/api/auth/login", input);
    setCsrfToken(session.csrfToken);
    return session;
  },

  async logout() {
    const result = await postJson<{ loggedOut: boolean }>("/api/auth/logout");
    setCsrfToken(null);
    return result;
  },

  async changePassword(input: { current_password: string; new_password: string }) {
    const session = await postJson<AuthSession>("/api/auth/change-password", input);
    setCsrfToken(session.csrfToken);
    return session;
  },

  async requestPasswordReset(input: ForgotPasswordInput) {
    return postJson<ForgotPasswordResponse>("/api/auth/forgot-password", input);
  },

  async resetPassword(input: ResetPasswordInput) {
    return postJson<ResetPasswordResponse>("/api/auth/reset-password", input);
  },

  async me() {
    const session = await getJson<AuthSession>("/api/auth/me");
    setCsrfToken(session.csrfToken);
    return session;
  },

  async selectActiveAssignment(assignmentId: number) {
    const session = await postJson<AuthSession>("/api/auth/active-assignment", { assignmentId });
    setCsrfToken(session.csrfToken);
    return session;
  },

  clearSessionToken() {
    setCsrfToken(null);
  }
};
