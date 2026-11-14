"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { apiFetch } from "@/lib/api/api-fetch";
import { buttonClass, secondaryClass, Field, Feedback, Panel } from "./management-ui";

type Stop = { type: string; facilityName: string | null; address: string; appointmentText: string | null; referenceNumber: string | null };
type Management = { token: string; eligibility: { correct: boolean; unassign: boolean; cancel: boolean; reason: string }; load: { brokerContact: string | null; equipment: string | null; linehaul: string | null; fuelSurcharge: string | null; totalRate: string; paymentTermsDays: number | null; stops: Stop[] }; history: { id: string; type: string; actorName: string | null; occurredAt: string; metadata: { reason?: string; before?: unknown; after?: unknown; assignment?: { driverId: string; acceptedAt: string | null } } }[] };
const labels: Record<string, string> = { brokerContact: "Broker contact", equipment: "Equipment", linehaul: "Linehaul", fuelSurcharge: "Fuel surcharge", totalRate: "Total rate", paymentTermsDays: "Payment terms (days)", facilityName: "Facility", address: "Address", appointmentText: "Appointment", referenceNumber: "Reference" };

export function LoadManagement({ loadId, revision, onToken, onChanged }: { loadId: string; revision: unknown; onToken: (token: string) => void; onChanged: () => Promise<void> }) {
  const [data, setData] = useState<Management | null>(null);
  const [fields, setFields] = useState<Record<string, string>>({});
  const [reason, setReason] = useState("");
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const pending = useRef<{ fingerprint: string; key: string } | null>(null);
  const lock = useRef(false);
  const refresh = useCallback(async () => {
    const response = await apiFetch(`/loads/${loadId}/management`);
    if (!response.ok) throw new Error("Unable to load management options. Retry to refresh this load.");
    const next = await response.json() as Management;
    setData(next); onToken(next.token);
    const values: Record<string, string> = {};
    for (const key of ["brokerContact", "equipment", "linehaul", "fuelSurcharge", "totalRate", "paymentTermsDays"] as const) values[key] = String(next.load[key] ?? "");
    for (const type of ["pickup", "delivery"]) {
      const stop = next.load.stops.find(s => s.type === type.toUpperCase());
      for (const key of ["facilityName", "address", "appointmentText", "referenceNumber"] as const) values[`${type}.${key}`] = stop?.[key] ?? "";
    }
    setFields(values);
  }, [loadId, onToken]);
  useEffect(() => { async function initialize() { try { await refresh(); } catch (e) { setError(e instanceof Error ? e.message : "Unable to load management options."); } } void initialize(); }, [refresh, revision]);
  async function command(action: "correct" | "unassign" | "cancel") {
    if (!data || lock.current) return;
    if (reason.trim().length < 3) { setError("Enter a reason of at least 3 characters."); return; }
    if (action !== "correct" && !window.confirm(action === "cancel" ? "Cancel this load? Its documents and assignment history will be retained. This cannot be undone here." : "Unassign this Driver? They will lose action access; acceptance history will be retained.")) return;
    const body: Record<string, unknown> = { expectedToken: data.token, reason: reason.trim() };
    if (action === "correct") {
      for (const key of ["brokerContact", "equipment", "linehaul", "fuelSurcharge", "totalRate", "paymentTermsDays"] as const) {
        if (fields[key] === String(data.load[key] ?? "")) continue;
        if (key === "paymentTermsDays") {
          const days = Number(fields[key]);
          if (!fields[key].trim() || !Number.isInteger(days) || days < 0 || days > 365) { setError("Payment terms must be a whole number from 0 to 365."); return; }
          body[key] = days;
        } else body[key] = fields[key];
      }
      for (const type of ["pickup", "delivery"]) {
        const stop = data.load.stops.find(s => s.type === type.toUpperCase());
        const changes: Record<string, string> = {};
        for (const key of ["facilityName", "address", "appointmentText", "referenceNumber"] as const) if (fields[`${type}.${key}`] !== (stop?.[key] ?? "")) changes[key] = fields[`${type}.${key}`];
        if (Object.keys(changes).length) body[type] = changes;
      }
    }
    const fingerprint = JSON.stringify({ action, body });
    if (pending.current?.fingerprint !== fingerprint) pending.current = { fingerprint, key: crypto.randomUUID() };
    body.idempotencyKey = pending.current.key;
    lock.current = true; setBusy(true); setError(null); setSuccess(null);
    try {
      const response = await apiFetch(`/loads/${loadId}/${action}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      if (!response.ok) { const failure = await response.json(); throw new Error(Array.isArray(failure.message) ? failure.message.join(" ") : failure.message ?? "Unable to update this load."); }
      pending.current = null; setEditing(false); setReason("");
      setSuccess(action === "correct" ? "Load corrected." : action === "unassign" ? "Driver unassigned." : "Load cancelled.");
      await refresh(); await onChanged();
    } catch (e) { setError(e instanceof Error ? e.message : "Unable to update this load. Retry the same action, or refresh after a conflict."); }
    finally { lock.current = false; setBusy(false); }
  }
  return <Panel title="Manage load">
    <Feedback error={error} success={success} />
    {(data || !error) && <p className="mb-4 text-sm text-slate-600" role={!data ? "status" : undefined}>{data?.eligibility.reason ?? "Loading management options…"}</p>}
    <button className={secondaryClass} disabled={busy} onClick={() => { setError(null); void refresh().catch(e => setError(e.message)); }}>Refresh management options</button>
    {data && <>
      <div className="my-4"><Field label="Change reason" value={reason} maxLength={1000} required disabled={busy} onChange={e => setReason(e.target.value)} /></div>
      <div className="flex flex-wrap gap-3">
        <button className={secondaryClass} disabled={busy || !data.eligibility.correct} onClick={() => setEditing(!editing)}>Correct load</button>
        <button className={secondaryClass} disabled={busy || !data.eligibility.unassign} onClick={() => void command("unassign")}>Unassign Driver</button>
        <button className={secondaryClass} disabled={busy || !data.eligibility.cancel} onClick={() => void command("cancel")}>Cancel load</button>
      </div>
      {editing && <form className="mt-5 grid gap-4 sm:grid-cols-2" onSubmit={e => { e.preventDefault(); void command("correct"); }}>
        {Object.entries(fields).map(([key, value]) => <Field key={key} label={key.includes(".") ? `${key.startsWith("pickup") ? "Pickup" : "Delivery"} ${labels[key.split(".")[1]]}` : labels[key]} value={value} maxLength={500} disabled={busy || !data.eligibility.correct} onChange={e => setFields(f => ({ ...f, [key]: e.target.value }))} />)}
        <p className="text-sm text-slate-600">Terms: 0–365 days; zero means due on invoice date. Existing invoice evidence cannot be corrected here.</p>
        <button className={buttonClass} disabled={busy || !data.eligibility.correct}>{busy ? "Saving…" : "Save corrections"}</button>
      </form>}
      <h3 className="mt-6 font-bold text-slate-900">Change history</h3>
      {!data.history.length && <p className="text-sm text-slate-600">No management changes recorded.</p>}
      <ul className="mt-3 space-y-3">{data.history.map(event => <li key={event.id} className="rounded-xl border border-slate-200 p-3 text-sm text-slate-700">
        <p>{event.type.replaceAll("_", " ")} · {event.actorName ?? "Recorded actor"} · {new Date(event.occurredAt).toLocaleString()}</p>
        <p>{event.metadata?.reason}</p>
        {event.metadata?.assignment?.acceptedAt && <p>Prior Driver acceptance retained: {new Date(event.metadata.assignment.acceptedAt).toLocaleString()}</p>}
        {!!event.metadata?.before && <details><summary>View before and after</summary><pre className="mt-2 overflow-auto whitespace-pre-wrap break-all text-xs">{JSON.stringify({ before: event.metadata.before, after: event.metadata.after }, null, 2)}</pre></details>}
      </li>)}</ul>
    </>}
  </Panel>;
}
