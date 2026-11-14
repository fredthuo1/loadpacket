"use client";

import { useEffect, useRef, useState } from "react";
import { moneyText, type FinanceOverview } from "@/lib/api/finance";

export function FinanceTrend({ rows }: { rows: FinanceOverview["trend"] }) {
  const container = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(600);
  useEffect(() => {
    if (!container.current) return;
    const observer = new ResizeObserver(([entry]) => {
      if (entry.contentRect.width > 0) setWidth(entry.contentRect.width);
    });
    observer.observe(container.current);
    return () => observer.disconnect();
  }, []);

  // Numbers below are chart geometry only. Displayed amounts and all financial
  // totals remain the Decimal strings supplied by the API.
  const values = rows.flatMap((r) => [Number(r.revenue), Number(r.expenses)]);
  const minimum = Math.min(0, ...values);
  const maximum = Math.max(0, ...values);
  const span = maximum - minimum || 1;
  const high = maximum + span * 0.1;
  const low = minimum < 0 ? minimum - span * 0.1 : 0;
  const height = 224,
    left = 62,
    right = 8,
    top = 14,
    bottom = 44;
  const plotWidth = Math.max(1, width - left - right);
  const y = (value: number) =>
    top + ((high - value) / (high - low)) * (height - top - bottom);
  const baseline = y(0);
  const groupWidth = plotWidth / Math.max(1, rows.length);
  const barWidth = Math.min(22, groupWidth * 0.28);
  const tickEvery = Math.max(
    1,
    Math.ceil(rows.length / Math.max(1, Math.floor(plotWidth / 76))),
  );
  const axisMoney = new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    notation: "compact",
    maximumFractionDigits: 1,
  });

  return (
    <section className="min-w-0 rounded-xl border border-slate-200 bg-white p-5">
      <h2 className="font-bold text-slate-950">Revenue and expenses</h2>
      <p className="mt-1 text-xs text-slate-600">
        Monthly recorded activity · USD
      </p>
      <div ref={container} className="mt-4">
        {!rows.length ? (
          <p className="rounded-lg border border-dashed border-slate-300 p-6 text-sm text-slate-600">
            No recorded activity in this period. Add a transaction or import
            your spreadsheet.
          </p>
        ) : (
          <>
            <div className="mb-3 flex flex-wrap gap-4 text-xs text-slate-600">
              <span className="flex items-center gap-2">
                <span
                  aria-hidden="true"
                  className="h-2 w-2 rounded-sm bg-blue-700"
                />
                Revenue
              </span>
              <span className="flex items-center gap-2">
                <span
                  aria-hidden="true"
                  className="h-2 w-2 rounded-sm bg-slate-400"
                />
                Expenses
              </span>
            </div>
            <svg
              role="img"
              aria-label="Monthly recorded revenue and expenses; exact amounts and net in the expandable table below"
              viewBox={`0 0 ${width} ${height}`}
              className="h-56 w-full"
            >
              {[0, 1, 2, 3].map((i) => {
                const value = low + ((high - low) * i) / 3;
                return (
                  <g key={i}>
                    <line
                      x1={left}
                      x2={width - right}
                      y1={y(value)}
                      y2={y(value)}
                      stroke="#e2e8f0"
                    />
                    <text
                      x={left - 8}
                      y={y(value) + 4}
                      textAnchor="end"
                      fontSize="11"
                      fill="#475569"
                    >
                      {axisMoney.format(value)}
                    </text>
                  </g>
                );
              })}
              <line
                x1={left}
                x2={width - right}
                y1={baseline}
                y2={baseline}
                stroke="#94a3b8"
              />
              {rows.map((r, i) => {
                const center = left + groupWidth * (i + 0.5);
                return (
                  <g key={r.month}>
                    {[r.revenue, r.expenses].map((value, j) => (
                      <rect
                        key={j}
                        x={center + (j === 0 ? -barWidth - 1 : 1)}
                        y={Math.min(baseline, y(Number(value)))}
                        width={barWidth}
                        height={Math.abs(baseline - y(Number(value)))}
                        rx="2"
                        className={j === 0 ? "fill-blue-700" : "fill-slate-400"}
                      >
                        <title>
                          {r.month} {j === 0 ? "Revenue" : "Expenses"}:{" "}
                          {moneyText(value)}
                        </title>
                      </rect>
                    ))}
                    {i % tickEvery === 0 && (
                      <text
                        x={center}
                        y={height - 23}
                        textAnchor="middle"
                        fontSize="11"
                        fill="#475569"
                      >
                        {r.month}
                      </text>
                    )}
                  </g>
                );
              })}
              <text
                x={left + plotWidth / 2}
                y={height - 4}
                textAnchor="middle"
                fontSize="11"
                fill="#475569"
              >
                Month
              </text>
            </svg>
            <details className="mt-3 border-t border-slate-200 pt-3 text-sm">
              <summary className="cursor-pointer text-slate-600">
                View exact monthly values and net
              </summary>
              <div className="mt-3 overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <caption className="sr-only">
                    Monthly recorded amounts in USD
                  </caption>
                  <thead>
                    <tr>
                      {["Month", "Revenue", "Expenses", "Net"].map((h, i) => (
                        <th
                          scope="col"
                          className={`p-2 text-xs font-medium text-slate-600 ${i ? "text-right" : ""}`}
                          key={h}
                        >
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r) => (
                      <tr className="border-t border-slate-200" key={r.month}>
                        <td className="whitespace-nowrap p-2">{r.month}</td>
                        {[r.revenue, r.expenses, r.net].map((value, i) => (
                          <td
                            key={i}
                            className="whitespace-nowrap p-2 text-right tabular-nums"
                          >
                            {moneyText(value)}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </details>
          </>
        )}
      </div>
    </section>
  );
}
