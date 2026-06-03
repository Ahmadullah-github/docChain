import { FormEvent, useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { authApi } from "../api";
import { useAuth } from "../app/AuthContext";
import { BrandLogo } from "../components/BrandLogo";

export function ChangePasswordPage() {
  const auth = useAuth();
  const navigate = useNavigate();
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  if (!auth.loading && !auth.user) {
    return <Navigate to="/login" replace />;
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    if (newPassword.length < 8 || newPassword !== confirmPassword) {
      setError("New password must be at least 8 characters and match confirmation.");
      return;
    }

    setSubmitting(true);
    try {
      await authApi.changePassword({
        current_password: currentPassword,
        new_password: newPassword
      });
      await auth.refresh();
      navigate("/app/signature-profile", { replace: true });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not change password.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section className="grid min-h-[70vh] place-items-center">
      <form className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-8 shadow-xl shadow-slate-900/10" onSubmit={submit}>
        <div className="flex flex-col items-center text-center">
          <BrandLogo alt="DocChain" className="h-20 w-20 rounded-2xl shadow-lg shadow-slate-900/20" />
          <p className="mt-5 text-sm font-semibold uppercase tracking-[0.2em] text-amber-700">Account security</p>
          <h1 className="mt-3 text-2xl font-bold tracking-tight">Change password</h1>
        </div>

        <label className="mt-8 block text-sm font-medium text-slate-700">
          Current password
          <input className="force-ltr mt-2 w-full rounded-xl border border-slate-300 bg-white px-4 py-3 outline-none ring-amber-700/20 focus:ring-4" onChange={(event) => setCurrentPassword(event.target.value)} type="password" value={currentPassword} />
        </label>

        <label className="mt-4 block text-sm font-medium text-slate-700">
          New password
          <input className="force-ltr mt-2 w-full rounded-xl border border-slate-300 bg-white px-4 py-3 outline-none ring-amber-700/20 focus:ring-4" onChange={(event) => setNewPassword(event.target.value)} type="password" value={newPassword} />
        </label>

        <label className="mt-4 block text-sm font-medium text-slate-700">
          Confirm new password
          <input className="force-ltr mt-2 w-full rounded-xl border border-slate-300 bg-white px-4 py-3 outline-none ring-amber-700/20 focus:ring-4" onChange={(event) => setConfirmPassword(event.target.value)} type="password" value={confirmPassword} />
        </label>

        {error ? <p className="mt-4 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p> : null}

        <button className="mt-6 w-full rounded-xl bg-amber-700 px-5 py-3 font-semibold text-white hover:bg-amber-800 disabled:cursor-not-allowed disabled:opacity-60" disabled={submitting} type="submit">
          {submitting ? "Saving..." : "Save password"}
        </button>
      </form>
    </section>
  );
}
