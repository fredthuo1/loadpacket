"use client";
import { apiFetch, API_BASE_URL } from "@/lib/api/api-fetch";

import { useCallback, useEffect, useMemo, useState } from "react";

type MoneyOpportunity = {
  id: string;
  loadId: string;
  sourceDocumentId: string | null;
  type: string;
  status: string;
  amount: string | null;
  currency: string;
  description: string | null;
  detectedAt: string;
  resolvedAt: string | null;
  createdAt: string;
  updatedAt: string;

  sourceDocument?: {
    id: string;
    type: string;
    originalFileName: string | null;
  };
};

type ScanResponse = {
  createdCount: number;
  opportunities: MoneyOpportunity[];
};

type UpdateResponse = {
  updated?: boolean;
  approved?: boolean;
  dismissed?: boolean;

  message?: string;

  opportunity: MoneyOpportunity;
};

type Props = {
  loadId: string;
};

export function MoneyOpportunitiesPanel({ loadId }: Props) {
  const [opportunities, setOpportunities] = useState<MoneyOpportunity[]>([]);

  const [amounts, setAmounts] = useState<Record<string, string>>({});

  const [isLoading, setIsLoading] = useState(true);

  const [scanning, setScanning] = useState(false);

  const [busyId, setBusyId] = useState<string | null>(null);

  const [error, setError] = useState<string | null>(null);

  const [message, setMessage] = useState<string | null>(null);

  const loadOpportunities = useCallback(async () => {
    const response = await apiFetch(
      `${API_BASE_URL}/money-opportunities/loads/${loadId}`,
      {
        cache: "no-store",
      },
    );

    if (!response.ok) {
      throw new Error(
        await responseError(response, "Unable to load money opportunities."),
      );
    }

    const result = (await response.json()) as MoneyOpportunity[];

    setOpportunities(result);

    setAmounts((current) => {
      const next = {
        ...current,
      };

      for (const opportunity of result) {
        if (next[opportunity.id] === undefined) {
          next[opportunity.id] = opportunity.amount ?? "";
        }
      }

      return next;
    });
  }, [loadId]);

  const scanDocuments = useCallback(
    async (silent = false) => {
      try {
        setScanning(true);

        if (!silent) {
          setError(null);

          setMessage(null);
        }

        const response = await apiFetch(
          `${API_BASE_URL}/money-opportunities/loads/${loadId}/scan`,
          {
            method: "POST",
          },
        );

        if (!response.ok) {
          throw new Error(
            await responseError(response, "Unable to scan load documents."),
          );
        }

        const result = (await response.json()) as ScanResponse;

        await loadOpportunities();

        if (!silent) {
          setMessage(
            result.createdCount > 0
              ? `${result.createdCount} money opportunity${
                  result.createdCount === 1 ? "" : "ies"
                } detected.`
              : "No new money opportunities were found.",
          );
        }
      } catch (scanError) {
        if (!silent) {
          setError(
            scanError instanceof Error
              ? scanError.message
              : "Unable to scan load documents.",
          );
        }
      } finally {
        setScanning(false);
      }
    },
    [loadId, loadOpportunities],
  );

  useEffect(() => {
    async function initialize() {
      try {
        setIsLoading(true);

        setError(null);

        /*
         * Scan is idempotent.
         *
         * This means an Owner opening
         * the load automatically evaluates
         * any already-captured receipts.
         */
        await scanDocuments(true);

        await loadOpportunities();
      } catch (loadError) {
        setError(
          loadError instanceof Error
            ? loadError.message
            : "Unable to load money opportunities.",
        );
      } finally {
        setIsLoading(false);
      }
    }

    void initialize();
  }, [loadOpportunities, scanDocuments]);

  const detected = useMemo(
    () =>
      opportunities.filter((opportunity) => opportunity.status === "DETECTED"),
    [opportunities],
  );

  const approved = useMemo(
    () =>
      opportunities.filter((opportunity) => opportunity.status === "APPROVED"),
    [opportunities],
  );

  const moneyFound = useMemo(
    () =>
      [...detected, ...approved].reduce(
        (total, opportunity) => total + parseMoney(opportunity.amount),
        0,
      ),
    [approved, detected],
  );

  async function saveAmount(opportunity: MoneyOpportunity) {
    const amount = amounts[opportunity.id]?.trim();

    if (!amount) {
      setError("Enter an amount first.");

      return;
    }

    try {
      setBusyId(opportunity.id);

      setError(null);

      setMessage(null);

      const response = await apiFetch(
        `${API_BASE_URL}/money-opportunities/${opportunity.id}/amount`,
        {
          method: "PATCH",

          headers: {
            "Content-Type": "application/json",
          },

          body: JSON.stringify({
            amount,
          }),
        },
      );

      if (!response.ok) {
        throw new Error(
          await responseError(response, "Unable to save amount."),
        );
      }

      await loadOpportunities();

      setMessage(`${formatOpportunityType(opportunity.type)} amount saved.`);
    } catch (saveError) {
      setError(
        saveError instanceof Error
          ? saveError.message
          : "Unable to save amount.",
      );
    } finally {
      setBusyId(null);
    }
  }

  async function approveOpportunity(opportunity: MoneyOpportunity) {
    const amount = amounts[opportunity.id]?.trim();

    try {
      setBusyId(opportunity.id);

      setError(null);

      setMessage(null);

      /*
       * If the user changed the amount
       * in the input, save it first.
       */
      if (amount && amount !== opportunity.amount) {
        const amountResponse = await apiFetch(
          `${API_BASE_URL}/money-opportunities/${opportunity.id}/amount`,
          {
            method: "PATCH",

            headers: {
              "Content-Type": "application/json",
            },

            body: JSON.stringify({
              amount,
            }),
          },
        );

        if (!amountResponse.ok) {
          throw new Error(
            await responseError(
              amountResponse,
              "Unable to save opportunity amount.",
            ),
          );
        }
      }

      const response = await apiFetch(
        `${API_BASE_URL}/money-opportunities/${opportunity.id}/approve`,
        {
          method: "POST",
        },
      );

      if (!response.ok) {
        throw new Error(
          await responseError(response, "Unable to approve opportunity."),
        );
      }

      const result = (await response.json()) as UpdateResponse;

      await loadOpportunities();

      setMessage(
        result.approved
          ? `${formatOpportunityType(opportunity.type)} approved.`
          : (result.message ?? "Opportunity already approved."),
      );
    } catch (approveError) {
      setError(
        approveError instanceof Error
          ? approveError.message
          : "Unable to approve opportunity.",
      );
    } finally {
      setBusyId(null);
    }
  }

  async function dismissOpportunity(opportunity: MoneyOpportunity) {
    const confirmed = window.confirm(
      `Dismiss ${formatOpportunityType(opportunity.type)}?`,
    );

    if (!confirmed) {
      return;
    }

    try {
      setBusyId(opportunity.id);

      setError(null);

      setMessage(null);

      const response = await apiFetch(
        `${API_BASE_URL}/money-opportunities/${opportunity.id}/dismiss`,
        {
          method: "POST",
        },
      );

      if (!response.ok) {
        throw new Error(
          await responseError(response, "Unable to dismiss opportunity."),
        );
      }

      await loadOpportunities();

      setMessage(`${formatOpportunityType(opportunity.type)} dismissed.`);
    } catch (dismissError) {
      setError(
        dismissError instanceof Error
          ? dismissError.message
          : "Unable to dismiss opportunity.",
      );
    } finally {
      setBusyId(null);
    }
  }

  return (
    <section className="rounded-2xl border border-emerald-200 bg-white shadow-sm">
      <div className="border-b border-emerald-100 bg-emerald-50 p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-emerald-700">
              LoadPacket Autopilot
            </p>

            <h2 className="mt-2 text-xl font-bold text-slate-950">
              Money Found
            </h2>

            <p className="mt-1 text-sm text-slate-600">
              Reimbursements and additional charges detected from load
              documents.
            </p>
          </div>

          <div className="text-right">
            <p className="text-xs font-bold uppercase tracking-wide text-slate-600">
              Potential Value
            </p>

            <p className="mt-1 text-2xl font-bold text-emerald-700">
              {formatMoney(moneyFound)}
            </p>
          </div>
        </div>
      </div>

      <div className="p-6">
        {error && (
          <div className="mb-5 rounded-xl border border-red-200 bg-red-50 p-4 text-sm font-semibold text-red-700">
            {error}
          </div>
        )}

        {message && (
          <div className="mb-5 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm font-semibold text-emerald-700">
            {message}
          </div>
        )}

        {isLoading ? (
          <p className="text-sm text-slate-600">
            Checking load documents for money opportunities...
          </p>
        ) : opportunities.length === 0 ? (
          <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-6 text-center">
            <p className="font-semibold text-slate-800">
              No money opportunities detected
            </p>

            <p className="mt-1 text-sm text-slate-600">
              Lumper receipts, scale tickets, detention, and other reimbursable
              charges will appear here.
            </p>

            <button
              type="button"
              disabled={scanning}
              onClick={() => void scanDocuments()}
              className="mt-4 rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-bold text-slate-700 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-100 disabled:bg-slate-100 disabled:text-slate-600"
            >
              {scanning ? "Scanning..." : "Scan Documents"}
            </button>
          </div>
        ) : (
          <>
            <div className="space-y-4">
              {opportunities.map((opportunity) => (
                <OpportunityCard
                  key={opportunity.id}
                  opportunity={opportunity}
                  amount={amounts[opportunity.id] ?? ""}
                  busy={busyId === opportunity.id}
                  onAmountChange={(value) =>
                    setAmounts((current) => ({
                      ...current,

                      [opportunity.id]: value,
                    }))
                  }
                  onSave={() => void saveAmount(opportunity)}
                  onApprove={() => void approveOpportunity(opportunity)}
                  onDismiss={() => void dismissOpportunity(opportunity)}
                />
              ))}
            </div>

            <div className="mt-5 flex flex-wrap items-center justify-between gap-4 border-t border-slate-200 pt-5">
              <div className="flex gap-5 text-sm">
                <span className="text-slate-600">
                  Needs Review:{" "}
                  <strong className="text-slate-950">{detected.length}</strong>
                </span>

                <span className="text-slate-600">
                  Approved:{" "}
                  <strong className="text-emerald-700">
                    {approved.length}
                  </strong>
                </span>
              </div>

              <button
                type="button"
                disabled={scanning}
                onClick={() => void scanDocuments()}
                className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-bold text-slate-700 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-100 disabled:bg-slate-100 disabled:text-slate-600"
              >
                {scanning ? "Scanning..." : "Rescan Documents"}
              </button>
            </div>
          </>
        )}
      </div>
    </section>
  );
}

function OpportunityCard({
  opportunity,
  amount,
  busy,
  onAmountChange,
  onSave,
  onApprove,
  onDismiss,
}: {
  opportunity: MoneyOpportunity;

  amount: string;

  busy: boolean;

  onAmountChange: (value: string) => void;

  onSave: () => void;

  onApprove: () => void;

  onDismiss: () => void;
}) {
  const detected = opportunity.status === "DETECTED";

  const approved = opportunity.status === "APPROVED";

  const dismissed = opportunity.status === "DISMISSED";

  return (
    <article className="rounded-xl border border-slate-200 p-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="font-bold text-slate-950">
              {formatOpportunityType(opportunity.type)}
            </h3>

            <OpportunityStatus status={opportunity.status} />
          </div>

          <p className="mt-2 text-sm text-slate-600">
            {opportunity.description ?? "Potential reimbursable load expense."}
          </p>

          {opportunity.sourceDocument?.originalFileName && (
            <p className="mt-2 text-xs text-slate-600">
              Source: {opportunity.sourceDocument.originalFileName}
            </p>
          )}

          <p className="mt-1 text-xs text-slate-600">
            Detected {formatDateTime(opportunity.detectedAt)}
          </p>
        </div>

        {opportunity.amount && (
          <div className="text-right">
            <p className="text-xs font-bold uppercase tracking-wide text-slate-600">
              Amount
            </p>

            <p className="mt-1 text-xl font-bold text-emerald-700">
              {formatMoney(Number(opportunity.amount))}
            </p>
          </div>
        )}
      </div>

      {detected && (
        <div className="mt-5 rounded-xl bg-slate-50 p-4">
          <label className="text-xs font-bold uppercase tracking-wide text-slate-600">
            Reimbursement Amount
          </label>

          <div className="mt-2 flex items-center rounded-xl border border-slate-300 bg-white focus-within:border-blue-500">
            <span className="pl-4 font-semibold text-slate-600">$</span>

            <input
              type="text"
              inputMode="decimal"
              value={amount}
              disabled={busy}
              onChange={(event) =>
                onAmountChange(sanitizeMoneyInput(event.target.value))
              }
              placeholder="0.00"
              className="w-full rounded-xl bg-transparent px-2 py-3 text-sm font-semibold text-slate-950 outline-none disabled:opacity-100 disabled:bg-slate-100 disabled:text-slate-600"
            />
          </div>

          <p className="mt-2 text-xs text-slate-600">
            Confirm the amount shown on the receipt before approving.
          </p>

          <div className="mt-4 flex flex-wrap gap-2">
            <button
              type="button"
              disabled={busy || !amount.trim()}
              onClick={onApprove}
              className="rounded-xl bg-emerald-700 px-4 py-2.5 text-sm font-bold text-white hover:bg-emerald-800 disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-600"
            >
              {busy ? "Working..." : "Approve"}
            </button>

            <button
              type="button"
              disabled={busy || !amount.trim()}
              onClick={onSave}
              className="rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-bold text-slate-700 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-100 disabled:bg-slate-100 disabled:text-slate-600"
            >
              Save Amount
            </button>

            <button
              type="button"
              disabled={busy}
              onClick={onDismiss}
              className="rounded-xl px-4 py-2.5 text-sm font-bold text-red-700 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-100 disabled:bg-slate-100 disabled:text-slate-600"
            >
              Dismiss
            </button>
          </div>
        </div>
      )}

      {approved && (
        <div className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 p-4">
          <p className="text-sm font-bold text-emerald-800">
            Approved for recovery
          </p>

          <p className="mt-1 text-xs text-emerald-700">
            This opportunity can be included in the broker charge/amendment
            workflow.
          </p>
        </div>
      )}

      {dismissed && (
        <div className="mt-4 rounded-xl bg-slate-100 p-4">
          <p className="text-sm font-semibold text-slate-600">
            Dismissed � no owner action required.
          </p>
        </div>
      )}
    </article>
  );
}

function OpportunityStatus({ status }: { status: string }) {
  const className =
    status === "APPROVED"
      ? "bg-emerald-100 text-emerald-700"
      : status === "DETECTED"
        ? "bg-amber-100 text-amber-800"
        : status === "BILLED"
          ? "bg-blue-100 text-blue-700"
          : "bg-slate-100 text-slate-600";

  return (
    <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${className}`}>
      {status === "DETECTED"
        ? "NEEDS REVIEW"
        : formatStatus(status).toUpperCase()}
    </span>
  );
}

function formatOpportunityType(value: string) {
  const labels: Record<string, string> = {
    LUMPER_REIMBURSEMENT: "Lumper Reimbursement",

    SCALE_REIMBURSEMENT: "Scale Reimbursement",

    DETENTION: "Detention",

    LAYOVER: "Layover",

    TONU: "Truck Ordered Not Used",

    OTHER: "Other Charge",
  };

  return labels[value] ?? formatStatus(value);
}

function parseMoney(value: string | null) {
  if (!value) {
    return 0;
  }

  const parsed = Number(value);

  return Number.isFinite(parsed) ? parsed : 0;
}

function formatMoney(value: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",

    currency: "USD",
  }).format(value);
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Chicago",

    month: "short",

    day: "numeric",

    hour: "numeric",

    minute: "2-digit",
  }).format(new Date(value));
}

function formatStatus(value: string) {
  return value
    .replaceAll("_", " ")
    .toLowerCase()
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function sanitizeMoneyInput(value: string) {
  const cleaned = value.replace(/[^0-9.]/g, "");

  const [whole = "", ...rest] = cleaned.split(".");

  if (rest.length === 0) {
    return whole;
  }

  return `${whole}.${rest.join("").slice(0, 2)}`;
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
