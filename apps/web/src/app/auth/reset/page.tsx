"use client";
import { useEffect, useState } from "react";
import { AccountShell } from "@/components/account-access";
import { buttonClass } from "@/components/management-ui";
import { PasswordField } from "@/components/password-field";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
export default function ResetPage() {
  const [ready, setReady] = useState(false),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [done, setDone] = useState(false);
  useEffect(() => {
    void createClient()
      .auth.getSession()
      .then(({ data }) => {
        if (
          new URLSearchParams(window.location.search).has("error") ||
          !data.session
        )
          setError("Recovery link is invalid or expired. Request a new link.");
        else setReady(true);
      })
      .catch(() => setError("Recovery is unavailable. Request a new link."));
  }, []);
  return (
    <AccountShell title="Reset your password">
      {error && (
        <p role="alert" className="mb-4 text-red-700">
          {error}
        </p>
      )}
      {done ? (
        <p role="status">
          Password updated. Sign in again with your new password.
        </p>
      ) : ready ? (
        <form
          className="space-y-4"
          onSubmit={async (e) => {
            e.preventDefault();
            const f = new FormData(e.currentTarget),
              password = String(f.get("password"));
            if (password !== f.get("confirmation")) {
              setError("Passwords must match.");
              return;
            }
            setBusy(true);
            setError("");
            try {
              const client = createClient();
              const { error } = await client.auth.updateUser({ password });
              if (error && error.code !== "same_password")
                throw new Error(
                  "Password could not be updated. Request a fresh recovery link and try again.",
                );
              await client.auth.signOut();
              setDone(true);
            } catch (e) {
              setError(e instanceof Error ? e.message : "Reset failed.");
            } finally {
              setBusy(false);
            }
          }}
        >
          <fieldset disabled={busy} className="space-y-4">
            <PasswordField label="New password" autoComplete="new-password" minLength={8} />
            <PasswordField label="Confirm password" name="confirmation" autoComplete="new-password" minLength={8} />
            <button className={buttonClass}>
              {busy ? "Updating…" : "Update password"}
            </button>
          </fieldset>
        </form>
      ) : (
        !error && <p role="status">Checking recovery session…</p>
      )}
      {error && !ready && <Link className="mt-4 block text-blue-700 underline" href="/auth/forgot">Request a new recovery link</Link>}
    </AccountShell>
  );
}
