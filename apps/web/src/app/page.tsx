"use client";
import { apiFetch, API_BASE_URL } from "@/lib/api/api-fetch";
import { useCurrentUser } from '@/components/auth-provider';
import { OperationsSummary, OperationsDetails, RecentActivity, type OperationsSummaryData } from '@/components/operations-summary';

import Link from "next/link";

import { AppHeader } from "../components/app-header";
import { OwnerExceptionInbox } from "../components/owner-exception-inbox";

import { useCallback, useEffect, useState } from "react";

type MoneyMetric = {
  amount: string;
  count: number;
};

type RecentLoad = {
  id: string;
  loadNumber: string;
  brokerName: string;
  status: string;
  totalRate: string;

  pickup: {
    facilityName: string | null;
    address: string;
  } | null;

  delivery: {
    facilityName: string | null;
    address: string;
  } | null;

  driver: {
    id: string;
    name: string;
    assignmentStatus: string;
  } | null;

  paperwork: {
    requiredCount: number;
    blockingCount: number;
    clear: boolean;
  };

  invoiceNumber: string | null;

  paymentDueAt: string | null;

  paidAt: string | null;
};

type OwnerDashboard = {
  operations?: OperationsSummaryData;
  generatedAt: string;

  metrics: {
    totalLoads: number;
    totalLoadValue: string;
    activeLoads: number;
    paymentReadyLoads: number;

    outstandingReceivables: MoneyMetric;

    paidRevenue: MoneyMetric;

    activeDrivers: number;
  };

  recentLoads: RecentLoad[];
};

export default function HomePage() {
  const owner=useCurrentUser()?.role==='OWNER';
  const [dashboard, setDashboard] = useState<OwnerDashboard | null>(null);

  const [isLoading, setIsLoading] = useState(true);

  const [error, setError] = useState<string | null>(null);
  const [loadFilter, setLoadFilter] = useState('ALL');

  const loadDashboard = useCallback(() => apiFetch(`${API_BASE_URL}/owner/dashboard`)
    .then(async response => {
      if (!response.ok) throw new Error(`Unable to load owner dashboard (${response.status}).`);
      setDashboard(await response.json() as OwnerDashboard);
    })
    .catch(loadError => setError(loadError instanceof Error ? loadError.message : 'Unable to load dashboard.'))
    .finally(() => setIsLoading(false)), []);

  useEffect(() => {
    void loadDashboard();
  }, [loadDashboard]);

  useEffect(() => {
    // The fragment target is rendered only after the dashboard request finishes.
    if (!isLoading && dashboard && window.location.hash === "#loads") {
      document.getElementById("loads")?.scrollIntoView({ block: "start" });
    }
  }, [isLoading, dashboard]);

  const visibleLoads = dashboard?.recentLoads.filter(load => loadFilter === 'ALL' || load.status === loadFilter) ?? [];

  return (
    <main className="min-h-screen bg-slate-50">
      <AppHeader />

      <div className="mx-auto max-w-6xl px-4 sm:px-6 py-8">
        <section>
          <p className="text-sm font-bold uppercase tracking-wide text-slate-600">
            Business Overview
          </p>

          <h1 className="mt-2 text-3xl font-bold tracking-tight text-slate-950">
            Dashboard
          </h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">Know what is moving, what is ready to bill, and what is still owed.</p>
        </section>

        {error && (
          <div role="alert" className="mt-6 rounded-xl border border-red-200 bg-red-50 p-4">
            <p className="font-semibold text-red-700">{error}</p>
            <button type="button" onClick={() => { setIsLoading(true); setError(null); void loadDashboard(); }} className="mt-3 min-h-11 rounded-lg bg-red-700 px-4 text-sm font-bold text-white">Retry dashboard</button>
          </div>
        )}

        {isLoading && (
          <div className="mt-8 rounded-2xl border border-slate-200 bg-white p-8">
            Loading command center...
          </div>
        )}

        {!isLoading && !error && dashboard && (
          <>
            {owner&&<section className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <MetricCard
                title="Load Value"
                value={formatMoney(dashboard.metrics.totalLoadValue)}
                detail={`${dashboard.metrics.totalLoads} total loads`}
              />

              <MetricCard
                title="Outstanding A/R"
                value={formatMoney(
                  dashboard.metrics.outstandingReceivables.amount,
                )}
                detail={`${dashboard.metrics.outstandingReceivables.count} open invoices`}
                tone="amber"
              />

              <MetricCard
                title="Paid Revenue"
                value={formatMoney(dashboard.metrics.paidRevenue.amount)}
                detail={`${dashboard.metrics.paidRevenue.count} paid loads`}
                tone="green"
              />

              <MetricCard
                title="Payment Ready"
                value={dashboard.metrics.paymentReadyLoads.toString()}
                detail="Loads ready to bill"
                tone="blue"
              />
            </section>}

            <section className="mt-4 grid gap-4 sm:grid-cols-2">
              <SmallMetric
                label="Active Loads"
                value={dashboard.metrics.activeLoads}
                detail="Booked or in transit"
              />

              <SmallMetric
                label="Active Drivers"
                value={dashboard.metrics.activeDrivers}
                detail="Available carrier drivers"
              />
            </section>

            {dashboard.operations ? <OperationsSummary data={dashboard.operations} owner={owner}/> : <p role="status" className="mt-5 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950">Operations summary unavailable. Review loads, documents and drivers for outstanding items.</p>}
            {owner && <details className="mt-4 rounded-xl border border-slate-200 bg-white p-4"><summary className="min-h-11 cursor-pointer content-center font-semibold text-slate-950">Active-load exceptions — details</summary><OwnerExceptionInbox /></details>}

            <section
              id="loads"
              className="mt-8 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm"
            >
              <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-200 px-6 py-5">
                <div>
                  <h2 className="text-xl font-bold text-slate-950">
                    Recent Loads
                  </h2>

                  <p className="mt-1 text-sm text-slate-600">
                    {dashboard.recentLoads.length} recent loads · Open a load to view its route, documents and billing.
                  </p>
                </div>

                <Link
                  href="/loads/new"
                  className="text-sm font-bold text-blue-700 hover:underline"
                >
                  Create load
                </Link>
              </div>

              <div role="group" aria-label="Filter recent loads" className="flex flex-wrap gap-2 px-6 py-4">
                {['ALL', ...new Set(dashboard.recentLoads.map(load => load.status))].map(status => <button key={status} type="button" aria-pressed={loadFilter === status} onClick={() => setLoadFilter(status)} className={`min-h-11 rounded-lg border px-4 py-2 text-sm font-semibold ${loadFilter === status ? 'border-blue-200 bg-blue-50 text-blue-800' : 'border-slate-200 bg-white text-slate-700'}`}>{status === 'ALL' ? 'All' : formatStatus(status)} · {status === 'ALL' ? dashboard.recentLoads.length : dashboard.recentLoads.filter(load => load.status === status).length}</button>)}
              </div>

              {dashboard.recentLoads.length === 0 ? (
                <div className="p-10 text-center">
                  <p className="font-semibold text-slate-900">No loads yet</p>

                  <Link
                    href="/loads/new"
                    className="mt-3 inline-block text-sm font-bold text-blue-700 hover:underline"
                  >
                    Create your first load
                  </Link>
                </div>
              ) : visibleLoads.length === 0 ? <p role="status" className="p-6 text-slate-600">No recent loads match this filter. Choose All to reset.</p> : (
                <>
                <div className="divide-y divide-slate-200 lg:hidden">
                  {visibleLoads.map(load => <article key={load.id} className="space-y-3 break-words p-5">
                    <div className="flex flex-wrap items-center justify-between gap-2"><Link href={`/loads/${load.id}`} className="inline-flex min-h-11 items-center font-bold text-blue-700">{load.loadNumber}</Link><strong>{formatMoney(load.totalRate)}</strong></div>
                    <p className="text-sm text-slate-600">{load.brokerName}</p><p className="text-sm text-slate-700">{routeLabel(load)}</p>
                    <div className="flex flex-wrap gap-2"><StatusBadge status={load.status}/><PaperworkBadge load={load}/></div>
                    <p className="text-sm text-slate-600">Driver: {load.driver ? `${load.driver.name} · ${formatStatus(load.driver.assignmentStatus)}` : 'Unassigned'}</p>
                  </article>)}
                </div>
                <div className="hidden overflow-x-auto lg:block">
                  <table className="min-w-full divide-y divide-slate-200">
                    <thead className="bg-slate-50">
                      <tr>
                        <Header>Load</Header>

                        <Header>Broker</Header>

                        <Header>Route</Header>

                        <Header>Rate</Header>

                        <Header>Status</Header>

                        <Header>Driver</Header>

                        <Header>Paperwork</Header>
                      </tr>
                    </thead>

                    <tbody className="divide-y divide-slate-100">
                      {visibleLoads.map((load) => (
                        <tr key={load.id} className="hover:bg-slate-50">
                          <Cell>
                            <Link
                              href={`/loads/${load.id}`}
                              className="font-bold text-blue-700 hover:underline"
                            >
                              {load.loadNumber}
                            </Link>
                          </Cell>

                          <Cell>{load.brokerName}</Cell>

                          <Cell>{routeLabel(load)}</Cell>

                          <Cell>
                            <strong>{formatMoney(load.totalRate)}</strong>
                          </Cell>

                          <Cell>
                            <StatusBadge status={load.status} />
                          </Cell>

                          <Cell>
                            {load.driver ? (
                              <div>
                                <p className="font-medium">
                                  {load.driver.name}
                                </p>

                                <p className="mt-1 text-xs text-slate-600">
                                  {formatStatus(load.driver.assignmentStatus)}
                                </p>
                              </div>
                            ) : (
                              <span className="text-slate-600">Unassigned</span>
                            )}
                          </Cell>

                          <Cell>
                            <PaperworkBadge load={load} />
                          </Cell>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                </>
              )}
            </section>

            {dashboard.operations && <OperationsDetails data={dashboard.operations} owner={owner}/>}

            <section className="mt-8 grid gap-4 md:grid-cols-3">
              {owner&&<ActionCard
                title="Back Office"
                description="Clear paperwork blockers and prepare loads for billing."
                href="/back-office"
                action="Review paperwork"
              />}

              {owner&&<ActionCard
                title="Accounts Receivable"
                description="Track invoices, due dates, overdue balances, and payments."
                href="/back-office/accounts-receivable"
                action="View receivables"
              />}

              <ActionCard
                title="Driver Operations"
                description="See driver load packets and active assignments."
                href="/drivers"
                action="View drivers"
              />
            </section>
            {dashboard.operations && <RecentActivity data={dashboard.operations}/>}
          </>
        )}
      </div>
    </main>
  );
}

function MetricCard({
  title,
  value,
  detail,
  tone = "default",
}: {
  title: string;
  value: string;
  detail: string;

  tone?: "default" | "amber" | "green" | "blue";
}) {
  const classes = {
    default: "border-slate-200 bg-white",

    amber: "border-amber-200 bg-amber-50",

    green: "border-emerald-200 bg-emerald-50",

    blue: "border-blue-200 bg-blue-50",
  };

  return (
    <div className={`rounded-2xl border p-5 shadow-sm ${classes[tone]}`}>
      <p className="text-sm font-semibold text-slate-600">{title}</p>

      <p className="mt-3 text-3xl font-bold tracking-tight text-slate-950">
        {value}
      </p>

      <p className="mt-2 text-sm text-slate-600">{detail}</p>
    </div>
  );
}

function SmallMetric({
  label,
  value,
  detail,
}: {
  label: string;
  value: number;
  detail: string;
}) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5">
      <div className="flex items-center justify-between gap-4">
        <div>
          <p className="font-semibold text-slate-700">{label}</p>

          <p className="mt-1 text-sm text-slate-600">{detail}</p>
        </div>

        <p className="text-3xl font-bold text-slate-950">{value}</p>
      </div>
    </div>
  );
}

function PaperworkBadge({ load }: { load: RecentLoad }) {
  if (load.paperwork.clear) {
    return (
      <span className="inline-flex whitespace-nowrap rounded-full bg-emerald-100 px-3 py-1 text-xs font-bold text-emerald-700">
        Clear
      </span>
    );
  }

  if (load.paperwork.blockingCount > 0) {
    return (
      <span className="inline-flex whitespace-nowrap rounded-full bg-amber-100 px-3 py-1 text-xs font-bold text-amber-700">
        {load.paperwork.blockingCount}{" "}
        {load.paperwork.blockingCount === 1 ? "blocker" : "blockers"}
      </span>
    );
  }

  return (
    <span className="inline-flex whitespace-nowrap rounded-full bg-slate-100 px-3 py-1 text-xs font-bold text-slate-600">
      {load.paperwork.requiredCount} required
    </span>
  );
}

function StatusBadge({ status }: { status: string }) {
  const style =
    status === "PAID"
      ? "bg-emerald-100 text-emerald-700"
      : status === "INVOICED"
        ? "bg-blue-100 text-blue-700"
        : status === "PAYMENT_READY"
          ? "bg-violet-100 text-violet-700"
          : status === "IN_TRANSIT"
            ? "bg-amber-100 text-amber-700"
            : "bg-slate-100 text-slate-700";

  return (
    <span className={`inline-flex whitespace-nowrap rounded-full px-3 py-1 text-xs font-bold ${style}`}>
      {formatStatus(status)}
    </span>
  );
}

function ActionCard({
  title,
  description,
  href,
  action,
}: {
  title: string;
  description: string;
  href: string;
  action: string;
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
      <h3 className="text-lg font-bold text-slate-950">{title}</h3>

      <p className="mt-2 text-sm leading-6 text-slate-600">{description}</p>

      <Link
        href={href}
        className="mt-5 inline-block text-sm font-bold text-blue-700 hover:underline"
      >
        {action}
      </Link>
    </div>
  );
}

function Header({ children }: { children: React.ReactNode }) {
  return (
    <th className="px-6 py-3 text-left text-xs font-bold uppercase tracking-wide text-slate-600">
      {children}
    </th>
  );
}

function Cell({ children }: { children: React.ReactNode }) {
  return <td className="px-6 py-4 text-sm text-slate-700">{children}</td>;
}

function routeLabel(load: RecentLoad) {
  const pickup = load.pickup?.facilityName ?? load.pickup?.address ?? "Pickup";

  const delivery =
    load.delivery?.facilityName ?? load.delivery?.address ?? "Delivery";

  return `${pickup} -> ${delivery}`;
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

function formatStatus(status: string) {
  return status
    .replaceAll("_", " ")
    .toLowerCase()
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}
