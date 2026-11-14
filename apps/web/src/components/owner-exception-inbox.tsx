"use client";
import { apiFetch, API_BASE_URL } from "@/lib/api/api-fetch";

import Link from "next/link";

import { useCallback, useEffect, useState } from "react";

type MoneyOpportunity = {
  id: string;
  type: string;
  status: string;
  amount: string | null;
  currency: string;
  description: string | null;
  detectedAt: string;
};

type OwnerException = {
  load: {
    id: string;
    loadNumber: string;
    status: string;
    brokerName: string;
    totalRate: string;
    currency: string;
  };

  driver: {
    id: string;
    name: string;
    assignmentStatus: string;
  } | null;

  action: {
    type: string;
    priority: string;
    label: string;
    message: string;
  };

  blockingDocuments: string[];

  blockedByPaperwork: boolean;

  moneyOpportunities: MoneyOpportunity[];

  moneyFound: string;
};

type OwnerExceptionsResponse = {
  generatedAt: string;

  summary: {
    needsAttention: number;
    revenueNeedingAttention: string;
    blockedByPaperwork: string;
    moneyFound: string;
  };

  exceptions: OwnerException[];
};

export function OwnerExceptionInbox() {
  const [data, setData] = useState<OwnerExceptionsResponse | null>(null);

  const [isLoading, setIsLoading] = useState(true);

  const [error, setError] = useState<string | null>(null);

  const loadExceptions = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
    const response = await apiFetch(
      `${API_BASE_URL}/autopilot/owner/exceptions`,
      {
        cache: "no-store",
      },
    );

    if (!response.ok) {
      throw new Error(`Unable to load owner exceptions (${response.status}).`);
    }

    const result = (await response.json()) as OwnerExceptionsResponse;

    setData(result);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Unable to load the exception inbox.');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    async function initialize() {
      try {
        setIsLoading(true);

        setError(null);

        await loadExceptions();
      } catch (loadError) {
        setError(
          loadError instanceof Error
            ? loadError.message
            : "Unable to load the exception inbox.",
        );
      } finally {
        setIsLoading(false);
      }
    }

    void initialize();
  }, [loadExceptions]);

  if (isLoading) {
    return (
      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <p className="text-sm font-semibold text-slate-600">
          Loading LoadPacket Autopilot...
        </p>
      </section>
    );
  }

  if (error) {
    return (
      <section role="alert" className="rounded-2xl border border-red-200 bg-red-50 p-6">
        <p className="font-bold text-red-700">Autopilot Exception Inbox</p>

        <p className="mt-2 text-sm text-red-600">{error}</p>

        <button
          type="button"
          onClick={() => {
            void loadExceptions();
          }}
          className="mt-4 rounded-lg bg-red-700 px-4 py-2 text-sm font-bold text-white hover:bg-red-600"
        >
          Retry
        </button>
      </section>
    );
  }

  if (!data) {
    return null;
  }

  return (
    <section className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
      <div className="border-b border-slate-200 bg-slate-950 px-6 py-6 text-white">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-blue-300">
              LoadPacket Autopilot
            </p>

            <h2 className="mt-2 text-xl font-bold">Active-load exceptions</h2>

            <p className="mt-2 max-w-2xl text-sm text-slate-300">
              Owner actions and detected or approved charge opportunities on booked through invoiced loads. Paid and canceled loads are excluded. Company documents and driver compliance are shown separately above.
            </p>
          </div>

          <div className="rounded-2xl bg-white/10 px-5 py-4 text-center">
            <p className="text-3xl font-bold">{data.summary.needsAttention}</p>

            <p className="mt-1 text-xs font-bold uppercase tracking-wide text-slate-300">
              Exception loads
            </p>
          </div>
        </div>
      </div>

      <div className="grid gap-px bg-slate-200 sm:grid-cols-3">
        <ExceptionMetric
          label="Value of exception loads"
          value={formatMoney(data.summary.revenueNeedingAttention)}
        />

        <ExceptionMetric
          label="Value awaiting paperwork action"
          value={formatMoney(data.summary.blockedByPaperwork)}
        />

        <ExceptionMetric
          label="Potential charges on exception loads"
          value={formatMoney(data.summary.moneyFound)}
          positive
        />
      </div>

      {data.exceptions.length === 0 ? (
        <div className="p-5">
          <h3 className="text-lg font-bold text-slate-950">
            No active-load exceptions reported
          </h3>

          <p className="mt-2 text-sm text-slate-600">
            This does not confirm that all paperwork or compliance checks are clear. Review the operations summary, document vault and driver records separately.
          </p>
        </div>
      ) : (
        <div className="divide-y divide-slate-200">
          {data.exceptions.map((exception) => (
            <ExceptionRow key={exception.load.id} exception={exception} />
          ))}
        </div>
      )}
    </section>
  );
}

function ExceptionRow({ exception }: { exception: OwnerException }) {
  const priority = priorityStyle(exception.action.priority);

  return (
    <article className="p-6">
      <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-3">
            <Link
              href={`/loads/${exception.load.id}`}
              className="text-xl font-bold text-slate-950 hover:text-blue-700 hover:underline"
            >
              {exception.load.loadNumber}
            </Link>

            <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-bold text-slate-700">
              {formatStatus(exception.load.status)}
            </span>

            <span
              className={`rounded-full px-3 py-1 text-xs font-bold ${priority}`}
            >
              {exception.action.priority}
            </span>
          </div>

          <p className="mt-2 text-sm font-medium text-slate-600">
            {exception.load.brokerName}
          </p>

          <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-4">
            <p className="text-xs font-bold uppercase tracking-wide text-amber-700">
              Next Owner Action
            </p>

            <p className="mt-1 font-bold text-amber-950">
              {exception.action.label}
            </p>

            <p className="mt-1 text-sm text-amber-800">
              {exception.action.message}
            </p>
          </div>

          {exception.blockingDocuments.length > 0 && (
            <div className="mt-4">
              <p className="text-xs font-bold uppercase tracking-wide text-red-600">
                Blocking Documents
              </p>

              <div className="mt-2 flex flex-wrap gap-2">
                {exception.blockingDocuments.map((documentType) => (
                  <span
                    key={documentType}
                    className="rounded-full bg-red-100 px-3 py-1 text-xs font-bold text-red-700"
                  >
                    {formatDocumentType(documentType)}
                  </span>
                ))}
              </div>
            </div>
          )}

          {exception.driver && (
            <p className="mt-4 text-sm text-slate-600">
              Driver:{" "}
              <span className="font-semibold text-slate-700">
                {exception.driver.name}
              </span>
              {" · "}
              {formatStatus(exception.driver.assignmentStatus)}
            </p>
          )}
        </div>

        <div className="shrink-0 lg:text-right">
          <p className="text-xs font-bold uppercase tracking-wide text-slate-600">
            Load Value
          </p>

          <p className="mt-1 text-2xl font-bold text-slate-950">
            {formatMoney(exception.load.totalRate)}
          </p>

          {Number(exception.moneyFound) > 0 && (
            <p className="mt-2 text-sm font-bold text-emerald-700">
              {formatMoney(exception.moneyFound)} in potential charges
            </p>
          )}

          <Link
            href={`/loads/${exception.load.id}`}
            className="mt-5 inline-flex w-full items-center justify-center rounded-xl bg-blue-700 px-5 py-3 text-sm font-bold text-white hover:bg-blue-600 lg:w-auto"
          >
            Handle Exception
          </Link>
        </div>
      </div>
    </article>
  );
}

function ExceptionMetric({
  label,
  value,
  positive = false,
}: {
  label: string;
  value: string;
  positive?: boolean;
}) {
  return (
    <div className="bg-white p-5">
      <p className="text-xs font-bold uppercase tracking-wide text-slate-600">
        {label}
      </p>

      <p
        className={`mt-2 text-2xl font-bold ${
          positive ? "text-emerald-700" : "text-slate-950"
        }`}
      >
        {value}
      </p>
    </div>
  );
}

function priorityStyle(priority: string) {
  switch (priority) {
    case "HIGH":
      return "bg-red-100 text-red-700";

    case "NORMAL":
      return "bg-amber-100 text-amber-700";

    case "LOW":
      return "bg-slate-100 text-slate-600";

    default:
      return "bg-slate-100 text-slate-600";
  }
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

function formatDocumentType(value: string) {
  const names: Record<string, string> = {
    BOL: "Bill of Lading",

    POD: "Proof of Delivery",

    CARRIER_INVOICE: "Carrier Invoice",

    LUMPER_RECEIPT: "Lumper Receipt",

    SCALE_TICKET: "Scale Ticket",

    RATE_CONFIRMATION: "Rate Confirmation",
  };

  return names[value] ?? formatStatus(value);
}

function formatStatus(value: string) {
  return value
    .replaceAll("_", " ")
    .toLowerCase()
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}
