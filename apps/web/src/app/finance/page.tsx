"use client";
import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  ManagementPage,
  buttonClass,
  inputClass,
  secondaryClass,
} from "@/components/management-ui";
import { useCurrentUser } from "@/components/auth-provider";
import { FinanceTransactionForm } from "@/components/finance-transaction-form";
import { LedgerTable } from "@/components/finance-ledger";
import { FinanceOverviewPanel } from "@/components/finance-overview";
import {
  dateRange,
  financeDownload,
  financeRequest,
  FinanceSetupRequiredError,
  moneyText,
  type FinanceOverview,
  type FinanceTransaction,
} from "@/lib/api/finance";
type Ledger = {
  items: FinanceTransaction[];
  total: number;
  page: number;
  pageSize: number;
};
type Audit = {
  id: string;
  createdAt: string;
  action: string;
  summary: string;
  recordId: string;
  actor: string;
};
type Profit = {
  broker: string;
  revenue: string;
  expenses: string;
  net: string;
  loads: number;
};
function FinanceContent() {
  const params = useSearchParams(),
    router = useRouter(),
    user = useCurrentUser();
  const section = params.get("section") ?? "overview";
  const defaults = dateRange("month");
  const from = params.get("from") ?? defaults.from,
    to = params.get("to") ?? defaults.to;
  const preset =
    ["month", "lastMonth", "quarter", "year", "lastYear"].find((name) => {
      const range = dateRange(name);
      return range.from === from && range.to === to;
    }) ?? "custom";
  const page = Number(params.get("page") ?? 1);
  const [reload, setReload] = useState(0);
  const [data, setData] = useState<{
    requestKey?: string;
    overview?: FinanceOverview;
    ledger?: Ledger;
    audit?: Audit[];
    profit?: Profit[];
    payroll?: { entries: FinanceTransaction[]; preparedPay: string };
  } | null>(null);
  const [error, setError] = useState("");
  const [setupRequired, setSetupRequired] = useState(false);
  const [adding, setAdding] = useState(false);
  const query = new URLSearchParams({
    from,
    to,
    page: String(page),
    pageSize: "25",
  });
  for (const key of [
    "type",
    "category",
    "search",
    "sort",
    "direction",
    "loadId",
    "driverId",
    "source",
    "importBatchId",
  ]) {
    const v = params.get(key);
    if (v) query.set(key, v);
  }
  const qs = query.toString();
  useEffect(() => {
    let alive = true;
    const controller = new AbortController();
    const endpoint =
      section === "transactions"
        ? "/transactions"
        : section === "audit"
          ? "/audit"
          : section === "profitability"
            ? "/profitability"
            : section === "payroll"
              ? "/payroll"
              : "/overview";
    const key =
      section === "transactions"
        ? "ledger"
        : section === "audit"
          ? "audit"
          : section === "profitability"
            ? "profit"
            : section === "payroll"
              ? "payroll"
              : "overview";
    financeRequest(endpoint + "?" + qs, { signal: controller.signal })
      .then((result) => {
        if (alive) {
          setData({ [key]: result, requestKey: section + qs + reload });
          setError("");
          setSetupRequired(false);
        }
      })
      .catch((err) => {
        if (alive) {
          setData(null);
          setSetupRequired(err instanceof FinanceSetupRequiredError);
          setError(
            err instanceof Error ? err.message : "Could not load Finance.",
          );
        }
      });
    return () => {
      alive = false;
      controller.abort();
    };
  }, [section, qs, reload]);
  const activeData =
    data?.requestKey !== section + qs + reload
      ? null
      : section === "transactions"
        ? data?.ledger
        : section === "audit"
          ? data?.audit
          : section === "profitability"
            ? data?.profit
            : section === "payroll"
              ? data?.payroll
              : data?.overview;
  const link = (name: string) =>
    `/finance?${new URLSearchParams({ section: name, from: name === "tax" ? from.slice(0, 4) + "-01-01" : from, to: name === "tax" ? from.slice(0, 4) + "-12-31" : to })}`;
  const exportRecords = async () => {
    try {
      await financeDownload(
        (section === "payroll" ? "/payroll/export" : "/export") + "?" + qs,
        section === "payroll" ? "DriverPay.csv" : "Transactions.csv",
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Export failed.");
    }
  };
  if (setupRequired)
    return (
      <ManagementPage title="Finance setup required" description={error}>
        <p className="rounded-xl border bg-white p-5">
          Your existing load and Accounts Receivable workflows remain available.
          Finance records will appear here after setup is complete.
        </p>
        <div className="mt-5 flex flex-wrap gap-3">
          <Link className={buttonClass} href="/back-office/accounts-receivable">
            Open Accounts Receivable
          </Link>
          <button
            className={secondaryClass}
            onClick={() => setReload((n) => n + 1)}
          >
            Check setup
          </button>
        </div>
      </ManagementPage>
    );
  return (
    <ManagementPage
      title="Finance & Records"
      description="Know your numbers. Trace every record to its source."
      actions={
        <div className="flex flex-wrap gap-2">
          <Link className={secondaryClass} href="/finance/settlements">
            Driver Settlements
          </Link>
          <Link className={secondaryClass} href="/finance/imports">
            Import Spreadsheet
          </Link>
          {section !== "audit" && (
            <button
              className={secondaryClass}
              onClick={() => void exportRecords()}
            >
              Export {section === "payroll" ? "Driver Pay" : "Records"} CSV
            </button>
          )}
          <button className={buttonClass} onClick={() => setAdding(true)}>
            + Add Transaction
          </button>
        </div>
      }
    >
      <nav
        aria-label="Finance sections"
        className="mb-5 flex flex-wrap gap-x-5 gap-y-1 border-b border-slate-200"
      >
        {[
          "overview",
          "transactions",
          "profitability",
          ...(user?.role === "OWNER" ? ["payroll"] : []),
          "tax",
          "audit",
        ].map((s) => (
          <Link
            key={s}
            href={link(s)}
            aria-current={section === s ? "page" : undefined}
            className={`border-b-2 py-3 text-sm font-semibold ${section === s ? "border-blue-700 text-blue-700" : "border-transparent text-slate-600 hover:text-blue-700"}`}
          >
            {
              (
                {
                  overview: "Overview",
                  transactions: "Transactions",
                  profitability: "Profitability",
                  payroll: "Payroll Prep",
                  tax: "Tax Center",
                  audit: "Audit Trail",
                } as Record<string, string>
              )[s]
            }
          </Link>
        ))}
        <Link
          className="border-b-2 border-transparent py-3 text-sm font-semibold text-slate-600 hover:text-blue-700"
          href="/back-office/accounts-receivable"
        >
          Accounts Receivable
        </Link>
      </nav>
      <form
        key={qs + section}
        aria-label="Finance filters"
        className="mb-6 grid items-end gap-3 rounded-xl border border-slate-200 bg-white p-4 text-sm text-slate-700 sm:grid-cols-2 lg:grid-cols-4"
        onSubmit={(e) => {
          e.preventDefault();
          const form = new FormData(e.currentTarget);
          const p = new URLSearchParams({ section });
          for (const [k, v] of form)
            if (typeof v === "string" && v) p.set(k, v);
          router.push("/finance?" + p.toString());
        }}
      >
        <label>
          Period
          <select
            aria-label="Period preset"
            className={inputClass}
            defaultValue={preset}
            onChange={(e) => {
              if (e.target.value === "custom") return;
              const range = dateRange(e.target.value);
              const next = new URLSearchParams(params.toString());
              next.set("section", section);
              next.set("from", range.from);
              next.set("to", range.to);
              next.delete("page");
              router.push("/finance?" + next);
            }}
          >
            {[
              ["month", "This Month"],
              ["lastMonth", "Last Month"],
              ["quarter", "This Quarter"],
              ["year", "Year to Date"],
              ["lastYear", "Last Year"],
              ["custom", "Custom"],
            ].map(([v, l]) => (
              <option value={v} key={v}>
                {l}
              </option>
            ))}
          </select>
        </label>
        <label>
          From
          <input
            className={inputClass}
            type="date"
            name="from"
            defaultValue={from}
            required
          />
        </label>
        <label>
          To
          <input
            className={inputClass}
            type="date"
            name="to"
            defaultValue={to}
            required
          />
        </label>
        {section === "transactions" && (
          <>
            <label>
              Type
              <select
                className={inputClass}
                name="type"
                defaultValue={params.get("type") ?? ""}
              >
                <option value="">All types</option>
                {[
                  "INCOME",
                  "EXPENSE",
                  "PAYMENT",
                  "ADJUSTMENT",
                  "DRIVER_PAY",
                ].map((t) => (
                  <option key={t} value={t}>
                    {t === "DRIVER_PAY"
                      ? "Driver pay"
                      : t.charAt(0) + t.slice(1).toLowerCase()}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Category
              <input
                className={inputClass}
                name="category"
                defaultValue={params.get("category") ?? ""}
              />
            </label>
            <label>
              Search
              <input
                className={inputClass}
                name="search"
                defaultValue={params.get("search") ?? ""}
              />
            </label>
            <label>
              Sort
              <select
                className={inputClass}
                name="sort"
                defaultValue={params.get("sort") ?? "date"}
              >
                <option value="date">Date</option>
                <option value="amount">Amount</option>
              </select>
            </label>
            <label>
              Order
              <select
                className={inputClass}
                name="direction"
                defaultValue={params.get("direction") ?? "desc"}
              >
                <option value="desc">Descending</option>
                <option value="asc">Ascending</option>
              </select>
            </label>
          </>
        )}
        {["loadId", "driverId", "importBatchId", "source"].map((k) =>
          params.get(k) ? (
            <input key={k} type="hidden" name={k} value={params.get(k)!} />
          ) : null,
        )}
        <button className={buttonClass}>Apply filters</button>
      </form>
      {section === "tax" && (
        <div className="mb-5 rounded-xl border border-blue-200 bg-blue-50 p-4">
          <label>
            Year{" "}
            <select
              className="ml-2 rounded border p-2"
              value={from.slice(0, 4)}
              onChange={(e) =>
                router.push(
                  `/finance?section=tax&from=${e.target.value}-01-01&to=${e.target.value}-12-31`,
                )
              }
            >
              {Array.from({ length: 12 }, (_, i) =>
                String(new Date().getUTCFullYear() - i),
              ).map((y) => (
                <option key={y}>{y}</option>
              ))}
            </select>
          </label>
          <p className="mt-3">
            Operational record organization for tax preparation. Categories do
            not imply deductibility. This is not a tax return or audited
            financial statement.
          </p>
        </div>
      )}
      {adding && (
        <FinanceTransactionForm
          onCancel={() => setAdding(false)}
          onSaved={() => {
            setAdding(false);
            setReload((n) => n + 1);
          }}
        />
      )}
      {error && (
        <div
          role="alert"
          className="mb-5 rounded-xl bg-red-50 p-4 text-red-800"
        >
          {error}{" "}
          <button className="underline" onClick={() => setReload((n) => n + 1)}>
            Retry
          </button>
        </div>
      )}
      {!activeData && !error && (
        <div
          role="status"
          className="rounded-xl border border-slate-200 bg-white p-6 text-sm text-slate-600"
        >
          Loading financial records…
        </div>
      )}
      {activeData && data?.overview && (
        <FinanceOverviewPanel
          key={reload}
          overview={data.overview}
          from={from}
          to={to}
        />
      )}
      {activeData && data?.ledger && (
        <>
          <LedgerTable rows={data.ledger.items} />
          <div className="my-5 flex items-center gap-4">
            <button
              className={secondaryClass}
              disabled={page <= 1}
              onClick={() =>
                router.push(
                  "/finance?" +
                    new URLSearchParams({
                      ...Object.fromEntries(params),
                      page: String(page - 1),
                    }),
                )
              }
            >
              Previous
            </button>
            <p>
              Page {page} · {data.ledger.total} records
            </p>
            <button
              className={secondaryClass}
              disabled={page * 25 >= data.ledger.total}
              onClick={() =>
                router.push(
                  "/finance?" +
                    new URLSearchParams({
                      ...Object.fromEntries(params),
                      page: String(page + 1),
                    }),
                )
              }
            >
              Next
            </button>
          </div>
        </>
      )}
      {activeData && data?.profit && (
        <div className="overflow-x-auto rounded-xl border bg-white p-5">
          <p className="mb-4 text-sm text-slate-600">
            Recorded costs only; no automatic overhead allocation. Unattributed
            costs are shown separately.
          </p>
          <table className="w-full text-left">
            <thead>
              <tr>
                {["Broker", "Revenue", "Expenses", "Net", "Linked Loads"].map(
                  (t) => (
                    <th className="p-3" key={t}>
                      {t}
                    </th>
                  ),
                )}
              </tr>
            </thead>
            <tbody>
              {data.profit.map((r) => (
                <tr key={r.broker} className="border-t">
                  <td className="p-3">{r.broker}</td>
                  <td>{moneyText(r.revenue)}</td>
                  <td>{moneyText(r.expenses)}</td>
                  <td>{moneyText(r.net)}</td>
                  <td>{r.loads}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {!data.profit.length && (
            <p>No profitability records in this period.</p>
          )}
        </div>
      )}
      {activeData && data?.payroll && (
        <>
          <h2 className="mb-4 text-xl font-bold">
            Legacy recorded driver pay: {moneyText(data.payroll.preparedPay)}
          </h2>
          <p className="mb-5">
            These records are unallocated to settlements. Use Driver Settlements
            for approved obligations and recorded settlement payments. No
            withholding, payroll processing or payment is performed. Imported
            driver names are source references; they are not automatically
            linked to driver accounts.
          </p>
          <LedgerTable rows={data.payroll.entries} />
        </>
      )}
      {activeData && data?.audit && (
        <section className="rounded-xl border bg-white p-5">
          <h2 className="font-bold">Financial audit events</h2>
          {data.audit.map((a) => (
            <article key={a.id} className="border-b py-4">
              <p className="font-semibold">{a.action.replaceAll("_", " ")}</p>
              <p>{a.summary}</p>
              <Link
                className="text-blue-700 underline"
                href={
                  a.action.startsWith("IMPORT_")
                    ? "/finance/imports?batch=" + a.recordId
                    : [
                          "PAYMENT_RECEIVED",
                          "INVOICE_CREATED",
                          "BILLING_SUBMITTED",
                        ].includes(a.action)
                      ? "/loads/" + a.recordId
                      : "/finance/transactions/" + a.recordId
                }
              >
                View source record
              </Link>
              <p className="text-sm text-slate-600">
                {a.actor} · {new Date(a.createdAt).toLocaleString()}
              </p>
            </article>
          ))}
          {!data.audit.length && <p>No audit events in this period.</p>}
          <div className="mt-4 flex gap-3">
            <button
              className={secondaryClass}
              disabled={page <= 1}
              onClick={() => router.push(link("audit") + `&page=${page - 1}`)}
            >
              Previous events
            </button>
            <button
              className={secondaryClass}
              disabled={data.audit.length < 25}
              onClick={() => router.push(link("audit") + `&page=${page + 1}`)}
            >
              Next events
            </button>
          </div>
        </section>
      )}
      <p className="mt-8 text-xs text-slate-600">
        LoadPacket Finance organizes operational financial records. It does not
        calculate or file taxes, process payroll, provide accounting advice, or
        provide audited financial statements.
      </p>
    </ManagementPage>
  );
}
export default function FinancePage() {
  return (
    <Suspense fallback={<p className="p-8">Loading Finance…</p>}>
      <FinanceContent />
    </Suspense>
  );
}
