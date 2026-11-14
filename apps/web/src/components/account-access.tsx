"use client";
import { useState, type ReactNode, type FormEvent } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { apiError, apiFetch } from "@/lib/api/api-fetch";
import { buttonClass, inputClass, secondaryClass } from "./management-ui";
import { PasswordField } from "./password-field";

export function AccountShell({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50 p-4">
      <section className="min-w-0 w-full max-w-lg wrap-break-word rounded-2xl border bg-white p-6 sm:p-8">
        <p className="text-2xl font-black">LoadPacket</p>
        <h1 className="mb-6 mt-6 text-xl font-bold">{title}</h1>
        {children}
        <Link className="mt-6 block text-blue-700 underline" href="/login">
          Return to sign in
        </Link>
      </section>
    </main>
  );
}
export async function accessRequest<T>(
  path: string,
  body?: object,
): Promise<T> {
  const response = await apiFetch(
    path,
    body
      ? {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        }
      : undefined,
  );
  if (!response.ok) throw new Error(await apiError(response));
  return response.json() as Promise<T>;
}
export function ProviderCredentials({
  register = false,
  onAuthenticated,
}: {
  register?: boolean;
  onAuthenticated: () => void | Promise<void>;
}) {
  const [signUp, setSignUp] = useState(register),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState("");
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError("");
    setNotice("");
    const data = new FormData(e.currentTarget);
    try {
      const client = createClient();
      const credentials = {
        email: String(data.get("email")).trim(),
        password: String(data.get("password")),
      };
      if (signUp) {
        if (credentials.password !== data.get("confirmation"))
          throw new Error("Passwords must match.");
        const result = await client.auth.signUp({
          ...credentials,
          options: {
            emailRedirectTo: `${window.location.origin}/auth/callback?next=/auth/start`,
          },
        });
        if (result.error)
          throw new Error(
            "Account registration could not complete. Check your details or try signing in.",
          );
        if (!result.data.session) {
          setNotice(
            "If confirmation is required, follow the provider email. Then return here to sign in. For staff access, reopen the original invitation link after confirming.",
          );
          return;
        }
      } else {
        const result = await client.auth.signInWithPassword(credentials);
        if (result.error)
          throw new Error("Sign-in failed. Check your email and password.");
      }
      await onAuthenticated();
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Account access could not complete.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <form onSubmit={submit} className="space-y-4">
        <fieldset disabled={busy} className="space-y-4">
          <label className="block">
            Email
            <input
              className={inputClass}
              type="email"
              name="email"
              autoComplete="email"
              required
            />
          </label>
          <PasswordField autoComplete={signUp ? "new-password" : "current-password"} minLength={8} />
          {signUp && <PasswordField label="Confirm password" name="confirmation" autoComplete="new-password" minLength={8} />}
          <button className={buttonClass}>
            {busy ? "Working…" : signUp ? "Create account" : "Sign in"}
          </button>
        </fieldset>
      </form>
      {error && (
        <p role="alert" className="mt-4 text-red-700">
          {error}
        </p>
      )}
      {notice && (
        <p role="status" className="mt-4 text-slate-700">
          {notice}
        </p>
      )}
      <button
        className={`${secondaryClass} mt-4`}
        disabled={busy}
        onClick={() => {
          setSignUp(!signUp);
          setError("");
          setNotice("");
        }}
      >
        {signUp ? "Already registered? Sign in" : "Need an account? Register"}
      </button>
    </>
  );
}
