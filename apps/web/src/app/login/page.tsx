"use client";
import { useEffect, useState, type FormEvent } from "react";
import { PasswordField } from "@/components/password-field";
import { createClient } from "@/lib/supabase/client";
import { apiError, apiFetch } from "@/lib/api/api-fetch";
import { landingPage, type CurrentUser } from "@/lib/auth/types";
import { buttonClass } from "@/components/management-ui";

export default function LoginPage() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [checking, setChecking] = useState(true);
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const { data } = await createClient().auth.getSession();
        if (!data.session || cancelled) return;
        const response = await apiFetch("/me");
        if (cancelled) return;
        if (response.ok) {
          const user = (await response.json()) as CurrentUser;
          window.location.replace(user.onboardingRequired ? "/auth/invite" : landingPage(user.role));
        } else if (response.status === 403 && (await response.clone().json().catch(() => null))?.code === "ACCOUNT_SETUP_REQUIRED") {
          window.location.replace("/auth/start");
        }
      } catch {
        // The sign-in form remains available when session restoration fails.
      } finally {
        if (!cancelled) setChecking(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);
  async function login(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    const form = new FormData(event.currentTarget);
    try {
      const supabase = createClient();
      const { error: authError } = await supabase.auth.signInWithPassword({
        email: String(form.get("email")).trim(),
        password: String(form.get("password")),
      });
      if (authError) throw new Error(authError.message);
      const response = await apiFetch("/me");
      if (!response.ok) {
        if (
          response.status === 403 &&
          (
            await response
              .clone()
              .json()
              .catch(() => null)
          )?.code === "ACCOUNT_SETUP_REQUIRED"
        ) {
          window.location.replace("/auth/start");
          return;
        }
        const message = await apiError(response);
        await supabase.auth.signOut();
        throw new Error(message);
      }
      const user = (await response.json()) as CurrentUser;
      window.location.replace(
        user.onboardingRequired ? "/auth/invite" : landingPage(user.role),
      );
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Sign-in failed. Please try again.",
      );
      setBusy(false);
    }
  }
  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50 px-6">
      <section className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-8">
        <p className="text-2xl font-black tracking-tight text-slate-950">
          LoadPacket
        </p>
        <p className="mt-2 text-sm text-slate-600">Carrier Operations</p>
        <h1 className="mb-6 mt-8 text-xl font-semibold">
          Sign in to your carrier account
        </h1>
        <form onSubmit={login} className="space-y-5">
          <label className="block text-sm font-medium">
            Email
            <input
              name="email"
              type="email"
              autoComplete="username"
              required
              disabled={busy}
              className="mt-2 w-full rounded-lg border border-slate-300 p-3"
            />
          </label>
          <PasswordField disabled={busy || checking} />
          {checking && <p role="status">Checking your session…</p>}
          {error && (
            <p role="alert" className="text-sm text-red-700">
              {error}
            </p>
          )}
          <button disabled={busy || checking} className={`w-full ${buttonClass}`}>
            {busy ? "Signing in…" : "Sign in"}
          </button>
        </form>
        <p className="mt-6 text-sm text-slate-600">
          <a className="text-blue-700 underline" href="/auth/register">
            Start a carrier account
          </a>
          {" · "}
          <a className="text-blue-700 underline" href="/auth/forgot">
            Forgot password?
          </a>
        </p>
      </section>
    </main>
  );
}
