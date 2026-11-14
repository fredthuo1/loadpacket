"use client";
import { apiFetch, API_BASE_URL } from "@/lib/api/api-fetch";

import Link from "next/link";
import type { ReactNode } from "react";

import { useCallback, useEffect, useRef, useState } from "react";

import { AppHeader } from "../../../components/app-header";

const BUSINESS_TIME_ZONE = "America/Chicago";

type SummaryMetric = {
  amount: string;
  count: number;
};

type Invoice = {
  id: string;
  loadNumber: string;
  brokerName: string;
  status: string;
  totalRate: string;
  invoiceNumber: string | null;
  invoiceIssuedAt: string | null;
  billingSubmittedAt: string | null;
  paymentTermsDays: number | null;
  paymentDueAt: string | null;
  billingRecipientName: string | null;
  billingRecipientEmail: string | null;
  amountPaid: string | null;
  remainingBalance: string;
  invoiceId?:string|null;
  loadId?:string;
  originalInvoiceId?:string|null;
  paidAt: string | null;
  agingStatus: string;
  daysUntilDue: number | null;
};

type Dashboard = {
  generatedAt: string;

  summary: {
    outstanding: SummaryMetric;
    dueSoon: SummaryMetric;
    overdue: SummaryMetric;
    paid: SummaryMetric;
  };

  invoices: Invoice[];
};

type MarkPaidResponse = {
  recorded: boolean;
  message: string;

  load: {
    id: string;
    loadNumber: string;
    status: string;
    invoiceNumber: string | null;
    totalRate: string;
    amountPaid: string | null;
    paidAt: string | null;
    paymentDueAt: string | null;
  };
};

export default function AccountsReceivablePage() {
  const [paymentAmounts,setPaymentAmounts]=useState<Record<string,string>>({});
  const paymentKeys=useRef<Record<string,{amount:string;key:string}>>({});
  const [dashboard, setDashboard] = useState<Dashboard | null>(null);

  const [isLoading, setIsLoading] = useState(true);

  const [payingLoadId, setPayingLoadId] = useState<string | null>(null);

  const [error, setError] = useState<string | null>(null);

  const [message, setMessage] = useState<string | null>(null);

  const loadDashboard = useCallback(async () => {
    const response = await apiFetch(
      `${API_BASE_URL}/back-office/accounts-receivable`,
    );

    if (!response.ok) {
      throw new Error(
        `Unable to load accounts receivable (${response.status}).`,
      );
    }

    const result = (await response.json()) as Dashboard;

    setDashboard(result);
  }, []);

  useEffect(() => {
    async function initialize() {
      try {
        setIsLoading(true);
        setError(null);

        await loadDashboard();
      } catch (loadError) {
        setError(
          loadError instanceof Error
            ? loadError.message
            : "Unable to load accounts receivable.",
        );
      } finally {
        setIsLoading(false);
      }
    }

    void initialize();
  }, [loadDashboard]);

  async function markPaid(invoice: Invoice) {
    if (payingLoadId) return;
    const amount=paymentAmounts[invoice.id]??invoice.remainingBalance;
    const confirmed = window.confirm(
      `Record payment on invoice ${invoice.invoiceNumber ?? invoice.loadNumber} for ${formatMoney(
        amount,
      )}?`,
    );

    if (!confirmed) {
      return;
    }

    try {
      setPayingLoadId(invoice.id);

      setError(null);
      setMessage(null);
      const previous=paymentKeys.current[invoice.id];
      const operation=previous?.amount===amount?previous:{amount,key:crypto.randomUUID()};
      paymentKeys.current[invoice.id]=operation;

      const response = await apiFetch(
        `${API_BASE_URL}/back-office/accounts-receivable/loads/${invoice.loadId??invoice.id}/mark-paid`,
        {
          method: "POST",

          headers: {
            "Content-Type": "application/json",
          },

          body: JSON.stringify({invoiceId:invoice.invoiceId??undefined,
            amountPaid: amount,
            idempotencyKey: operation.key,
          }),
        },
      );

      if (!response.ok) {
        throw new Error(
          await responseError(response, "Unable to record payment."),
        );
      }

      const result = (await response.json()) as MarkPaidResponse;

      await loadDashboard();
      delete paymentKeys.current[invoice.id];
      setPaymentAmounts(current=>{const next={...current};delete next[invoice.id];return next;});

      setMessage(
        result.message,
      );
    } catch (paymentError) {
      setError(
        paymentError instanceof Error
          ? paymentError.message
          : "Unable to record payment.",
      );
    } finally {
      setPayingLoadId(null);
    }
  }

  return (
    <main className="min-h-screen bg-slate-50">
      <AppHeader />

      <div className="mx-auto max-w-6xl px-4 sm:px-6 py-8">
        <div>
          <p className="text-sm font-bold uppercase tracking-wide text-slate-600">
            Money Tracking
          </p>

          <h1 className="mt-2 text-3xl font-bold tracking-tight text-slate-950">
            Accounts Receivable
          </h1>

          <p className="mt-2 max-w-2xl text-slate-600">
            Track what brokers owe, what is coming due, and what has already
            been paid.
          </p>
        </div>

        {error && (
          <div className="mt-6 rounded-xl border border-red-200 bg-red-50 p-4">
            <p className="font-semibold text-red-700">{error}</p>
          </div>
        )}

        {message && (
          <div className="mt-6 rounded-xl border border-emerald-200 bg-emerald-50 p-4">
            <p className="font-semibold text-emerald-700">{message}</p>
          </div>
        )}

        {isLoading && (
          <div className="mt-8 rounded-2xl border border-slate-200 bg-white p-6">
            Loading accounts receivable...
          </div>
        )}

        {!isLoading && dashboard && (
          <>
            <div className="mt-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              <MetricCard
                title="Outstanding"
                metric={dashboard.summary.outstanding}
              />

              <MetricCard
                title="Due Soon"
                metric={dashboard.summary.dueSoon}
                tone="amber"
              />

              <MetricCard
                title="Overdue"
                metric={dashboard.summary.overdue}
                tone="red"
              />

              <MetricCard
                title="Paid"
                metric={dashboard.summary.paid}
                tone="green"
              />
            </div>

            <section className="mt-8 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
              <div className="border-b border-slate-200 px-6 py-5">
                <h2 className="text-xl font-bold text-slate-950">Invoices</h2>

                <p className="mt-1 text-sm text-slate-600">
                  Invoiced and paid loads appear here.
                </p>
              </div>

              {dashboard.invoices.length === 0 ? (
                <div className="p-10 text-center">
                  <p className="font-semibold text-slate-900">
                    No invoices yet
                  </p>

                  <p className="mt-2 text-sm text-slate-600">
                    Submit a Payment Ready load from Back Office to create your
                    first receivable.
                  </p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-slate-200">
                    <thead className="bg-slate-50">
                      <tr>
                        <TableHeader>Load</TableHeader>

                        <TableHeader>Broker</TableHeader>

                        <TableHeader>Invoice</TableHeader>

                        <TableHeader>Amount</TableHeader>

                        <TableHeader>Due</TableHeader>

                        <TableHeader>Aging</TableHeader>

                        <TableHeader>Status</TableHeader>

                        <TableHeader>Payment</TableHeader>
                      </tr>
                    </thead>

                    <tbody className="divide-y divide-slate-100">
                      {dashboard.invoices.map((invoice) => (
                        <tr key={invoice.id} className="hover:bg-slate-50">
                          <TableCell>
                            <Link
                              href={`/loads/${invoice.loadId??invoice.id}`}
                              className="font-bold text-blue-700 hover:underline"
                            >
                              {invoice.loadNumber}
                            </Link>
                          </TableCell>

                          <TableCell>{invoice.brokerName}</TableCell>

                          <TableCell>
                            <div>
                              <p className="font-medium text-slate-900">
                                {invoice.invoiceNumber ?? "-"}
                              </p>

                              {invoice.billingRecipientName && (
                                <p className="mt-1 text-xs text-slate-600">
                                  {invoice.billingRecipientName}
                                </p>
                              )}
                            </div>
                          </TableCell>

                          <TableCell>
                            <strong>{formatMoney(invoice.totalRate)}</strong>
                            <p className="mt-1 text-xs">Paid: {formatMoney(invoice.amountPaid??'0.00')}</p>
                            <p className="mt-1 text-xs font-semibold">Remaining: {formatMoney(invoice.remainingBalance)}</p>
                          </TableCell>

                          <TableCell>
                            {invoice.paymentDueAt
                              ? formatDate(invoice.paymentDueAt)
                              : "-"}
                          </TableCell>

                          <TableCell>
                            <AgingBadge
                              agingStatus={invoice.agingStatus}
                              daysUntilDue={invoice.daysUntilDue}
                            />
                          </TableCell>

                          <TableCell>
                            <StatusBadge status={invoice.status} />
                          </TableCell>

                          <TableCell>
                            {invoice.status === "INVOICED" ? (
                              <form onSubmit={event=>{event.preventDefault();void markPaid(invoice);}} className="flex flex-col gap-2">
                              <label className="text-xs">Payment amount for {invoice.loadNumber}<input aria-label={`Payment amount for ${invoice.loadNumber}`} className="mt-1 block w-36 rounded border border-slate-300 p-2" inputMode="decimal" required pattern="[0-9]{1,10}(\.[0-9]{1,2})?" disabled={payingLoadId!==null} value={paymentAmounts[invoice.id]??invoice.remainingBalance} onChange={event=>setPaymentAmounts({...paymentAmounts,[invoice.id]:event.target.value})}/></label>
                              <button
                                type="submit"
                                disabled={payingLoadId !== null}
                                className="rounded-lg bg-emerald-700 px-4 py-2 text-xs font-bold text-white hover:bg-emerald-800 disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-600"
                              >
                                {payingLoadId === invoice.id
                                  ? "Recording..."
                                  : "Record Payment"}
                              </button>
                              </form>
                            ) : (
                              <div>
                                <p className="font-semibold text-emerald-700">
                                  Paid
                                </p>

                                {invoice.amountPaid && (
                                  <p className="mt-1 text-xs text-slate-600">
                                    {formatMoney(invoice.amountPaid)}
                                  </p>
                                )}

                                {invoice.paidAt && (
                                  <p className="mt-1 text-xs text-slate-600">
                                    {formatDate(invoice.paidAt)}
                                  </p>
                                )}
                              </div>
                            )}
                          </TableCell>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          </>
        )}
      </div>
    </main>
  );
}

function MetricCard({
  title,
  metric,
  tone = "default",
}: {
  title: string;
  metric: SummaryMetric;

  tone?: "default" | "amber" | "red" | "green";
}) {
  const toneClasses = {
    default: "border-slate-200 bg-white",

    amber: "border-amber-200 bg-amber-50",

    red: "border-red-200 bg-red-50",

    green: "border-emerald-200 bg-emerald-50",
  };

  return (
    <div className={`rounded-2xl border p-5 shadow-sm ${toneClasses[tone]}`}>
      <p className="text-sm font-semibold text-slate-600">{title}</p>

      <p className="mt-3 text-3xl font-bold tracking-tight text-slate-950">
        {formatMoney(metric.amount)}
      </p>

      <p className="mt-2 text-sm text-slate-600">
        {metric.count} {metric.count === 1 ? "load" : "loads"}
      </p>
    </div>
  );
}

function AgingBadge({
  agingStatus,
  daysUntilDue,
}: {
  agingStatus: string;
  daysUntilDue: number | null;
}) {
  if (agingStatus === "PAID") {
    return (
      <span className="inline-flex whitespace-nowrap rounded-full bg-emerald-100 px-3 py-1 text-xs font-bold text-emerald-700">
        Paid
      </span>
    );
  }

  if (agingStatus === "OVERDUE") {
    return (
      <span className="inline-flex whitespace-nowrap rounded-full bg-red-100 px-3 py-1 text-xs font-bold text-red-700">
        {daysUntilDue !== null
          ? `${Math.abs(daysUntilDue)}d overdue`
          : "Overdue"}
      </span>
    );
  }

  if (agingStatus === "DUE_SOON") {
    return (
      <span className="inline-flex whitespace-nowrap rounded-full bg-amber-100 px-3 py-1 text-xs font-bold text-amber-700">
        {daysUntilDue !== null ? `Due in ${daysUntilDue}d` : "Due Soon"}
      </span>
    );
  }

  return (
    <span className="inline-flex whitespace-nowrap rounded-full bg-blue-50 px-3 py-1 text-xs font-bold text-blue-700">
      {daysUntilDue !== null ? `${daysUntilDue}d` : "Open"}
    </span>
  );
}

function StatusBadge({ status }: { status: string }) {
  if (status === "PAID") {
    return (
      <span className="inline-flex whitespace-nowrap rounded-full bg-emerald-100 px-3 py-1 text-xs font-bold text-emerald-700">
        Paid
      </span>
    );
  }

  return (
    <span className="inline-flex whitespace-nowrap rounded-full bg-blue-100 px-3 py-1 text-xs font-bold text-blue-700">
      {formatStatus(status)}
    </span>
  );
}

function TableHeader({ children }: { children: ReactNode }) {
  return (
    <th className="px-6 py-3 text-left text-xs font-bold uppercase tracking-wide text-slate-600">
      {children}
    </th>
  );
}

function TableCell({ children }: { children: ReactNode }) {
  return (
    <td className="whitespace-nowrap px-6 py-4 text-sm text-slate-700">
      {children}
    </td>
  );
}

function formatMoney(value: string) {
  const amount = Number(value);

  if (Number.isNaN(amount)) {
    return value;
  }

  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(amount);
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: BUSINESS_TIME_ZONE,

    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(value));
}

function formatStatus(status: string) {
  return status
    .replaceAll("_", " ")
    .toLowerCase()
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

async function responseError(response: Response, fallback: string) {
  try {
    const body = (await response.json()) as {
      message?: string | string[];
    };

    if (Array.isArray(body.message)) {
      return body.message.join(", ");
    }

    return body.message ?? fallback;
  } catch {
    return fallback;
  }
}
