"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { apiFetch, API_BASE_URL } from "@/lib/api/api-fetch";
import { buttonClass, secondaryClass, inputClass } from "./management-ui";

type Invoice = {
  id: string;
  invoiceNumber: string;
  originalInvoiceId: string | null;
  totalAmount: string;
  amountPaid: string;
  remainingBalance: string;
  currency: string;
  submittedAt: string | null;
  paymentDueAt: string;
};
type Preview = {
  expectedToken: string;
  baseRate: string;
  hasOriginal: boolean;
  outstanding: string;
  invoices: Invoice[];
  charges: {
    id: string;
    description: string;
    status: string;
    amount: string | null;
    currency: string;
  }[];
};

export function InvoiceCharges({
  loadId,
  onChanged,
  paymentTermsDays,
}: {
  loadId: string;
  onChanged?: () => void;
  paymentTermsDays?: string;
}) {
  const [data, setData] = useState<Preview | null>(null),
    [error, setError] = useState(""),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false);
  const [selected, setSelected] = useState<string[]>([]),
    [terms, setTerms] = useState("");
  const pending = useRef<{ fingerprint: string; key: string } | null>(null);
  const fetchPreview = useCallback(async () => {
    const response = await apiFetch(
      `${API_BASE_URL}/back-office/loads/${loadId}/invoices`,
      { cache: "no-store" },
    );
    if (!response.ok) throw new Error(await responseMessage(response));
    return (await response.json()) as Preview;
  }, [loadId]);
  useEffect(() => {
    let active = true;
    void fetchPreview().then(
      (value) => {
        if (active) setData(value);
      },
      (e: unknown) => {
        if (active)
          setError(e instanceof Error ? e.message : "Unable to load invoices.");
      },
    );
    return () => {
      active = false;
    };
  }, [fetchPreview]);
  async function action(run: () => Promise<void>) {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      await run();
      setData(await fetchPreview());
      onChanged?.();
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "Invoice action failed. Retry with the same details or refresh your review.",
      );
    } finally {
      setBusy(false);
    }
  }
  async function post(path: string, body: unknown) {
    const response = await apiFetch(`${API_BASE_URL}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!response.ok) throw new Error(await responseMessage(response));
  }
  function issue() {
    if (!data) return;
    const raw = paymentTermsDays ?? terms;
    if (raw !== "" && (!/^\d+$/.test(raw) || Number(raw) > 365)) {
      setError("Payment terms must be a whole number from 0 to 365.");
      return;
    }
    if (
      !window.confirm(
        `Issue this ${data.hasOriginal ? "supplemental" : "original"} invoice with ${selected.length} selected charges? Issued evidence cannot be edited.`,
      )
    )
      return;
    const body = {
      supplemental: data.hasOriginal,
      chargeIds: [...selected].sort(),
      expectedToken: data.expectedToken,
      ...(raw !== "" ? { paymentTermsDays: Number(raw) } : {}),
    };
    const fingerprint = JSON.stringify(body);
    const operation =
      pending.current?.fingerprint === fingerprint
        ? pending.current
        : { fingerprint, key: crypto.randomUUID() };
    pending.current = operation;
    void action(async () => {
      await post(`/back-office/loads/${loadId}/carrier-invoice`, {
        ...body,
        idempotencyKey: operation.key,
      });
      pending.current = null;
      setSelected([]);
      setMessage(
        "Invoice issued. Submit billing separately; submission does not send email.",
      );
    });
  }
  async function packet(invoice: Invoice) {
    const response = await apiFetch(
      `${API_BASE_URL}/back-office/loads/${loadId}/billing-packet?invoiceId=${invoice.id}`,
    );
    if (!response.ok) throw new Error(await responseMessage(response));
    const url = URL.createObjectURL(await response.blob());
    const a = document.createElement("a");
    a.href = url;
    a.download = `${invoice.invoiceNumber}-packet.pdf`;
    a.click();
    URL.revokeObjectURL(url);
  }
  return (
    <section
      className="my-5 rounded-2xl border border-slate-200 bg-white p-5"
      aria-label="Invoice charges"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-xl font-bold">Charges and invoices</h2>
        <button
          type="button"
          className={secondaryClass}
          disabled={busy}
          onClick={() =>
            void action(async () => {
              pending.current = null;
              setSelected([]);
            })
          }
        >
          Refresh review
        </button>
      </div>
      {error && (
        <p role="alert" className="my-3 text-red-700">
          {error}
        </p>
      )}
      {message && (
        <p role="status" className="my-3 text-emerald-700">
          {message}
        </p>
      )}
      {!data && !error && <p>Loading invoice evidence…</p>}
      {data && (
        <>
          <p className="my-3 text-sm text-slate-600">
            Original agreed rate: {data.baseRate}. Approved charges require
            explicit selection. Approval is not billing or payment.
          </p>
          <ul className="space-y-3">
            {data.charges.map((c) => (
              <li key={c.id} className="rounded-lg border p-3">
                <label className="flex items-start gap-3">
                  <input
                    type="checkbox"
                    disabled={busy || c.status !== "APPROVED"}
                    checked={selected.includes(c.id)}
                    onChange={(e) =>
                      setSelected(
                        e.target.checked
                          ? [...selected, c.id]
                          : selected.filter((id) => id !== c.id),
                      )
                    }
                  />
                  <span>
                    {c.description} · {c.amount ?? "Amount needs review"}{" "}
                    {c.currency}
                    <span className="block text-sm text-slate-600">
                      {c.status === "APPROVED"
                        ? "Approved — available to bill"
                        : c.status === "BILLED"
                          ? "Billed — permanent allocation"
                          : c.status}
                    </span>
                  </span>
                </label>
                {c.status === "DETECTED" && (
                  <button
                    className={`${secondaryClass} mt-2`}
                    disabled={busy || c.amount === null}
                    onClick={() => {
                      if (
                        window.confirm(
                          `Approve reviewed amount ${c.amount} ${c.currency}?`,
                        )
                      )
                        void action(async () => {
                          await post(
                            `/money-opportunities/${c.id}/approve`,
                            {},
                          );
                        });
                    }}
                  >
                    Approve reviewed charge
                  </button>
                )}
              </li>
            ))}
          </ul>
          {!data.charges.length && <p>No detected additional charges.</p>}
          {paymentTermsDays === undefined && (
            <label className="my-3 block max-w-xs text-sm">
              Payment terms (0–365 days; blank uses saved precedence)
              <input
                className={inputClass}
                value={terms}
                onChange={(e) => setTerms(e.target.value)}
                inputMode="numeric"
                disabled={busy}
              />
            </label>
          )}
          <button
            className={`${buttonClass} my-3`}
            disabled={busy || (data.hasOriginal && selected.length === 0)}
            onClick={issue}
          >
            {data.hasOriginal
              ? "Issue supplemental invoice"
              : "Issue itemized invoice"}
          </button>
          <p className="my-3 font-semibold">
            Submitted invoices outstanding: {data.outstanding}
          </p>
          <div className="space-y-4">
            {data.invoices.map((i) => (
              <article key={i.id} className="rounded-xl border p-4">
                <h3 className="font-bold">{i.invoiceNumber}</h3>
                <p className="text-sm">
                  {i.originalInvoiceId
                    ? `Supplement to ${data.invoices.find((o) => o.id === i.originalInvoiceId)?.invoiceNumber ?? i.originalInvoiceId}`
                    : "Original invoice"}
                </p>
                <p className="my-2">
                  Invoice: {i.totalAmount} · Received: {i.amountPaid} ·
                  Remaining: {i.remainingBalance} {i.currency}
                </p>
                <p className="text-sm">
                  {i.submittedAt
                    ? "Submitted for billing"
                    : "Issued; awaiting billing submission"}{" "}
                  · Due{" "}
                  {new Intl.DateTimeFormat("en-US", {
                    timeZone: "America/Chicago",
                    dateStyle: "medium",
                  }).format(new Date(i.paymentDueAt))}
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <button
                    className={secondaryClass}
                    disabled={busy}
                    onClick={() => void action(() => packet(i))}
                  >
                    Download invoice packet
                  </button>
                  {i.originalInvoiceId && !i.submittedAt && (
                    <button
                      className={buttonClass}
                      disabled={busy}
                      onClick={() => {
                        if (
                          window.confirm(
                            "Record supplemental billing submission? This does not send email.",
                          )
                        )
                          void action(async () => {
                            await post(
                              `/back-office/loads/${loadId}/invoices/${i.id}/submit`,
                              {},
                            );
                          });
                      }}
                    >
                      Submit supplemental billing
                    </button>
                  )}
                  {i.submittedAt && i.remainingBalance !== "0.00" && (
                    <a
                      className={secondaryClass}
                      href="/back-office/accounts-receivable"
                    >
                      Record invoice payment
                    </a>
                  )}
                </div>
              </article>
            ))}
          </div>
          {data.hasOriginal && !data.invoices.length && (
            <p className="text-sm text-amber-800">
              Legacy original: supplemental issuance will verify immutable
              evidence first. Incomplete evidence requires reconciliation.
            </p>
          )}
        </>
      )}
    </section>
  );
}
async function responseMessage(response: Response) {
  try {
    const body = (await response.json()) as { message?: string | string[] };
    return Array.isArray(body.message)
      ? body.message.join(" ")
      : (body.message ?? "Invoice request failed.");
  } catch {
    return "Invoice request failed. Refresh or retry.";
  }
}
