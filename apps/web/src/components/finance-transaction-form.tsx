"use client";
import { useEffect, useState } from "react";
import { financeRequest } from "@/lib/api/finance";
import { buttonClass, inputClass, secondaryClass } from "./management-ui";
type Lookups = {
  loads: { id: string; loadNumber: string }[];
  drivers: { id: string; firstName: string; lastName: string }[];
  documents: {
    id: string;
    type: string;
    versions: { originalFileName: string }[];
  }[];
};
export function FinanceTransactionForm({
  onSaved,
  onCancel,
}: {
  onSaved: () => void;
  onCancel: () => void;
}) {
  const [type, setType] = useState("EXPENSE");
  const [loadId, setLoadId] = useState("");
  const invoicePayment = type === "PAYMENT" && !!loadId;
  const [lookup, setLookup] = useState<Lookups | null>(null);
  const [categories, setCategories] = useState<{
    income: string[];
    expense: string[];
  }>({ income: [], expense: [] });
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [key] = useState(() => crypto.randomUUID());
  useEffect(() => {
    let alive = true;
    Promise.all([
      financeRequest<Lookups>("/lookups"),
      financeRequest<{ income: string[]; expense: string[] }>("/categories"),
    ])
      .then(([l, c]) => {
        if (alive) {
          setLookup(l);
          setCategories(c);
        }
      })
      .catch(() => {
        if (alive)
          setError(
            "Could not load available records. Close this form and try again.",
          );
      });
    return () => {
      alive = false;
    };
  }, []);
  return (
    <form
      aria-label="Add financial transaction"
      className="my-6 rounded-2xl border bg-white p-6"
      onSubmit={async (e) => {
        e.preventDefault();
        if (busy) return;
        setBusy(true);
        setError("");
        const form = new FormData(e.currentTarget);
        const body: Record<string, string> = { type, idempotencyKey: key };
        for (const [k, v] of form)
          if (typeof v === "string" && v.trim()) body[k] = v.trim();
        try {
          await financeRequest("/transactions", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
          });
          onSaved();
        } catch (err) {
          setError(
            err instanceof Error
              ? err.message
              : "Could not save this transaction.",
          );
        } finally {
          setBusy(false);
        }
      }}
    >
      <h2 className="text-xl font-bold">Add Transaction</h2>
      <p className="mt-2 text-sm text-slate-600">
        Record income, costs or money already received. Income linked to a load
        is additional to its invoice revenue.
      </p>
      <div className="mt-4 grid gap-4 md:grid-cols-2">
        <label>
          Type
          <select
            className={inputClass}
            value={type}
            onChange={(e) => setType(e.target.value)}
          >
            {["INCOME", "EXPENSE", "PAYMENT", "DRIVER_PAY"].map((t) => (
              <option key={t}>{t}</option>
            ))}
          </select>
        </label>
        <label>
          Date
          <input
            className={inputClass}
            name="transactionDate"
            type="date"
            defaultValue={new Date().toISOString().slice(0, 10)}
            required
          />
        </label>
        <label>
          Amount (USD)
          <input
            className={inputClass}
            name="amount"
            inputMode="decimal"
            pattern="[0-9]{1,10}(\.[0-9]{1,2})?"
            required
          />
        </label>
        <label>
          Category
          <input
            className={inputClass}
            key={type + loadId}
            readOnly={invoicePayment}
            name="category"
            list="finance-categories"
            maxLength={100}
            required
            defaultValue={
              type === "INCOME"
                ? "Other Revenue"
                : type === "PAYMENT"
                  ? "Customer Payment"
                  : type === "DRIVER_PAY"
                    ? "Driver Pay"
                    : "Fuel"
            }
          />
          <datalist id="finance-categories">
            {(type === "INCOME" ? categories.income : categories.expense).map(
              (c) => (
                <option key={c} value={c} />
              ),
            )}
          </datalist>
        </label>
        <label>
          Description
          <input
            className={inputClass}
            key={String(invoicePayment)}
            readOnly={invoicePayment}
            defaultValue={invoicePayment ? "Invoice payment" : undefined}
            name="description"
            maxLength={500}
            required
          />
        </label>
        <label>
          {type === "INCOME" ? "Broker / Customer" : "Vendor"}
          <input
            className={inputClass}
            disabled={invoicePayment}
            name={type === "INCOME" ? "brokerName" : "vendorName"}
            maxLength={200}
          />
        </label>
        <label>
          Load (optional)
          <select
            className={inputClass}
            name="loadId"
            value={loadId}
            onChange={(e) => setLoadId(e.target.value)}
          >
            <option value="">No load</option>
            {lookup?.loads.map((l) => (
              <option key={l.id} value={l.id}>
                {l.loadNumber}
              </option>
            ))}
          </select>
        </label>
        <label>
          Driver {type === "DRIVER_PAY" ? "(required)" : "(optional)"}
          <select
            className={inputClass}
            disabled={invoicePayment}
            name="driverId"
            required={type === "DRIVER_PAY"}
          >
            <option value="">Select driver</option>
            {lookup?.drivers.map((d) => (
              <option key={d.id} value={d.id}>
                {d.firstName} {d.lastName}
              </option>
            ))}
          </select>
        </label>
        <label>
          Supporting document (optional)
          <select
            className={inputClass}
            disabled={invoicePayment}
            name="documentId"
          >
            <option value="">No document</option>
            {lookup?.documents.map((d) => (
              <option key={d.id} value={d.id}>
                {d.versions[0]?.originalFileName ?? d.type}
              </option>
            ))}
          </select>
        </label>
        <label>
          Notes
          <input
            className={inputClass}
            disabled={invoicePayment}
            name="memo"
            maxLength={1000}
          />
        </label>
      </div>
      {type === "PAYMENT" && (
        <p className="mt-3 text-sm text-slate-600">
          A load-linked payment uses Accounts Receivable and updates its
          balance. Its description and category are generated from the invoice.
          Without a load, this records a receipt only; it does not settle an
          invoice.
        </p>
      )}
      {error && (
        <p role="alert" className="my-3 text-red-700">
          {error}
        </p>
      )}
      <div className="mt-5 flex gap-3">
        <button disabled={busy || !lookup} className={buttonClass}>
          {busy ? "Saving…" : "Save Transaction"}
        </button>
        <button
          type="button"
          disabled={busy}
          className={secondaryClass}
          onClick={onCancel}
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
