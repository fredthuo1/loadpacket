"use client";
import { useState } from "react";
import { AccountShell } from "@/components/account-access";
import { buttonClass, inputClass } from "@/components/management-ui";
import { createClient } from "@/lib/supabase/client";
export default function ForgotPage() {
  const [busy, setBusy] = useState(false),
    [sent, setSent] = useState(false);
  return (
    <AccountShell title="Recover account access">
      {sent ? (
        <p role="status">
          If this account is eligible for recovery, follow the provider email to
          reset your password. Check spam or retry later if it does not arrive.
          This message does not confirm an account exists or that delivery
          occurred.
        </p>
      ) : (
        <form
          className="space-y-4"
          onSubmit={async (e) => {
            e.preventDefault();
            const email = String(
              new FormData(e.currentTarget).get("email"),
            ).trim();
            setBusy(true);
            try {
              await createClient().auth.resetPasswordForEmail(email, {
                redirectTo: `${window.location.origin}/auth/callback?next=/auth/reset`,
              });
            } catch {
              /* Neutral response even when the provider rejects or is unavailable. */
            } finally {
              setSent(true);
              setBusy(false);
            }
          }}
        >
          <label className="block">
            Email
            <input
              className={inputClass}
              name="email"
              type="email"
              autoComplete="email"
              required
              disabled={busy}
            />
          </label>
          <button className={buttonClass} disabled={busy}>
            {busy ? "Requesting…" : "Request recovery"}
          </button>
        </form>
      )}
    </AccountShell>
  );
}
