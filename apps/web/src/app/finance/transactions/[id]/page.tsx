"use client";
import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import {
  ManagementPage,
  buttonClass,
  inputClass,
  secondaryClass,
} from "@/components/management-ui";
import {
  financeRequest,
  moneyText,
  type FinanceTransaction,
} from "@/lib/api/finance";
type Detail = {
  record: FinanceTransaction;
  batch: { fileName: string; fileChecksum: string } | null;
  entry: {
    memo: string | null;
    vendorName: string | null;
    correctionOfId: string | null;
    createdAt: string;
    createdBy: { firstName: string; lastName: string };
  } | null;
  audit: { id: string; action: string; summary: string; createdAt: string }[];
};
export default function TransactionPage() {
  const { id } = useParams<{ id: string }>(),
    router = useRouter();
  const [data, setData] = useState<Detail | null>(null),
    [error, setError] = useState(""),
    [correct, setCorrect] = useState(false),
    [busy, setBusy] = useState(false),
    [key] = useState(() => crypto.randomUUID());
  useEffect(() => {
    let alive = true;
    financeRequest<Detail>("/transactions/" + encodeURIComponent(id))
      .then((d) => {
        if (alive) {
          setData(d);
          setError("");
        }
      })
      .catch((e) => {
        if (alive)
          setError(e instanceof Error ? e.message : "Record unavailable.");
      });
    return () => {
      alive = false;
    };
  }, [id]);
  const r = data?.record;
  return (
    <ManagementPage
      title="Financial Record"
      description="Original financial evidence and its source."
      actions={
        <Link className={secondaryClass} href="/finance?section=transactions">
          Transaction Ledger
        </Link>
      }
    >
      {error && (
        <p role="alert" className="mb-4 rounded bg-red-50 p-4 text-red-800">
          {error}
        </p>
      )}
      {!r && !error && <p>Loading record…</p>}
      {r && (
        <>
          <section className="rounded-xl border bg-white p-6">
            <h2 className="text-xl font-bold">{r.description}</h2>
            <p className="my-4 text-3xl font-bold">{moneyText(r.amount)}</p>
            <dl className="grid gap-3 md:grid-cols-2">
              {[
                ["Date", r.date],
                ["Type", r.type],
                ["Category", r.category],
                ["Effect", r.effect],
                ["Source", r.source],
                ["Status", r.status],
                ["Broker", r.brokerName],
                ["Driver", r.driverName],
                ["Vendor", data?.entry?.vendorName],
                ["Notes / correction reason", data?.entry?.memo],
                [
                  "Recorded by",
                  data?.entry
                    ? `${data.entry.createdBy.firstName} ${data.entry.createdBy.lastName}`
                    : null,
                ],
              ].map(([k, v]) => (
                <div key={k}>
                  <dt className="text-sm text-slate-600">{k}</dt>
                  <dd className="whitespace-pre-wrap break-words">
                    {v ?? "Not recorded"}
                  </dd>
                </div>
              ))}
            </dl>
            {r.loadId && (
              <Link
                className="mt-5 block text-blue-700 underline"
                href={`/finance/loads/${r.loadId}`}
              >
                Load {r.loadNumber} financials
              </Link>
            )}
            {r.historicalLoadId && (
              <p className="mt-4">Historical load {r.loadNumber}</p>
            )}
            {r.id.startsWith("settlement:") && (
              <Link
                className="mt-4 block text-blue-700 underline"
                href={`/finance/settlements?id=${encodeURIComponent(r.id.slice("settlement:".length))}`}
              >
                Open settlement, private statement and payment history
              </Link>
            )}
            {r.documentId && !r.id.startsWith("settlement:") && (
              <Link
                className="mt-4 block text-blue-700 underline"
                href={`/documents?documentId=${r.documentId}`}
              >
                Supporting document in Vault
              </Link>
            )}
            {data?.entry?.correctionOfId && (
              <Link
                className="mt-4 block text-blue-700 underline"
                href={`/finance/transactions/${data.entry.correctionOfId}`}
              >
                Original corrected entry
              </Link>
            )}
            {r.importBatchId && (
              <div className="mt-5 rounded bg-slate-50 p-4">
                <h3 className="font-semibold">Spreadsheet provenance</h3>
                <p>
                  {data?.batch?.fileName} · Row {r.importRowNumber} · Column{" "}
                  {r.sourceColumn}
                </p>
                <Link
                  className="text-blue-700 underline"
                  href={`/finance/imports?batch=${r.importBatchId}`}
                >
                  View import and original evidence
                </Link>
              </div>
            )}
          </section>
          {!r.id.includes(":") &&
            r.status === "POSTED" &&
            r.type !== "ADJUSTMENT" && (
              <button
                className={secondaryClass + " mt-5"}
                onClick={() => setCorrect((v) => !v)}
              >
                Record Correction
              </button>
            )}
          {correct && (
            <form
              className="mt-5 rounded-xl border bg-white p-5"
              onSubmit={async (e) => {
                e.preventDefault();
                if (busy) return;
                setBusy(true);
                setError("");
                const form = new FormData(e.currentTarget);
                try {
                  const result = await financeRequest<{ id: string }>(
                    "/transactions",
                    {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({
                        type: "ADJUSTMENT",
                        effect: r.effect,
                        category: r.category,
                        correctionOfId: r.id,
                        loadId: r.loadId ?? undefined,
                        driverId: r.driverId ?? undefined,
                        amount: form.get("amount"),
                        transactionDate: form.get("date"),
                        description: `Correction: ${r.description}`.slice(
                          0,
                          500,
                        ),
                        memo: form.get("reason"),
                        idempotencyKey: key,
                      }),
                    },
                  );
                  router.push("/finance/transactions/" + result.id);
                  setCorrect(false);
                } catch (e) {
                  setError(
                    e instanceof Error ? e.message : "Correction failed.",
                  );
                } finally {
                  setBusy(false);
                }
              }}
            >
              <h2 className="font-bold">Append a correction</h2>
              <p className="my-3">
                Enter the difference, not a replacement total. A negative amount
                reduces this record&apos;s {r.effect.toLowerCase()} total. The
                original remains unchanged.
              </p>
              <label>
                Date
                <input
                  className={inputClass}
                  type="date"
                  name="date"
                  defaultValue={new Date().toISOString().slice(0, 10)}
                  required
                />
              </label>
              <label>
                Adjustment amount (USD)
                <input
                  className={inputClass}
                  name="amount"
                  inputMode="decimal"
                  pattern="-?[0-9]{1,10}(\.[0-9]{1,2})?"
                  required
                />
              </label>
              <label>
                Reason
                <input
                  className={inputClass}
                  name="reason"
                  required
                  minLength={5}
                  maxLength={1000}
                />
              </label>
              <button className={buttonClass + " mt-4"} disabled={busy}>
                Save Correction
              </button>
            </form>
          )}
          <section className="mt-6">
            <h2 className="font-bold">Audit history</h2>
            {data?.audit.map((a) => (
              <p className="mt-3" key={a.id}>
                {a.summary} · {new Date(a.createdAt).toLocaleString()}
              </p>
            ))}
            {!data?.audit.length && (
              <p className="mt-3">
                Operational records retain their audit history on the linked
                load.
              </p>
            )}
          </section>
        </>
      )}
    </ManagementPage>
  );
}
