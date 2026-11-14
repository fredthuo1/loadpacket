"use client";
import { useEffect, useRef, useState } from "react";
import {
  ManagementPage,
  buttonClass,
  inputClass,
  secondaryClass,
} from "@/components/management-ui";
import { accessRequest } from "@/components/account-access";
import type {
  AccessMember,
  OfficeRole,
  StaffInvite,
  StaffInviteResult,
} from "../../../../../../packages/api-contracts/access";
const labels = {
  OWNER: "Owner",
  BACK_OFFICE: "Back Office",
  DISPATCHER: "Dispatcher",
};
type Team = { members: AccessMember[]; invitations: StaffInvite[] };
export default function TeamPage() {
  const [team, setTeam] = useState<Team | null>(null),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [busy, setBusy] = useState(false),
    [link, setLink] = useState("");
  const [choices, setChoices] = useState<Record<string, OfficeRole>>({});
  const requests = useRef(new Map<string, string>());
  useEffect(() => {
    let alive = true;
    void accessRequest<Team>("/team")
      .then((data) => {
        if (alive) setTeam(data);
      })
      .catch((e) => {
        if (alive)
          setError(e instanceof Error ? e.message : "Team could not load.");
      });
    return () => {
      alive = false;
    };
  }, []);
  async function run<T>(path: string, body: object = {}) {
    setBusy(true);
    setError("");
    setNotice("");
    const fingerprint = JSON.stringify([path, body]);
    const key = requests.current.get(fingerprint) ?? crypto.randomUUID();
    requests.current.set(fingerprint, key);
    try {
      const response = await accessRequest<T>(path, {
        ...body,
        idempotencyKey: key,
      });
      setTeam(await accessRequest<Team>("/team"));
      requests.current.delete(fingerprint);
      setNotice(
        "Access change saved. Membership permissions are checked on every protected API request.",
      );
      return response;
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "Access change failed. Retry the same action safely.",
      );
      return null;
    } finally {
      setBusy(false);
    }
  }
  function invitationLink(result: StaffInviteResult | null) {
    if (!result) return;
    setLink(
      result.invitePath
        ? new URL(result.invitePath, window.location.origin).toString()
        : "",
    );
    setNotice(
      result.invitePath
        ? "Invitation created. Share this link privately with the invited email address. LoadPacket has not sent an email."
        : "This request already completed. Reissue the invitation to obtain a new shareable link; the old link will stop working.",
    );
  }
  return (
    <ManagementPage
      title="Team & Access"
      description="Invite office staff and manage access to your organization. Driver invitations remain in Drivers."
    >
      {error && (
        <p role="alert" className="mb-4 rounded-xl bg-red-50 p-4 text-red-800">
          {error}
        </p>
      )}
      {notice && (
        <p
          role="status"
          className="mb-4 rounded-xl bg-emerald-50 p-4 text-emerald-900"
        >
          {notice}
        </p>
      )}
      <form
        className="mb-6 space-y-4 rounded-xl border bg-white p-5"
        onSubmit={async (e) => {
          e.preventDefault();
          const f = new FormData(e.currentTarget);
          invitationLink(
            await run<StaffInviteResult>("/team/invitations", {
              email: f.get("email"),
              role: f.get("role"),
            }),
          );
        }}
      >
        <h2 className="text-lg font-bold">Invite office staff</h2>
        <fieldset disabled={busy} className="grid gap-4 sm:grid-cols-2">
          <label>
            Invitee email
            <input
              className={inputClass}
              name="email"
              type="email"
              autoComplete="email"
              maxLength={254}
              required
            />
          </label>
          <label>
            Invitation role
            <select className={inputClass} name="role">
              <option value="BACK_OFFICE">Back Office</option>
              <option value="DISPATCHER">Dispatcher</option>
            </select>
          </label>
          <button className={buttonClass}>Create invitation link</button>
        </fieldset>
        <p className="text-sm text-slate-600">
          Links expire after seven days and require the invited email to be
          verified by the sign-in provider. No administrative credentials are
          shared.
        </p>
      </form>
      {link && (
        <section className="mb-6 rounded-xl border bg-white p-5">
          <label className="block">
            Shareable invitation link
            <input
              className={inputClass}
              value={link}
              readOnly
              onFocus={(e) => e.target.select()}
            />
          </label>
          <button
            className={`${secondaryClass} mt-3`}
            onClick={() =>
              void navigator.clipboard
                .writeText(link)
                .then(() =>
                  setNotice(
                    "Link copied. Share it privately with the invitee.",
                  ),
                )
                .catch(() => setNotice("Select and copy the link above."))
            }
          >
            Copy link
          </button>
          <p className="mt-3 text-sm">
            This link is shown only for the new invitation. Reissuing
            invalidates earlier links.
          </p>
        </section>
      )}
      {!team ? (
        <p role="status">
          {error ? "Use Refresh to try again." : "Loading team…"}
        </p>
      ) : (
        <>
          <section className="mb-6 overflow-x-auto rounded-xl border bg-white p-5">
            <h2 className="mb-4 text-lg font-bold">Organization members</h2>
            <p className="mb-4 text-sm text-slate-600">
              Owners can manage access and organization settings. Keep at least
              one active Owner. Revocation preserves historical records and does
              not delete the provider account.
            </p>
            <table className="w-full text-left text-sm">
              <thead>
                <tr>
                  <th className="p-2">Member</th>
                  <th className="p-2">Role</th>
                  <th className="p-2">Access</th>
                  <th className="p-2">Actions</th>
                </tr>
              </thead>
              <tbody>
                {team.members.map((m) => (
                  <tr key={m.id} className="border-t">
                    <td className="p-2">
                      {m.firstName} {m.lastName}
                      <br />
                      {m.email}
                    </td>
                    <td className="p-2">
                      <select
                        aria-label={`Role for ${m.email}`}
                        className={inputClass}
                        disabled={busy || !m.active}
                        value={choices[m.id] ?? m.role}
                        onChange={(e) =>
                          setChoices({
                            ...choices,
                            [m.id]: e.target.value as OfficeRole,
                          })
                        }
                      >
                        {Object.entries(labels).map(([value, label]) => (
                          <option key={value} value={value}>
                            {label}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="p-2">{m.active ? "Active" : "Revoked"}</td>
                    <td className="space-y-2 p-2">
                      <button
                        className={secondaryClass}
                        disabled={
                          busy ||
                          !m.active ||
                          (choices[m.id] ?? m.role) === m.role
                        }
                        onClick={() =>
                          void run(`/team/members/${m.id}/role`, {
                            role: choices[m.id],
                          })
                        }
                      >
                        Save role
                      </button>
                      <button
                        className={secondaryClass}
                        disabled={busy || !m.active}
                        onClick={() => void run(`/team/members/${m.id}/remove`)}
                      >
                        Revoke access
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
          <section className="overflow-x-auto rounded-xl border bg-white p-5">
            <h2 className="mb-4 text-lg font-bold">Latest invitations</h2>
            {!team.invitations.length ? (
              <p>No staff invitations yet.</p>
            ) : (
              <table className="w-full text-left text-sm">
                <thead>
                  <tr>
                    <th className="p-2">Email / role</th>
                    <th className="p-2">Status / expires</th>
                    <th className="p-2">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {team.invitations.map((i) => (
                    <tr key={i.id} className="border-t">
                      <td className="p-2">
                        {i.email}
                        <br />
                        {labels[i.role]}
                      </td>
                      <td className="p-2">
                        {i.status}
                        <br />
                        {new Date(i.expiresAt).toLocaleString()}
                      </td>
                      <td className="space-y-2 p-2">
                        {i.status !== "ACCEPTED" && (
                          <button
                            className={secondaryClass}
                            disabled={busy}
                            onClick={() =>
                              void run<StaffInviteResult>(
                                `/team/invitations/${i.id}/reissue`,
                              ).then(invitationLink)
                            }
                          >
                            Reissue link
                          </button>
                        )}
                        {i.status === "PENDING" && (
                          <button
                            className={secondaryClass}
                            disabled={busy}
                            onClick={() =>
                              void run(`/team/invitations/${i.id}/revoke`)
                            }
                          >
                            Revoke invitation
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>
        </>
      )}
      <button
        className={`${secondaryClass} mt-5`}
        disabled={busy}
        onClick={() => {
          setError("");
          void accessRequest<Team>("/team")
            .then(setTeam)
            .catch((e) =>
              setError(e instanceof Error ? e.message : "Refresh failed."),
            );
        }}
      >
        Refresh
      </button>
    </ManagementPage>
  );
}
