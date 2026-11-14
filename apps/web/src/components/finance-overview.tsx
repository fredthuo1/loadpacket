"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  financeRequest,
  moneyText,
  type FinanceOverview,
  type FinanceTransaction,
} from "@/lib/api/finance";
import { FinanceTrend } from "./finance-trend";
import { LedgerTable } from "./finance-ledger";

export function FinanceOverviewPanel({
  overview,
  from,
  to,
}: {
  overview: FinanceOverview;
  from: string;
  to: string;
}) {
  const ledgerHref = `/finance?${new URLSearchParams({ section: "transactions", from, to })}`;
  const attention = overview.aging.filter(
    (bucket) => bucket.bucket !== "Current" && bucket.count > 0,
  );
  return (
    <>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2 text-sm">
        <h2 className="font-semibold">
          Recorded performance{" "}
          <span className="font-normal text-slate-600">· USD</span>
        </h2>
        <p className="text-xs text-slate-600">
          {from} – {to}
        </p>
      </div>
      <div
        className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4"
        aria-label="Primary financial metrics"
      >
        {[
          {
            title: "Recorded Revenue",
            value: overview.revenue,
            detail: "Selected period · View records",
            href: ledgerHref,
          },
          {
            title: "Recorded Expenses",
            value: overview.expenses,
            detail: "Selected period · View records",
            href: ledgerHref,
          },
          {
            title: "Net Operating Result",
            value: overview.net,
            detail: "Based on recorded costs",
            href: ledgerHref,
            emphasis: true,
          },
          {
            title: "Current Outstanding A/R",
            value: overview.outstanding,
            detail: "Current balance · All dates",
            href: "/back-office/accounts-receivable",
          },
        ].map((metric) => (
          <Link
            key={metric.title}
            href={metric.href}
            className={`min-w-0 rounded-xl border border-slate-200 p-3 transition-colors hover:border-blue-400 sm:p-5 ${metric.emphasis ? "bg-blue-50" : "bg-white hover:bg-slate-50"}`}
          >
            <h2 className="text-xs font-medium text-slate-600">
              {metric.title}
            </h2>
            <p className="my-2 break-words text-xl font-bold tracking-tight text-slate-950 tabular-nums sm:text-2xl">
              {moneyText(metric.value)}
            </p>
            <p className="text-xs text-slate-600">
              {metric.detail} <span aria-hidden="true">→</span>
            </p>
          </Link>
        ))}
      </div>
      <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1.7fr)_minmax(0,1fr)]">
        <FinanceTrend rows={overview.trend} />
        <section
          className="min-w-0 rounded-xl border border-slate-200 bg-white p-5"
          aria-labelledby="finance-attention-heading"
        >
          <h2
            id="finance-attention-heading"
            className="font-bold text-slate-950"
          >
            Needs attention
          </h2>
          <p className="mt-1 text-xs text-slate-600">
            Current receivables · All dates
          </p>
          {attention.map((bucket) => (
            <div key={bucket.bucket} className="border-b border-slate-200 py-4">
              <p className="mb-2 text-xs font-medium text-amber-800">
                {bucket.bucket === "Due date missing"
                  ? "Missing due date"
                  : `${bucket.bucket} days overdue`}
              </p>
              <p className="flex flex-wrap justify-between gap-2 text-sm">
                <strong className="tabular-nums">
                  {moneyText(bucket.amount)}
                </strong>
                <span className="text-slate-600">
                  {bucket.count} {bucket.count === 1 ? "invoice" : "invoices"}
                </span>
              </p>
            </div>
          ))}
          {!attention.length && (
            <p className="py-5 text-sm text-slate-600">
              No overdue invoices or missing due dates in recorded receivables.
            </p>
          )}
          <Link
            href="/back-office/accounts-receivable"
            className="mt-4 inline-block text-sm font-semibold text-blue-700 underline underline-offset-4"
          >
            Open Accounts Receivable →
          </Link>
          <details className="mt-4 border-t border-slate-200 pt-3 text-xs text-slate-600">
            <summary className="cursor-pointer">View all aging buckets</summary>
            <dl className="mt-3 space-y-3">
              {overview.aging.map((b) => (
                <div
                  key={b.bucket}
                  className="flex flex-wrap justify-between gap-2"
                >
                  <dt>
                    {b.bucket} · {b.count}
                  </dt>
                  <dd className="tabular-nums">{moneyText(b.amount)}</dd>
                </div>
              ))}
            </dl>
          </details>
        </section>
      </div>
      <RecentActivity
        key={`${from}:${to}`}
        from={from}
        to={to}
        href={ledgerHref}
      />
      <div className="mt-5 grid items-start gap-5 md:grid-cols-2">
        <section className="min-w-0 rounded-xl border border-slate-200 bg-white p-5">
          <h2 className="font-bold text-slate-950">
            Revenue and expenses by category
          </h2>
          <p className="mt-1 text-xs text-slate-600">Selected period · USD</p>
          <dl className="mt-3 divide-y divide-slate-200">
            {overview.categories
              .filter((c) => c.effect !== "PAYMENT")
              .map((c) => (
                <div
                  key={c.effect + c.category}
                  className="flex flex-wrap items-center justify-between gap-2 py-3 text-sm"
                >
                  <dt>
                    {c.category}
                    <span className="ml-2 text-xs text-slate-600">
                      {c.effect === "INCOME" ? "Income" : "Expense"}
                    </span>
                  </dt>
                  <dd className="font-semibold tabular-nums">
                    {moneyText(c.amount)}
                  </dd>
                </div>
              ))}
          </dl>
          {!overview.categories.some((c) => c.effect !== "PAYMENT") && (
            <p className="mt-4 text-sm text-slate-600">
              No recorded income or expenses in this period.
            </p>
          )}
        </section>
        <section className="min-w-0 rounded-xl border border-slate-200 bg-white p-5">
          <h2 className="font-bold text-slate-950">Additional insights</h2>
          <p className="mt-1 text-xs text-slate-600">
            {overview.transactionCount} financial records ·{" "}
            {overview.recordedLoads} loads with recorded revenue
          </p>
          <dl className="mt-4 space-y-4 text-sm">
            <div className="flex flex-wrap justify-between gap-2">
              <dt>Recorded receipts</dt>
              <dd className="font-semibold tabular-nums">
                {moneyText(overview.collected)}
              </dd>
            </div>
            <div className="flex flex-wrap justify-between gap-2">
              <dt>Average revenue / linked load</dt>
              <dd className="font-semibold tabular-nums">
                {moneyText(overview.averageRevenuePerLoad)}
              </dd>
            </div>
          </dl>
          <details className="mt-4 border-t border-slate-200 pt-3 text-xs text-slate-600">
            <summary className="cursor-pointer">Per-mile metrics</summary>
            <p className="mt-3">Revenue / Mile: Insufficient recorded data</p>
            <p className="mt-2">Cost / Mile: Insufficient recorded data</p>
          </details>
        </section>
      </div>
      <details className="mt-5 text-sm text-slate-600">
        <summary className="cursor-pointer">
          How these numbers are calculated
        </summary>
        <p className="mt-3">
          USD · Revenue includes issued load invoices, manual income and
          confirmed historical deliveries. Payments are receipts, not additional
          revenue. A/R is current outstanding across all dates. Unbilled loads
          and unapproved charges are excluded. Net uses recorded costs; missing
          costs are not estimated.
        </p>
      </details>
    </>
  );
}

function RecentActivity({
  from,
  to,
  href,
}: {
  from: string;
  to: string;
  href: string;
}) {
  const [rows, setRows] = useState<FinanceTransaction[] | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    financeRequest<{ items: FinanceTransaction[] }>(
      `/transactions?${new URLSearchParams({ from, to, pageSize: "5", sort: "date", direction: "desc" })}`,
      { signal: controller.signal },
    )
      .then((result) => {
        if (!controller.signal.aborted) setRows(result.items);
      })
      .catch(() => {
        if (!controller.signal.aborted) setFailed(true);
      });
    return () => controller.abort();
  }, [from, to]);
  return (
    <section className="mt-5 min-w-0" aria-labelledby="finance-recent-heading">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 id="finance-recent-heading" className="font-bold text-slate-950">
            Recent financial activity
          </h2>
          <p className="mt-1 text-xs text-slate-600">
            Latest records in the selected period
          </p>
        </div>
        <Link
          href={href}
          className="text-sm font-semibold text-blue-700 underline underline-offset-4"
        >
          View transactions →
        </Link>
      </div>
      {failed ? (
        <p
          role="status"
          className="rounded-xl border border-slate-200 bg-white p-5 text-sm text-slate-600"
        >
          Recent activity is unavailable. Open Transactions to retry.
        </p>
      ) : rows ? (
        <LedgerTable rows={rows} compact />
      ) : (
        <p
          role="status"
          className="rounded-xl border border-slate-200 bg-white p-5 text-sm text-slate-600"
        >
          Loading recent activity…
        </p>
      )}
    </section>
  );
}
