import { FormEvent, useEffect, useMemo, useState } from "react";
import { Navigate, useNavigate, useSearchParams } from "react-router-dom";
import {
  ArrowRight,
  Eye,
  EyeOff,
  FileCheck2,
  KeyRound,
  LockKeyhole,
  Mail,
  RotateCcw,
  ShieldCheck,
  Workflow
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { ApiError, authApi } from "../api";
import { useAuth } from "../app/AuthContext";
import { BrandLogo } from "../components/BrandLogo";
import { useI18n } from "../i18n";
import { cx } from "../lib/classNames";

type AuthMode = "login" | "forgot" | "reset";

type AuthFieldProps = {
  autoComplete: string;
  icon: LucideIcon;
  id: string;
  label: string;
  onChange: (value: string) => void;
  type?: string;
  value: string;
};

type PasswordFieldProps = {
  autoComplete: string;
  id: string;
  label: string;
  onChange: (value: string) => void;
  value: string;
};

type ModeHeaderProps = {
  badge: string;
  description: string;
  mode: AuthMode;
  title: string;
};

type SubmitButtonProps = {
  icon: LucideIcon;
  label: string;
  loading: boolean;
  loadingLabel: string;
};

const fieldInputClassName = "force-ltr h-14 w-full rounded-lg border border-slate-300 bg-white px-4 ps-14 text-[0.95rem] font-semibold text-slate-950 shadow-sm outline-none transition duration-200 placeholder:text-slate-400 focus:border-[#b48a2c] focus:ring-4 focus:ring-[#b48a2c]/18";

const modeIcons: Record<AuthMode, LucideIcon> = {
  forgot: RotateCcw,
  login: ShieldCheck,
  reset: KeyRound
};

function AuthField({ autoComplete, icon: Icon, id, label, onChange, type = "text", value }: AuthFieldProps) {
  const hasValue = value.trim().length > 0;

  return (
    <label className="group block text-sm font-bold text-slate-800" htmlFor={id}>
      {label}
      <span className="relative mt-2 block transition duration-200 group-focus-within:-translate-y-0.5">
        <span
          className={cx(
            "pointer-events-none absolute start-3 top-1/2 inline-grid h-9 w-9 -translate-y-1/2 place-items-center rounded-md border transition duration-200",
            hasValue ? "border-[#d4b45f] bg-[#fff7df] text-[#7a5813]" : "border-slate-200 bg-slate-50 text-slate-400",
            "group-focus-within:border-[#b48a2c] group-focus-within:bg-[#fff4cf] group-focus-within:text-[#6b4b0f]"
          )}
        >
          <Icon className="h-4 w-4" />
        </span>
        <input
          autoComplete={autoComplete}
          className={fieldInputClassName}
          id={id}
          onChange={(event) => onChange(event.target.value)}
          type={type}
          value={value}
        />
      </span>
    </label>
  );
}

function PasswordField({ autoComplete, id, label, onChange, value }: PasswordFieldProps) {
  const [visible, setVisible] = useState(false);
  const hasValue = value.length > 0;

  return (
    <label className="group block text-sm font-bold text-slate-800" htmlFor={id}>
      {label}
      <span className="relative mt-2 block transition duration-200 group-focus-within:-translate-y-0.5">
        <span
          className={cx(
            "pointer-events-none absolute start-3 top-1/2 inline-grid h-9 w-9 -translate-y-1/2 place-items-center rounded-md border transition duration-200",
            hasValue ? "border-[#d4b45f] bg-[#fff7df] text-[#7a5813]" : "border-slate-200 bg-slate-50 text-slate-400",
            "group-focus-within:border-[#b48a2c] group-focus-within:bg-[#fff4cf] group-focus-within:text-[#6b4b0f]"
          )}
        >
          <LockKeyhole className="h-4 w-4" />
        </span>
        <input
          autoComplete={autoComplete}
          className={cx(fieldInputClassName, "pe-12")}
          id={id}
          onChange={(event) => onChange(event.target.value)}
          type={visible ? "text" : "password"}
          value={value}
        />
        <button
          aria-label={visible ? "Hide password" : "Show password"}
          className="absolute end-2 top-1/2 inline-grid h-10 w-10 -translate-y-1/2 place-items-center rounded-md text-slate-500 transition duration-200 hover:bg-[#f5ecd5] hover:text-[#6b4b0f] active:scale-95"
          onClick={() => setVisible((current) => !current)}
          type="button"
        >
          {visible ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
        </button>
      </span>
    </label>
  );
}

function ModeHeader({ badge, description, mode, title }: ModeHeaderProps) {
  const Icon = modeIcons[mode];

  return (
    <div className="flex items-start gap-4">
      <span className="inline-grid h-12 w-12 shrink-0 place-items-center rounded-lg border border-[#d8bd6d] bg-[#fff6d9] text-[#6f4d0e] shadow-sm">
        <Icon className="h-5 w-5" />
      </span>
      <div>
        <p className="text-xs font-black uppercase tracking-[0.18em] text-[#a26318]">{badge}</p>
        <h1 className="mt-2 text-2xl font-black tracking-tight text-slate-950 sm:text-3xl">{title}</h1>
        <p className="mt-3 max-w-xl text-sm leading-6 text-slate-600">{description}</p>
      </div>
    </div>
  );
}

function SubmitButton({ icon: Icon, label, loading, loadingLabel }: SubmitButtonProps) {
  return (
    <button
      className={cx(
        "inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-lg bg-[#071a34] px-5 py-3 font-bold text-white shadow-lg shadow-[#071a34]/20 transition duration-200 hover:-translate-y-0.5 hover:bg-[#102847] hover:shadow-xl hover:shadow-[#071a34]/25 active:translate-y-0 disabled:cursor-not-allowed disabled:opacity-60",
        loading && "animate-pulse"
      )}
      disabled={loading}
      type="submit"
    >
      {loading ? loadingLabel : label}
      <Icon className="h-4 w-4 rtl:rotate-180" />
    </button>
  );
}

export function LoginPage() {
  const auth = useAuth();
  const { t } = useI18n();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const resetTokenFromUrl = searchParams.get("resetToken") || "";
  const [mode, setMode] = useState<AuthMode>(resetTokenFromUrl ? "reset" : "login");
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [resetToken, setResetToken] = useState(resetTokenFromUrl);
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [devResetUrl, setDevResetUrl] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const modeCopy = useMemo(() => ({
    login: {
      badge: t("auth.login.badge"),
      title: t("auth.login.title"),
      description: t("auth.login.description")
    },
    forgot: {
      badge: t("auth.forgot.badge"),
      title: t("auth.forgot.title"),
      description: t("auth.forgot.description")
    },
    reset: {
      badge: t("auth.reset.badge"),
      title: t("auth.reset.title"),
      description: t("auth.reset.description")
    }
  }), [t]);

  const officialMarks = useMemo(() => [
    { icon: ShieldCheck, title: t("auth.login.trust.sessions"), description: t("auth.login.trust.sessionsText") },
    { icon: Workflow, title: t("auth.login.trust.workflow"), description: t("auth.login.trust.workflowText") },
    { icon: FileCheck2, title: t("auth.login.trust.verification"), description: t("auth.login.trust.verificationText") }
  ], [t]);

  useEffect(() => {
    if (resetTokenFromUrl) {
      setResetToken(resetTokenFromUrl);
      setMode("reset");
      setError(null);
      setNotice(null);
    }
  }, [resetTokenFromUrl]);

  if (!auth.loading && auth.user) {
    return <Navigate to="/" replace />;
  }

  function switchMode(nextMode: AuthMode) {
    setMode(nextMode);
    setError(null);
    setNotice(null);
    setDevResetUrl(null);
    if (nextMode !== "reset") {
      setSearchParams({}, { replace: true });
    }
  }

  async function handleLogin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    setNotice(null);

    try {
      await authApi.login({ identifier, password });
      await auth.refresh();
      navigate("/");
    } catch (caught) {
      setError(caught instanceof ApiError ? t("auth.login.failed") : caught instanceof Error ? caught.message : t("auth.login.failed"));
    } finally {
      setSubmitting(false);
    }
  }

  async function handleForgotPassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    setNotice(null);
    setDevResetUrl(null);

    try {
      const result = await authApi.requestPasswordReset({ identifier });
      setNotice(t("auth.forgot.success", { minutes: result.expiresInMinutes }));
      setDevResetUrl(result.resetUrl || null);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : t("auth.forgot.failed"));
    } finally {
      setSubmitting(false);
    }
  }

  async function handleResetPassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setNotice(null);

    if (!resetToken.trim()) {
      setError(t("auth.reset.tokenRequired"));
      return;
    }

    if (newPassword.length < 8 || newPassword !== confirmPassword) {
      setError(t("auth.reset.passwordMismatch"));
      return;
    }

    setSubmitting(true);
    try {
      await authApi.resetPassword({
        token: resetToken.trim(),
        new_password: newPassword
      });
      setMode("login");
      setPassword("");
      setResetToken("");
      setNewPassword("");
      setConfirmPassword("");
      setSearchParams({}, { replace: true });
      setNotice(t("auth.reset.success"));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : t("auth.reset.failed"));
    } finally {
      setSubmitting(false);
    }
  }

  const copy = modeCopy[mode];

  return (
    <section className="relative isolate flex min-h-[calc(100vh-4.5rem)] w-full items-center justify-center px-4 py-6 sm:px-6 sm:py-8 lg:px-8">
      <div className="absolute inset-0 -z-10 bg-[linear-gradient(90deg,rgba(20,41,69,.045)_1px,transparent_1px),linear-gradient(0deg,rgba(20,41,69,.035)_1px,transparent_1px)] bg-[size:28px_28px]" />
      <div className="auth-portal-card w-full max-w-6xl overflow-hidden rounded-lg border border-[#ccb66f]/50 bg-[#fffdf7] shadow-2xl shadow-slate-900/12">
        <header className="border-b-[3px] border-[#c8a444] bg-[#071a34] px-5 py-5 text-white sm:px-7">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-4">
              <BrandLogo alt={t("app.name")} className="h-14 w-14 rounded-lg ring-2 ring-[#d7bd65]/45" />
              <div>
                <p className="text-xs font-black uppercase tracking-[0.22em] text-[#f1ca56]">{t("auth.login.heroBadge")}</p>
                <p className="mt-1 text-xl font-black tracking-tight">{t("app.name")}</p>
              </div>
            </div>
            <div className="inline-flex w-fit items-center gap-2 rounded-full border border-white/15 bg-white/8 px-3 py-2 text-xs font-bold text-slate-100">
              <ShieldCheck className="h-4 w-4 text-[#f1ca56]" />
              {t("auth.login.sessionNote")}
            </div>
          </div>
        </header>

        <div className="grid lg:grid-cols-[0.9fr_1.1fr]">
          <aside className="order-2 border-t border-[#e3d8b7] bg-[#fbf6e8] p-5 sm:p-7 lg:order-1 lg:border-e lg:border-t-0">
            <div className="rounded-lg border border-[#dfcf95] bg-white/70 p-5 shadow-sm">
              <p className="text-xs font-black uppercase tracking-[0.2em] text-[#a26318]">{t("auth.login.heroBadge")}</p>
              <h2 className="mt-3 text-2xl font-black leading-tight text-[#071a34]">{t("auth.login.heroTitle")}</h2>
              <p className="mt-4 text-sm leading-7 text-slate-700">{t("auth.login.heroDescription")}</p>
            </div>

            <div className="mt-5 grid gap-3">
              {officialMarks.map((item) => {
                const Icon = item.icon;
                return (
                  <div className="flex items-start gap-3 rounded-lg border border-[#eadfbf] bg-[#fffaf0] px-4 py-3 transition duration-200 hover:-translate-y-0.5 hover:border-[#d4b45f] hover:shadow-md hover:shadow-[#7b5b16]/10" key={item.title}>
                    <span className="inline-grid h-10 w-10 shrink-0 place-items-center rounded-md border border-[#d7bd65] bg-[#fff4cf] text-[#71500f]">
                      <Icon className="h-5 w-5" />
                    </span>
                    <div>
                      <p className="font-black text-[#071a34]">{item.title}</p>
                      <p className="mt-1 text-sm leading-6 text-slate-600">{item.description}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          </aside>

          <main className="order-1 bg-white p-5 sm:p-7 lg:order-2 lg:flex lg:items-center lg:p-10">
            <div className="auth-mode-panel mx-auto w-full max-w-xl" key={mode}>
              <ModeHeader badge={copy.badge} description={copy.description} mode={mode} title={copy.title} />

              {notice ? (
                <p className="mt-6 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm leading-6 text-emerald-800" role="status">
                  {notice}
                </p>
              ) : null}

              {error ? (
                <p className="mt-6 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm leading-6 text-red-700" role="alert">
                  {error}
                </p>
              ) : null}

              {mode === "login" ? (
                <form className="mt-8 space-y-5" onSubmit={handleLogin}>
                  <AuthField
                    autoComplete="username"
                    icon={Mail}
                    id="login-identifier"
                    label={t("auth.login.identifier")}
                    onChange={setIdentifier}
                    value={identifier}
                  />

                  <PasswordField
                    autoComplete="current-password"
                    id="login-password"
                    label={t("auth.login.password")}
                    onChange={setPassword}
                    value={password}
                  />

                  <div className="flex flex-col items-start gap-2 border-y border-slate-100 py-3 sm:flex-row sm:items-center sm:justify-between sm:gap-3">
                    <span className="text-xs font-semibold text-slate-500">{t("auth.login.sessionNote")}</span>
                    <button
                      className="inline-flex items-center gap-2 whitespace-nowrap text-sm font-black text-[#9a5f13] transition duration-200 hover:text-[#6b3f08] active:translate-y-px"
                      onClick={() => switchMode("forgot")}
                      type="button"
                    >
                      <KeyRound className="h-4 w-4" />
                      {t("auth.login.forgotPassword")}
                    </button>
                  </div>

                  <SubmitButton icon={ArrowRight} label={t("auth.login.submit")} loading={submitting} loadingLabel={t("auth.login.submitting")} />
                </form>
              ) : null}

              {mode === "forgot" ? (
                <form className="mt-8 space-y-5" onSubmit={handleForgotPassword}>
                  <AuthField
                    autoComplete="username"
                    icon={Mail}
                    id="forgot-identifier"
                    label={t("auth.forgot.identifier")}
                    onChange={setIdentifier}
                    value={identifier}
                  />

                  {devResetUrl ? (
                    <a
                      className="flex items-center justify-between rounded-lg border border-[#d4b45f] bg-[#fff7df] px-4 py-3 text-sm font-black text-[#71500f] transition duration-200 hover:-translate-y-0.5 hover:bg-[#fff0bd]"
                      href={devResetUrl}
                    >
                      {t("auth.forgot.devResetLink")}
                      <KeyRound className="h-4 w-4" />
                    </a>
                  ) : null}

                  <SubmitButton icon={RotateCcw} label={t("auth.forgot.submit")} loading={submitting} loadingLabel={t("auth.forgot.submitting")} />

                  <button className="w-full rounded-lg px-4 py-2 text-sm font-black text-slate-600 transition duration-200 hover:bg-slate-50 hover:text-slate-950 active:translate-y-px" onClick={() => switchMode("login")} type="button">
                    {t("auth.backToLogin")}
                  </button>
                </form>
              ) : null}

              {mode === "reset" ? (
                <form className="mt-8 space-y-5" onSubmit={handleResetPassword}>
                  <AuthField
                    autoComplete="one-time-code"
                    icon={LockKeyhole}
                    id="reset-token"
                    label={t("auth.reset.token")}
                    onChange={setResetToken}
                    value={resetToken}
                  />

                  <PasswordField
                    autoComplete="new-password"
                    id="reset-new-password"
                    label={t("auth.reset.newPassword")}
                    onChange={setNewPassword}
                    value={newPassword}
                  />
                  <PasswordField
                    autoComplete="new-password"
                    id="reset-confirm-password"
                    label={t("auth.reset.confirmPassword")}
                    onChange={setConfirmPassword}
                    value={confirmPassword}
                  />

                  <SubmitButton icon={KeyRound} label={t("auth.reset.submit")} loading={submitting} loadingLabel={t("auth.reset.submitting")} />

                  <button className="w-full rounded-lg px-4 py-2 text-sm font-black text-slate-600 transition duration-200 hover:bg-slate-50 hover:text-slate-950 active:translate-y-px" onClick={() => switchMode("login")} type="button">
                    {t("auth.backToLogin")}
                  </button>
                </form>
              ) : null}
            </div>
          </main>
        </div>
      </div>
    </section>
  );
}
