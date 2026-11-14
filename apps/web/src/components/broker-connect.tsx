"use client";
import { useCallback, useEffect, useState } from "react";
import { apiFetch, apiError } from "@/lib/api/api-fetch";
type Access = {
  expired?: boolean;
  id: string;
  expiresAt: string;
  revokedAt: string | null;
  lastAccessedAt: string | null;
};
const choices = [
  "VIEW_LOAD_SUMMARY",
  "VIEW_ROUTE",
  "VIEW_AGREEMENT",
  "VIEW_DOCUMENT_STATUS",
  "VIEW_DELIVERY_STATUS",
  "VIEW_SHARED_DOCUMENTS",
];
export function BrokerConnect({ loadId }: { loadId: string }) {
  const [accesses, setAccesses] = useState<Access[]>([]);
  const [link, setLink] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const refresh = useCallback(async () => {
    const response = await apiFetch(`/loads/${loadId}/broker-access`);
    if (!response.ok) throw new Error(await apiError(response));
    const items = (await response.json()) as Access[];
    setAccesses(
      items.map((item) => ({
        ...item,
        expired: new Date(item.expiresAt).getTime() <= Date.now(),
      })),
    );
  }, [loadId]);
  useEffect(() => {
    const pending = setTimeout(() => {
      void refresh().catch((e) => setMessage(e.message));
    }, 0);
    return () => clearTimeout(pending);
  }, [refresh]);
  return (
    <section
      aria-label="Broker Connect"
      className="rounded-2xl border border-slate-200 bg-white p-6"
    >
      <h2 className="text-xl font-bold">Broker Connect</h2>
      <p className="my-3 text-sm text-slate-600">
        Anyone with the link can view the selected information until expiry or
        revocation. A new link revokes prior links. Copy it now; it cannot be
        retrieved later.
      </p>
      <form
        className="space-y-3"
        onSubmit={async (event) => {
          event.preventDefault();
          if (busy) return;
          setBusy(true);
          setLink("");
          setMessage("");
          const data = new FormData(event.currentTarget);
          try {
            const response = await apiFetch(`/loads/${loadId}/broker-access`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                expiresInDays: Number(data.get("days")),
                permissions: data.getAll("permission"),
                documentTypes: data.getAll("document"),
              }),
            });
            if (!response.ok) throw new Error(await apiError(response));
            const result = await response.json();
            setLink(`${window.location.origin}${result.path}`);
            await refresh();
          } catch (e) {
            setMessage(
              e instanceof Error ? e.message : "Could not create link.",
            );
          } finally {
            setBusy(false);
          }
        }}
      >
        <label>
          Expires in{" "}
          <select name="days" defaultValue="7" className="rounded border p-2">
            <option value="1">24 hours</option>
            <option value="7">7 days</option>
            <option value="30">30 days</option>
          </select>
        </label>
        <fieldset>
          <legend className="font-bold">Shared information</legend>
          {choices.map((permission) => (
            <label key={permission} className="block py-1">
              <input
                type="checkbox"
                name="permission"
                value={permission}
                defaultChecked={[
                  "VIEW_LOAD_SUMMARY",
                  "VIEW_ROUTE",
                  "VIEW_DOCUMENT_STATUS",
                  "VIEW_DELIVERY_STATUS",
                ].includes(permission)}
              />{" "}
              {permission
                .replace("VIEW_", "")
                .replaceAll("_", " ")
                .toLowerCase()}
            </label>
          ))}
        </fieldset>
        <fieldset>
          <legend className="font-bold">
            Document types (requires shared documents permission)
          </legend>
          {["RATE_CONFIRMATION", "BOL", "POD", "CARRIER_INVOICE"].map(
            (type) => (
              <label key={type} className="mr-4 inline-block">
                <input type="checkbox" name="document" value={type} />{" "}
                {type.replaceAll("_", " ")}
              </label>
            ),
          )}
        </fieldset>
        <button
          disabled={busy}
          className="rounded bg-blue-700 px-4 py-3 font-bold text-white disabled:bg-slate-200 disabled:text-slate-600"
        >
          {busy ? "Creating…" : "Generate New Broker Link"}
        </button>
      </form>
      {link && (
        <div className="my-4">
          <input
            aria-label="New broker link"
            className="w-full rounded border p-2"
            readOnly
            value={link}
          />
          <button
            className="mt-2 rounded border p-2"
            onClick={() =>
              void navigator.clipboard
                .writeText(link)
                .then(() => setMessage("Link copied."))
                .catch(() => setMessage("Select and copy the link above."))
            }
          >
            Copy Link
          </button>
        </div>
      )}
      {!accesses.length && <p className="mt-3">No share links.</p>}
      {accesses.map((access) => (
        <div key={access.id} className="mt-3 border-t pt-3">
          <p>
            {access.revokedAt
              ? "Revoked"
              : access.expired
                ? "Expired"
                : "Active"}{" "}
            · until {new Date(access.expiresAt).toLocaleString()}
          </p>
          {access.lastAccessedAt && (
            <p className="text-sm text-slate-600">
              Last accessed {new Date(access.lastAccessedAt).toLocaleString()}
            </p>
          )}
          {!access.revokedAt && (
            <button
              disabled={busy}
              className="mt-2 rounded border p-2"
              onClick={async () => {
                setBusy(true);
                try {
                  const response = await apiFetch(
                    `/loads/${loadId}/broker-access/${access.id}/revoke`,
                    { method: "POST" },
                  );
                  if (!response.ok) throw new Error(await apiError(response));
                  setLink("");
                  await refresh();
                  setMessage("Link revoked.");
                } catch (e) {
                  setMessage(
                    e instanceof Error ? e.message : "Could not revoke.",
                  );
                } finally {
                  setBusy(false);
                }
              }}
            >
              Revoke
            </button>
          )}
        </div>
      ))}
      {message && (
        <p role="status" className="mt-3">
          {message}
        </p>
      )}
    </section>
  );
}
