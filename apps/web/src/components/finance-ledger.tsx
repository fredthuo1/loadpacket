import Link from "next/link";
import { moneyText, type FinanceTransaction } from "@/lib/api/finance";

const labels: Record<string, string> = {
  INCOME: "Income",
  EXPENSE: "Expense",
  PAYMENT: "Payment",
  ADJUSTMENT: "Adjustment",
  DRIVER_PAY: "Legacy Driver pay",
  MANUAL: "Manual",
  IMPORT: "Import",
  LOADPACKET: "LoadPacket",
};
export function LedgerTable({
  rows,
  compact = false,
}: {
  rows: FinanceTransaction[];
  compact?: boolean;
}) {
  return (
    <div className="min-w-0 overflow-x-auto rounded-xl border border-slate-200 bg-white">
      <table className="w-full text-left text-sm">
        <caption className="sr-only">Financial transactions in USD</caption>
        <thead className="border-b border-slate-200 text-xs font-medium text-slate-600">
          <tr>
            <th
              scope="col"
              className="hidden px-4 py-3 font-medium sm:table-cell"
            >
              Date
            </th>
            {!compact && (
              <th
                scope="col"
                className="hidden px-4 py-3 font-medium lg:table-cell"
              >
                Type / Category
              </th>
            )}
            <th scope="col" className="px-4 py-3 font-medium">
              Record
            </th>
            {!compact && (
              <th
                scope="col"
                className="hidden px-4 py-3 font-medium lg:table-cell"
              >
                Load / Driver
              </th>
            )}
            <th
              scope="col"
              className="hidden px-4 py-3 font-medium md:table-cell"
            >
              Source
            </th>
            <th scope="col" className="px-4 py-3 text-right font-medium">
              Amount
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-200">
          {rows.map((r) => (
            <tr key={r.id} className="hover:bg-slate-50">
              <td className="hidden whitespace-nowrap px-4 py-4 text-slate-600 sm:table-cell">
                {r.date}
              </td>
              {!compact && (
                <td className="hidden px-4 py-4 lg:table-cell">
                  {labels[r.type] ?? r.type}
                  <span className="mt-1 block text-xs text-slate-600">
                    {r.category}
                  </span>
                </td>
              )}
              <td className="max-w-xs px-4 py-4 [overflow-wrap:anywhere]">
                <Link
                  className="font-semibold text-blue-700 underline decoration-blue-200 underline-offset-4 hover:decoration-blue-700"
                  href={`/finance/transactions/${encodeURIComponent(r.id)}`}
                >
                  {r.description}
                </Link>
                <p
                  className={`mt-1 text-xs text-slate-600 ${compact ? "" : "lg:hidden"}`}
                >
                  {labels[r.type] ?? r.type} · {r.category}
                </p>
                <p className="mt-1 text-xs text-slate-600 sm:hidden">
                  {r.date}
                </p>
                <p className="mt-1 text-xs text-slate-600 md:hidden">
                  Source: {labels[r.source] ?? r.source}
                </p>
                {!compact && (
                  <p className="mt-1 text-xs text-slate-600 lg:hidden">
                    {r.loadId ? (
                      <Link
                        className="text-blue-700 underline"
                        href={`/loads/${r.loadId}`}
                      >
                        {r.loadNumber ?? "View load"}
                      </Link>
                    ) : (
                      r.loadNumber
                    )}
                    {r.driverName ? ` · ${r.driverName}` : ""}
                  </p>
                )}
              </td>
              {!compact && (
                <td className="hidden px-4 py-4 lg:table-cell">
                  {r.loadId ? (
                    <Link
                      className="text-blue-700 underline underline-offset-4"
                      href={`/loads/${r.loadId}`}
                    >
                      {r.loadNumber ?? "View load"}
                    </Link>
                  ) : (
                    (r.loadNumber ?? "—")
                  )}
                  <span className="mt-1 block text-xs text-slate-600">
                    {r.driverName ?? "—"}
                  </span>
                </td>
              )}
              <td className="hidden px-4 py-4 md:table-cell">
                <span className="rounded bg-slate-100 px-2 py-1 text-xs text-slate-600">
                  {labels[r.source] ?? r.source}
                </span>
              </td>
              <td className="whitespace-nowrap px-4 py-4 text-right font-semibold text-slate-950 tabular-nums">
                {moneyText(r.amount)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {!rows.length && (
        <p className="p-8 text-center text-sm text-slate-600">
          No financial records match this period and filters.
        </p>
      )}
    </div>
  );
}
