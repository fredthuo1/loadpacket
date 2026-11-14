"use client";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import {
  ManagementPage,
  buttonClass,
  inputClass,
  secondaryClass,
} from "@/components/management-ui";
import {
  dateRange,
  financeDownload,
  financeRequest,
  moneyText,
} from "@/lib/api/finance";
import type {
  SettlementItem,
  SettlementView,
  SettlementReceipt,
  SettlementWork,
} from "../../../../../../packages/api-contracts/settlements";

function preview(items: SettlementItem[]) {
  const totals = {
    gross: BigInt(0),
    bonuses: BigInt(0),
    deductions: BigInt(0),
    adjustments: BigInt(0),
  };
  for (const i of items) {
    if (!/^-?\d{1,10}(\.\d{1,2})?$/.test(i.amount)) return null;
    const [whole, fraction = ""] = i.amount.replace("-", "").split(".");
    const cents =
      (BigInt(whole) * BigInt(100) + BigInt(fraction.padEnd(2, "0"))) *
      (i.amount.startsWith("-") ? -BigInt(1) : BigInt(1));
    if (i.kind === "BONUS") totals.bonuses += cents;
    else if (i.kind === "DEDUCTION") totals.deductions += cents;
    else if (i.kind === "ADJUSTMENT") totals.adjustments += cents;
    else totals.gross += cents;
  }
  const net =
    totals.gross + totals.bonuses - totals.deductions + totals.adjustments;
  return Object.entries({ ...totals, net })
    .map(([label, cents]) => {
      const absolute = cents < BigInt(0) ? -cents : cents;
      return `${label}: ${moneyText(`${cents < BigInt(0) ? "-" : ""}${absolute / BigInt(100)}.${String(absolute % BigInt(100)).padStart(2, "0")}`)}`;
    })
    .join(" · ");
}
export default function SettlementsPage() {
  const defaults = dateRange("month");
  const [rows, setRows] = useState<SettlementView[]>([]),
    [drivers, setDrivers] = useState<
      { id: string; firstName: string; lastName: string }[]
    >([]);
  const [current, setCurrent] = useState<SettlementView | null>(null),
    [work, setWork] = useState<SettlementWork[]>([]);
  const [driverId, setDriverId] = useState(""),
    [start, setStart] = useState(defaults.from),
    [end, setEnd] = useState(defaults.to);
  const [selected, setSelected] = useState<string[]>([]),
    [items, setItems] = useState<SettlementItem[]>([]),
    [mode, setMode] = useState("PER_LOAD");
  const [editing, setEditing] = useState<string | null>(null),
    [original, setOriginal] = useState<string | null>(null),
    [form, setForm] = useState(false);
  const [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [busy, setBusy] = useState(false),
    [loading, setLoading] = useState(true);
  const [amount, setAmount] = useState(""),
    [method, setMethod] = useState("ACH"),
    [reference, setReference] = useState(""),
    [date, setDate] = useState(defaults.to),
    [reason, setReason] = useState("");
  const keys = useRef(new Map<string, string>());
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let active = true;
    const requested = new URLSearchParams(window.location.search).get("id");
    Promise.all([
      financeRequest<SettlementView[]>("/settlements"),
      financeRequest<{ drivers: typeof drivers }>("/lookups"),
      requested
        ? financeRequest<SettlementView>(
            `/settlements/${encodeURIComponent(requested)}`,
          )
        : Promise.resolve(null),
    ])
      .then(([list, lookup, requestedSettlement]) => {
        if (active) {
          setRows(list);
          setDrivers(lookup.drivers);
          setCurrent(requestedSettlement);
          setLoading(false);
        }
      })
      .catch((e) => {
        if (active) {
          setError(
            e instanceof Error ? e.message : "Could not load settlements.",
          );
          setLoading(false);
        }
      });
    return () => {
      active = false;
    };
  }, [attempt]);
  async function refresh() {
    setRows(await financeRequest<SettlementView[]>("/settlements"));
    if (current)
      setCurrent(
        await financeRequest<SettlementView>(`/settlements/${current.id}`),
      );
  }
  async function perform(run: () => Promise<void>) {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await run();
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "Request failed. Retry the same action to recover its result.",
      );
    } finally {
      setBusy(false);
    }
  }
  async function command(path: string, body: object) {
    const fingerprint = JSON.stringify([path, body]);
    const idempotencyKey = keys.current.get(fingerprint) ?? crypto.randomUUID();
    keys.current.set(fingerprint, idempotencyKey);
    const result = await financeRequest<SettlementReceipt>(path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...body, idempotencyKey }),
    });
    const detail = await financeRequest<SettlementView>(
      `/settlements/${result.id}`,
    );
    setRows(await financeRequest<SettlementView[]>("/settlements"));
    setCurrent(detail);
    keys.current.delete(fingerprint);
    setNotice(
      "Settlement saved. Recorded payments do not initiate or verify a bank transfer.",
    );
    return result;
  }
  function startForm(row?: SettlementView, adjustment = false) {
    setForm(true);
    setEditing(row && !adjustment ? row.id : null);
    setOriginal(adjustment ? row!.id : (row?.originalSettlementId ?? null));
    setDriverId(row?.driverId ?? "");
    setStart(row?.periodStart ?? defaults.from);
    setEnd(row?.periodEnd ?? defaults.to);
    setSelected(adjustment ? [] : (row?.work.map((w) => w.loadId) ?? []));
    setWork(adjustment ? [] : (row?.work ?? []));
    setItems(
      adjustment
        ? [{ kind: "ADJUSTMENT", amount: "", description: "" }]
        : (row?.items ?? []),
    );
    setMode(row?.items.some((i) => i.kind === "FLAT") ? "FLAT" : "PER_LOAD");
    setError("");
  }
  function choose(ids: string[], nextMode = mode) {
    setSelected(ids);
    setMode(nextMode);
    setItems([
      ...items.filter((i) => i.kind === "BONUS" || i.kind === "DEDUCTION"),
      ...(nextMode === "FLAT"
        ? [
            {
              kind: "FLAT" as const,
              amount: items.find((i) => i.kind === "FLAT")?.amount ?? "",
              description: "Flat compensation for selected completed work",
            },
          ]
        : ids.map(
            (id) =>
              items.find((i) => i.loadId === id) ?? {
                kind: "PER_LOAD" as const,
                loadId: id,
                amount: "",
                description: `Pay for ${work.find((w) => w.loadId === id)?.loadNumber ?? id}`,
              },
          )),
    ]);
  }
  return (
    <ManagementPage
      title="Driver settlements"
      description="Review compensation, preserve approved statements, and track recorded payments."
      actions={
        <Link href="/finance" className={secondaryClass}>
          Back to Finance
        </Link>
      }
    >
      <div className="mb-5 flex flex-wrap gap-3">
        <button
          className={buttonClass}
          disabled={busy}
          onClick={() => startForm()}
        >
          Prepare settlement
        </button>
        <button
          className={secondaryClass}
          disabled={busy}
          onClick={() => void perform(refresh)}
        >
          Refresh
        </button>
      </div>
      {error && (
        <p
          role="alert"
          className="mb-4 rounded-xl border border-red-200 bg-red-50 p-4 text-red-800"
        >
          {error}
        </p>
      )}
      {notice && (
        <p
          role="status"
          className="mb-4 rounded-xl bg-emerald-50 p-4 text-emerald-900"
        >
          {notice}
        </p>
      )}
      {error && !rows.length && !current && <button className={`${secondaryClass} mb-4`} disabled={loading || busy} onClick={() => { setError(""); setLoading(true); setAttempt((value) => value + 1); }}>Retry settlements</button>}
      <p className="mb-5 text-sm text-slate-600">
        USD only. Periods use America/Chicago calendar dates. Legacy Driver Pay
        stays in Payroll Prep; overlapping or ambiguous legacy records require
        reconciliation.
      </p>
      {loading ? (
        <p role="status">Loading settlements…</p>
      ) : (
        <div className="mb-6 overflow-x-auto rounded-xl border bg-white">
          <table className="w-full text-left text-sm">
            <caption className="p-3 text-left text-slate-600">
              Latest 100 statements, including adjustments. Open an original for
              its complete payment and adjustment history.
            </caption>
            <thead>
              <tr>
                {[
                  "Driver / period",
                  "Statement",
                  "Status",
                  "Net",
                  "Remaining payable",
                  "",
                ].map((h) => (
                  <th key={h} className="p-3">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id} className="border-t">
                  <td className="p-3">
                    {row.driverName}
                    <br />
                    {row.periodStart} – {row.periodEnd}
                  </td>
                  <td className="p-3">{row.kind}</td>
                  <td className="p-3">
                    {row.state} · {row.paymentStatus}
                  </td>
                  <td className="p-3">{moneyText(row.totals.net)}</td>
                  <td className="p-3">
                    {row.kind === "BASE" && row.state === "APPROVED"
                      ? moneyText(row.remainingPayable)
                      : "—"}
                  </td>
                  <td className="p-3">
                    <button
                      className={secondaryClass}
                      disabled={busy}
                      onClick={() =>
                        void perform(async () => {
                          setCurrent(
                            await financeRequest<SettlementView>(
                              `/settlements/${row.id}`,
                            ),
                          );
                          setForm(false);
                        })
                      }
                    >
                      Open
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!rows.length && !error && <p className="p-5">No settlements prepared yet.</p>}
        </div>
      )}
      {form && (
        <form
          className="mb-6 space-y-5 rounded-xl border bg-white p-5"
          onSubmit={(e) => {
            e.preventDefault();
            void perform(async () => {
              const body = { loadIds: selected, items };
              await command(
                editing ? `/settlements/${editing}/edit` : "/settlements",
                editing
                  ? { ...body, revision: current!.revision }
                  : {
                      ...body,
                      driverId,
                      periodStart: start,
                      periodEnd: end,
                      currency: "USD",
                      ...(original ? { originalSettlementId: original } : {}),
                    },
              );
              setForm(false);
            });
          }}
        >
          <h2 className="text-xl font-bold">
            {original
              ? "Adjustment statement"
              : editing
                ? "Edit draft compensation"
                : "Prepare compensation"}
          </h2>
          <fieldset disabled={busy} className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-3">
              <label>
                Driver
                <select
                  className={inputClass}
                  required
                  disabled={!!editing || !!original}
                  value={driverId}
                  onChange={(e) => {
                    setDriverId(e.target.value);
                    setWork([]);
                    setSelected([]);
                    setItems([]);
                  }}
                >
                  <option value="">Select Driver</option>
                  {drivers.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.firstName} {d.lastName}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Period start
                <input
                  className={inputClass}
                  type="date"
                  required
                  disabled={!!editing || !!original}
                  value={start}
                  onChange={(e) => {
                    setStart(e.target.value);
                    setWork([]);
                    setSelected([]);
                    setItems([]);
                  }}
                />
              </label>
              <label>
                Period end
                <input
                  className={inputClass}
                  type="date"
                  required
                  disabled={!!editing || !!original}
                  value={end}
                  onChange={(e) => {
                    setEnd(e.target.value);
                    setWork([]);
                    setSelected([]);
                    setItems([]);
                  }}
                />
              </label>
            </div>
            {!original && (
              <>
                <button
                  type="button"
                  className={secondaryClass}
                  disabled={!driverId}
                  onClick={() =>
                    void perform(async () => {
                      const result = await financeRequest<{
                        work: SettlementWork[];
                        limited: boolean;
                        inactive: boolean;
                      }>(
                        `/settlements/eligible?${new URLSearchParams({ driverId, periodStart: start, periodEnd: end })}`,
                      );
                      setWork([
                        ...(current?.work.filter(
                          (w) =>
                            editing &&
                            !result.work.some((x) => x.loadId === w.loadId),
                        ) ?? []),
                        ...result.work,
                      ]);
                      setNotice(
                        `${result.work.length} available completed loads.${result.inactive ? " Inactive Driver: historical work remains payable." : ""}${result.limited ? " Results limited to 100 candidate loads." : ""}`,
                      );
                    })
                  }
                >
                  Find completed work
                </button>
                <div className="space-y-2">
                  {work.map((w) => (
                    <label
                      key={w.loadId}
                      className="flex items-center gap-3 rounded-lg border p-3"
                    >
                      <input
                        type="checkbox"
                        checked={selected.includes(w.loadId)}
                        onChange={(e) =>
                          choose(
                            e.target.checked
                              ? [...selected, w.loadId]
                              : selected.filter((id) => id !== w.loadId),
                          )
                        }
                      />
                      {w.loadNumber} · {w.completedAt.slice(0, 10)}
                    </label>
                  ))}
                </div>
                <label className="block">
                  Compensation method
                  <select
                    className={inputClass}
                    value={mode}
                    onChange={(e) => choose(selected, e.target.value)}
                  >
                    <option value="PER_LOAD">Explicit amount per load</option>
                    <option value="FLAT">
                      One flat amount for selected work
                    </option>
                  </select>
                </label>
              </>
            )}
            {items.map((item, index) => (
              <div
                className="grid gap-3 rounded-lg bg-slate-50 p-3 sm:grid-cols-[1fr_2fr_1fr_auto]"
                key={index}
              >
                <span className="self-center">{item.kind}</span>
                <label>
                  Description
                  <input
                    required
                    className={inputClass}
                    maxLength={500}
                    value={item.description}
                    onChange={(e) =>
                      setItems(
                        items.map((i, n) =>
                          n === index
                            ? { ...i, description: e.target.value }
                            : i,
                        ),
                      )
                    }
                  />
                </label>
                <label>
                  Amount USD
                  <input
                    required
                    inputMode="decimal"
                    className={inputClass}
                    value={item.amount}
                    onChange={(e) =>
                      setItems(
                        items.map((i, n) =>
                          n === index ? { ...i, amount: e.target.value } : i,
                        ),
                      )
                    }
                  />
                </label>
                {["BONUS", "DEDUCTION"].includes(item.kind) && (
                  <button
                    type="button"
                    className={secondaryClass}
                    onClick={() =>
                      setItems(items.filter((_, n) => n !== index))
                    }
                  >
                    Remove
                  </button>
                )}
              </div>
            ))}
            {!original && (
              <div className="flex flex-wrap gap-3">
                {(["BONUS", "DEDUCTION"] as const).map((kind) => (
                  <button
                    key={kind}
                    type="button"
                    className={secondaryClass}
                    onClick={() =>
                      setItems([
                        ...items,
                        { kind, amount: "", description: "" },
                      ])
                    }
                  >
                    Add {kind.toLowerCase()}
                  </button>
                ))}
              </div>
            )}
            <p
              aria-live="polite"
              className="rounded-xl bg-teal-50 p-4 font-semibold text-teal-950"
            >
              Preview ·{" "}
              {preview(items) ??
                "Enter valid amounts with up to two decimal places."}
            </p>
            <p className="text-sm text-slate-600">
              Explicit reviewed amounts only. Carrier revenue does not determine
              Driver compensation. Saving an edit invalidates prior review.
            </p>
            <div className="flex gap-3">
              <button className={buttonClass} disabled={!items.length}>
                Save draft
              </button>
              <button
                type="button"
                className={secondaryClass}
                onClick={() => setForm(false)}
              >
                Close form
              </button>
            </div>
          </fieldset>
        </form>
      )}
      {current && !form && (
        <section
          className="space-y-5 rounded-xl border bg-white p-5"
          aria-label="Settlement details"
        >
          <h2 className="text-xl font-bold">
            {current.driverName} ·{" "}
            {current.kind === "BASE" ? "Settlement" : "Adjustment"}
          </h2>
          <p className="break-all text-sm text-slate-600">
            {current.id} · revision {current.revision} · {current.state}
          </p>
          <dl className="grid gap-4 sm:grid-cols-3">
            {Object.entries(current.totals).map(([label, value]) => (
              <div key={label}>
                <dt className="capitalize text-slate-600">{label}</dt>
                <dd className="text-xl font-bold">{moneyText(value)}</dd>
              </div>
            ))}
            <div>
              <dt>Effective obligation</dt>
              <dd>{moneyText(current.effectiveObligation)}</dd>
            </div>
            <div>
              <dt>Recorded payments</dt>
              <dd>{moneyText(current.recordedPayments)}</dd>
            </div>
            <div>
              <dt>Remaining payable</dt>
              <dd>{moneyText(current.remainingPayable)}</dd>
            </div>
          </dl>
          <ul className="space-y-2">
            {current.items.map((item, i) => (
              <li key={i} className="rounded-lg bg-slate-50 p-3">
                {item.description} · {item.kind} · {moneyText(item.amount)}
              </li>
            ))}
          </ul>
          {current.cancellationReason && (
            <p>Cancelled: {current.cancellationReason}</p>
          )}
          <div className="flex flex-wrap gap-3">
            {["DRAFT", "REVIEWED"].includes(current.state) && (
              <button
                disabled={busy}
                className={secondaryClass}
                onClick={() => startForm(current)}
              >
                Edit compensation
              </button>
            )}
            {current.state === "DRAFT" && (
              <button
                disabled={busy}
                className={buttonClass}
                onClick={() =>
                  void perform(async () => {
                    await command(`/settlements/${current.id}/review`, {
                      revision: current.revision,
                    });
                  })
                }
              >
                Mark reviewed
              </button>
            )}
            {current.state === "REVIEWED" && (
              <button
                disabled={busy}
                className={buttonClass}
                onClick={() =>
                  void perform(async () => {
                    await command(`/settlements/${current.id}/approve`, {
                      revision: current.revision,
                    });
                  })
                }
              >
                Approve and freeze statement
              </button>
            )}
            {current.documentVersionId && (
              <button
                disabled={busy}
                className={secondaryClass}
                onClick={() =>
                  void perform(() =>
                    financeDownload(
                      `/settlements/${current.id}/statement`,
                      `Settlement-${current.id}.pdf`,
                    ),
                  )
                }
              >
                Download statement
              </button>
            )}
            {current.state === "APPROVED" && current.kind === "BASE" && (
              <button
                disabled={busy}
                className={secondaryClass}
                onClick={() => startForm(current, true)}
              >
                Prepare adjustment
              </button>
            )}
          </div>
          {["DRAFT", "REVIEWED"].includes(current.state) && (
            <div>
              <label>
                Cancellation reason
                <input
                  className={inputClass}
                  value={reason}
                  maxLength={1000}
                  onChange={(e) => setReason(e.target.value)}
                />
              </label>
              <button
                disabled={busy || reason.trim().length < 3}
                className={`${secondaryClass} mt-3`}
                onClick={() =>
                  void perform(async () => {
                    await command(`/settlements/${current.id}/cancel`, {
                      revision: current.revision,
                      reason,
                    });
                    setReason("");
                  })
                }
              >
                Cancel unapproved settlement
              </button>
            </div>
          )}
          {current.state === "APPROVED" &&
            current.kind === "BASE" &&
            current.remainingPayable !== "0.00" && (
              <form
                className="space-y-4 border-t pt-5"
                onSubmit={(e) => {
                  e.preventDefault();
                  void perform(async () => {
                    await command(`/settlements/${current.id}/payments`, {
                      revision: current.revision,
                      amount,
                      currency: "USD",
                      paymentDate: date,
                      method,
                      reference,
                    });
                    setAmount("");
                    setReference("");
                  });
                }}
              >
                <h3 className="font-bold">Record payment already made</h3>
                <fieldset disabled={busy} className="grid gap-3 sm:grid-cols-2">
                  <label>
                    Payment amount USD
                    <input
                      required
                      className={inputClass}
                      inputMode="decimal"
                      value={amount}
                      onChange={(e) => setAmount(e.target.value)}
                    />
                  </label>
                  <label>
                    Payment date
                    <input
                      required
                      type="date"
                      className={inputClass}
                      value={date}
                      onChange={(e) => setDate(e.target.value)}
                    />
                  </label>
                  <label>
                    Method
                    <select
                      className={inputClass}
                      value={method}
                      onChange={(e) => setMethod(e.target.value)}
                    >
                      {["CASH", "CHECK", "ACH", "WIRE", "OTHER"].map((m) => (
                        <option key={m}>{m}</option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Reference
                    <input
                      required={method !== "CASH"}
                      className={inputClass}
                      maxLength={200}
                      value={reference}
                      onChange={(e) => setReference(e.target.value)}
                    />
                  </label>
                  <button className={buttonClass}>Record payment</button>
                </fieldset>
                <p className="text-sm text-slate-600">
                  This records your report of payment. LoadPacket does not
                  execute or verify bank transfers. Recorded payments cannot be
                  edited or reversed here.
                </p>
              </form>
            )}
          <h3 className="font-bold">
            Payment history · {current.paymentStatus}
          </h3>
          {current.payments.length ? (
            <ul>
              {current.payments.map((p) => (
                <li key={p.id} className="border-t py-3">
                  {p.paymentDate} · {moneyText(p.amount)} · {p.method} ·{" "}
                  {p.reference ?? "No reference"}
                </li>
              ))}
            </ul>
          ) : (
            <p>No payments recorded.</p>
          )}
          <h3 className="font-bold">Adjustment history</h3>
          <ul>
            {current.adjustments.map((a) => (
              <li
                key={a.id}
                className="flex flex-wrap items-center gap-3 border-t py-3"
              >
                {moneyText(a.amount)} · {a.state}
                <button
                  className={secondaryClass}
                  disabled={busy}
                  onClick={() =>
                    void perform(async () =>
                      setCurrent(
                        await financeRequest<SettlementView>(
                          `/settlements/${a.id}`,
                        ),
                      ),
                    )
                  }
                >
                  Open adjustment
                </button>
              </li>
            ))}
          </ul>
          <details>
            <summary className="cursor-pointer font-bold">
              Activity history
            </summary>
            <ul>
              {current.history.map((h, i) => (
                <li key={i} className="break-all py-2 text-sm">
                  {h.createdAt} · {h.action} · actor {h.actorId}
                </li>
              ))}
            </ul>
          </details>
        </section>
      )}
    </ManagementPage>
  );
}
