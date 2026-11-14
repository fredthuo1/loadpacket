"use client";
import { useEffect, useRef, useState } from "react";
import {
  AccountShell,
  accessRequest,
  ProviderCredentials,
} from "@/components/account-access";
import { createClient } from "@/lib/supabase/client";
import {
  buttonClass,
  inputClass,
  secondaryClass,
} from "@/components/management-ui";
import { landingPage, type UserRole } from "@/lib/auth/types";
type Preview = {
  companyName: string;
  email: string;
  role: UserRole;
  status: string;
};
export default function StaffPage() {
  const initialToken = useRef<string | null>(null);
  const [token, setToken] = useState(""),
    [signedIn, setSignedIn] = useState(false),
    [preview, setPreview] = useState<Preview | null>(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [ready, setReady] = useState(false);
  async function check(value: string) {
    setError("");
    try {
      if (!/^[0-9a-f]{64}$/.test(value))
        throw new Error(
          "Open the complete invitation link supplied by your Owner.",
        );
      const { data } = await createClient().auth.getSession();
      setSignedIn(!!data.session);
      if (data.session)
        setPreview(
          await accessRequest<Preview>("/auth/staff/preview", { token: value }),
        );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Invitation unavailable.");
    } finally {
      setReady(true);
    }
  }
  useEffect(() => {
    initialToken.current ??=
      new URLSearchParams(window.location.hash.slice(1)).get("token") ?? "";
    const value = initialToken.current;
    window.history.replaceState(null, "", window.location.pathname);
    void Promise.resolve().then(() => {
      setToken(value);
      return check(value);
    });
  }, []);
  return (
    <AccountShell title="Join your carrier team">
      {!ready && <p role="status">Checking invitation…</p>}
      {error && (
        <p role="alert" className="mb-4 text-red-700">
          {error}
        </p>
      )}
      {ready && token && !signedIn && (
        <>
          <p className="mb-4">
            Sign in or register using the invited email. After email
            confirmation, reopen this invitation link.
          </p>
          <ProviderCredentials onAuthenticated={() => check(token)} />
        </>
      )}
      {preview && (
        <>
          <p className="mb-4">
            {preview.companyName} ·{" "}
            {preview.role === "BACK_OFFICE" ? "Back Office" : "Dispatcher"} ·{" "}
            {preview.email}
          </p>
          {["REVOKED", "EXPIRED"].includes(preview.status) ? (
            <p role="alert">
              This invitation is {preview.status.toLowerCase()}. Ask the Owner
              for a new link.
            </p>
          ) : (
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                setBusy(true);
                setError("");
                const f = new FormData(e.currentTarget);
                try {
                  const result = await accessRequest<{ role: UserRole }>(
                    "/auth/staff/accept",
                    {
                      token,
                      firstName: f.get("firstName"),
                      lastName: f.get("lastName"),
                    },
                  );
                  window.location.replace(landingPage(result.role));
                } catch (e) {
                  setError(
                    e instanceof Error
                      ? e.message
                      : "Acceptance failed. Retry safely.",
                  );
                } finally {
                  setBusy(false);
                }
              }}
              className="space-y-4"
            >
              {preview.status === "ACCEPTED" && (
                <p>
                  This invitation was already used. Continuing verifies your
                  existing access without creating another membership.
                </p>
              )}
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
                <button className={buttonClass}>
                  {busy
                    ? "Joining…"
                    : preview.status === "ACCEPTED"
                      ? "Continue with existing access"
                      : "Accept invitation"}
                </button>
              </fieldset>
            </form>
          )}
        </>
      )}
      {signedIn && (
        <button
          className={`${secondaryClass} mt-4`}
          onClick={() =>
            void createClient()
              .auth.signOut()
              .then(({ error }) => {
                if (error) throw new Error("Could not sign out. Please retry.");
                setSignedIn(false);
                setPreview(null);
                setError("");
              })
              .catch(() => setError("Could not sign out. Please retry."))
          }
        >
          Use another account
        </button>
      )}
    </AccountShell>
  );
}
