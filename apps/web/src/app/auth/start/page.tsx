"use client";
import { useEffect, useState } from "react";
import {
  AccountShell,
  accessRequest,
  ProviderCredentials,
} from "@/components/account-access";
import { buttonClass, inputClass, secondaryClass } from "@/components/management-ui";
import { logout } from "@/components/auth-provider";
import { createClient } from "@/lib/supabase/client";
import { landingPage, type UserRole } from "@/lib/auth/types";
import type { AccountStatus } from "../../../../../../packages/api-contracts/access";
export default function StartPage() {
  const [ready, setReady] = useState(false),
    [signedIn, setSignedIn] = useState(false),
    [eligible, setEligible] = useState(false),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  async function check() {
    setReady(false);
    setEligible(false);
    try {
      if (new URLSearchParams(window.location.search).has("error"))
        throw new Error("Confirmation link is invalid or expired. Return to sign in or request a fresh confirmation from your account provider.");
      const { data } = await createClient().auth.getSession();
      setError("");
      if (!data.session) {
        setSignedIn(false);
        setReady(true);
        return;
      }
      setSignedIn(true);
      const status = await accessRequest<AccountStatus>("/auth/account");
      if (status.linked) {
        if (!status.active)
          throw new Error(
            "Your membership is inactive. Contact your organization Owner.",
          );
        window.location.replace(
          status.role === "OWNER"
            ? "/settings/company"
            : landingPage(status.role as UserRole),
        );
        return;
      }
      setEligible(true);
      setReady(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Account verification failed.");
      setReady(true);
    }
  }
  useEffect(() => {
    void Promise.resolve().then(check);
  }, []);
  return (
    <AccountShell title="Set up your organization">
      {!ready && <p role="status">Checking account…</p>}
      {error && (
        <p role="alert" className="mb-4 text-red-700">
          {error}
        </p>
      )}
      {ready && !signedIn && !error && <ProviderCredentials onAuthenticated={check} />}
      {ready && error && !eligible && <div className="flex flex-wrap gap-3">
        <button className={secondaryClass} onClick={() => void check()}>Retry account check</button>
        {signedIn && <button className={secondaryClass} onClick={() => void logout().catch(() => setError("Could not sign out. Please retry."))}>Sign out</button>}
      </div>}
      {ready && signedIn && eligible && (
        <form
          className="space-y-4"
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            setError("");
            const f = new FormData(e.currentTarget);
            try {
              await accessRequest("/auth/provision", {
                firstName: f.get("firstName"),
                lastName: f.get("lastName"),
                companyName: f.get("companyName"),
              });
              window.location.replace("/settings/company");
            } catch (e) {
              setError(
                e instanceof Error
                  ? e.message
                  : "Setup failed. Retry safely with the same account.",
              );
            } finally {
              setBusy(false);
            }
          }}
        >
          <p>
            Step 1 of 2: create your organization, then complete Company Settings.
            Your verified account becomes the initial Owner. If you were invited
            to an existing carrier, reopen that invitation instead.
          </p>
          <fieldset disabled={busy} className="space-y-4">
            <label className="block">
              First name
              <input
                name="firstName"
                className={inputClass}
                maxLength={120}
                required
              />
            </label>
            <label className="block">
              Last name
              <input
                name="lastName"
                className={inputClass}
                maxLength={120}
                required
              />
            </label>
            <label className="block">
              Legal company name
              <input
                name="companyName"
                className={inputClass}
                maxLength={200}
                required
              />
            </label>
            <button className={buttonClass}>
              {busy ? "Setting up…" : "Create organization"}
            </button>
          </fieldset>
          <p className="text-sm text-slate-600">
            You can finish contact details, address and default payment terms in
            Company Settings. Retrying cannot create a duplicate organization
            for this identity.
          </p>
        </form>
      )}
    </AccountShell>
  );
}
