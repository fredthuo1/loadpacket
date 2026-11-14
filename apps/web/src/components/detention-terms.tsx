"use client";
import { useState } from "react";
import { apiFetch, apiError } from "@/lib/api/api-fetch";
export function DetentionTerms({
  loadId,
  onSaved,
}: {
  loadId: string;
  onSaved(): Promise<void>;
}) {
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <details className="rounded-xl border border-slate-200 bg-white p-4">
      <summary className="cursor-pointer font-bold">
        Review detention contract terms
      </summary>
      <p className="my-3 text-sm text-slate-600">
        Enter terms from the contract. This saves an immutable review version,
        not broker acceptance. Existing opportunities keep their original
        evidence; review their amount separately.
      </p>
      <form
        className="grid gap-3"
        onSubmit={async (event) => {
          event.preventDefault();
          if (busy) return;
          setBusy(true);
          setMessage("");
          const data = new FormData(event.currentTarget);
          const body: Record<string, string | number> = {
            freeMinutes: Number(data.get("freeMinutes")),
            basis: String(data.get("basis")),
          };
          for (const key of ["hourlyRate", "maximumAmount"])
            if (data.get(key)) body[key] = String(data.get(key));
          for (const key of [
            "minimumBillableMinutes",
            "roundingIncrementMinutes",
          ])
            if (data.get(key)) body[key] = Number(data.get(key));
          try {
            const response = await apiFetch(
              `/money-opportunities/loads/${loadId}/detention-terms`,
              {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(body),
              },
            );
            if (!response.ok) throw new Error(await apiError(response));
            setMessage(
              "Terms saved. Scan the load to evaluate new stop evidence.",
            );
            await onSaved();
          } catch (e) {
            setMessage(
              e instanceof Error ? e.message : "Could not save terms.",
            );
          } finally {
            setBusy(false);
          }
        }}
      >
        <label>
          Free minutes
          <input
            className="block w-full rounded border p-2"
            name="freeMinutes"
            type="number"
            min="0"
            max="10080"
            required
          />
        </label>
        <label>
          Hourly rate (optional)
          <input
            className="block w-full rounded border p-2"
            name="hourlyRate"
            inputMode="decimal"
            pattern="[0-9]+(\.[0-9]{1,2})?"
          />
        </label>
        <label>
          Minimum billable minutes (optional)
          <input
            className="block w-full rounded border p-2"
            name="minimumBillableMinutes"
            type="number"
            min="1"
            max="10080"
          />
        </label>
        <label>
          Round up to minutes (optional)
          <input
            className="block w-full rounded border p-2"
            name="roundingIncrementMinutes"
            type="number"
            min="1"
            max="1440"
          />
        </label>
        <label>
          Maximum amount (optional)
          <input
            className="block w-full rounded border p-2"
            name="maximumAmount"
            inputMode="decimal"
            pattern="[0-9]+(\.[0-9]{1,2})?"
          />
        </label>
        <label>
          Contract source / review basis
          <textarea
            className="block w-full rounded border p-2"
            name="basis"
            maxLength={1000}
            required
          />
        </label>
        <button
          disabled={busy}
          className="rounded bg-blue-700 px-4 py-3 font-bold text-white disabled:bg-slate-200 disabled:text-slate-600"
        >
          {busy ? "Saving…" : "Save Reviewed Terms"}
        </button>
        {message && <p role="status">{message}</p>}
      </form>
    </details>
  );
}
