import { FormEvent, useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { ApiError, authApi } from "../api";
import { useAuth } from "../app/AuthContext";
import { BrandLogo } from "../components/BrandLogo";
import { useI18n } from "../i18n";

export function LoginPage() {
  const auth = useAuth();
  const { t } = useI18n();
  const navigate = useNavigate();
  const [identifier, setIdentifier] = useState("admin@docchain.local");
  const [password, setPassword] = useState("Admin@12345");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  if (!auth.loading && auth.user) {
    return <Navigate to="/" replace />;
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);

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

  return (
    <section className="grid min-h-[70vh] place-items-center">
      <form
        className="w-full max-w-md rounded-[2rem] border border-black/10 bg-white/80 p-8 shadow-2xl shadow-slate-900/10 backdrop-blur"
        onSubmit={handleSubmit}
      >
        <div className="flex flex-col items-center text-center">
          <BrandLogo alt={t("app.name")} className="h-24 w-24 rounded-3xl shadow-lg shadow-slate-900/20" />
          <p className="mt-5 text-sm font-semibold uppercase tracking-[0.2em] text-amber-700">{t("auth.login.badge")}</p>
          <h1 className="mt-3 text-3xl font-bold tracking-tight">{t("auth.login.title")}</h1>
        </div>
        <p className="mt-3 text-sm leading-6 text-slate-600">
          {t("auth.login.description")}
        </p>

        <label className="mt-8 block text-sm font-medium text-slate-700">
          {t("auth.login.identifier")}
          <input
            className="force-ltr mt-2 w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 outline-none ring-amber-700/20 focus:ring-4"
            onChange={(event) => setIdentifier(event.target.value)}
            value={identifier}
          />
        </label>

        <label className="mt-4 block text-sm font-medium text-slate-700">
          {t("auth.login.password")}
          <input
            className="force-ltr mt-2 w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 outline-none ring-amber-700/20 focus:ring-4"
            onChange={(event) => setPassword(event.target.value)}
            type="password"
            value={password}
          />
        </label>

        {error ? <p className="mt-4 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p> : null}

        <button
          className="mt-6 w-full rounded-2xl bg-amber-700 px-5 py-3 font-semibold text-white hover:bg-amber-800 disabled:cursor-not-allowed disabled:opacity-60"
          disabled={submitting}
          type="submit"
        >
          {submitting ? t("auth.login.submitting") : t("auth.login.submit")}
        </button>
      </form>
    </section>
  );
}
