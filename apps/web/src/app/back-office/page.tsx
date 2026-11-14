"use client";
import { InvoiceCharges } from "@/components/invoice-charges";
import { apiFetch, API_BASE_URL } from "@/lib/api/api-fetch";

import Link from "next/link";

import { AppHeader } from "../../components/app-header";

import { useCallback, useEffect, useState } from "react";
import { inputClass } from "@/components/management-ui";

type Requirement = {
  id: string;
  documentType: string;
  requirement: string;
  status: string;
  blocking: boolean;
};

type QueueItem = {
  load: {
    id: string;
    loadNumber: string;
    brokerName: string;
    status: string;
    totalRate: string;
    paymentTermsDays?: number | null;
    effectivePaymentTermsDays?: number;
    paymentDueAt?: string | null;
    invoiceIssuedAt?: string | null;

    pickup: {
      facilityName: string | null;
      address: string;
    } | null;

    delivery: {
      facilityName: string | null;
      address: string;
    } | null;
  };

  driver: {
    id: string;
    name: string;
    assignmentStatus: string;
  } | null;

  readiness: {
    ready: boolean;
    blockingCount: number;
    requiredCount: number;
    satisfiedCount: number;
    requirements: Requirement[];
  };
};

type BillingDraft = {
  recipientName: string;
  recipientEmail: string;
  paymentTermsDays: string;
};

type SubmitBillingResponse = {
  submitted: boolean;
  message: string;

  load: {
    id: string;
    loadNumber: string;
    status: string;
    totalRate: string;
    invoiceNumber: string | null;
    invoiceIssuedAt: string | null;
    billingSubmittedAt: string | null;
    paymentTermsDays: number | null;
    paymentDueAt: string | null;
    billingRecipientName: string | null;
    billingRecipientEmail: string | null;
  };
};

export default function BackOfficePage() {
  const [loads, setLoads] = useState<QueueItem[]>([]);

  const [billingDrafts, setBillingDrafts] = useState<
    Record<string, BillingDraft>
  >({});

  const [isLoading, setIsLoading] = useState(true);

  const [generatingLoadId, setGeneratingLoadId] = useState<string | null>(null);

  const [downloadingLoadId, setDownloadingLoadId] = useState<string | null>(
    null,
  );

  const [submittingLoadId, setSubmittingLoadId] = useState<string | null>(null);

  const [error, setError] = useState<string | null>(null);

  const [message, setMessage] = useState<string | null>(null);

  const loadQueue = useCallback(async () => {
    const response = await apiFetch(`${API_BASE_URL}/back-office/queue`);

    if (!response.ok) {
      throw new Error(`Unable to load back-office queue (${response.status}).`);
    }

    const result = (await response.json()) as QueueItem[];

    setLoads(result);

    setBillingDrafts((current) => {
      const next = {
        ...current,
      };

      for (const item of result) {
        if (!next[item.load.id]) {
          next[item.load.id] = {
            recipientName: item.load.brokerName,

            recipientEmail: "",

            paymentTermsDays: "",
          };
        }
        if (item.load.invoiceIssuedAt && item.load.paymentTermsDays != null) {
          next[item.load.id] = { ...next[item.load.id], paymentTermsDays: String(item.load.paymentTermsDays) };
        }
      }

      return next;
    });
  }, []);

  useEffect(() => {
    async function initialize() {
      try {
        setIsLoading(true);
        setError(null);

        await loadQueue();
      } catch (loadError) {
        setError(
          loadError instanceof Error
            ? loadError.message
            : "Unable to load back-office queue.",
        );
      } finally {
        setIsLoading(false);
      }
    }

    void initialize();
  }, [loadQueue]);

  function updateBillingDraft(
    loadId: string,
    field: keyof BillingDraft,
    value: string,
  ) {
    setBillingDrafts((current) => ({
      ...current,

      [loadId]: {
        ...current[loadId],

        recipientName: current[loadId]?.recipientName ?? "",

        recipientEmail: current[loadId]?.recipientEmail ?? "",

        paymentTermsDays: current[loadId]?.paymentTermsDays ?? "",

        [field]: value,
      },
    }));
  }

  async function generateInvoice(loadId: string) {
    try {
      setGeneratingLoadId(loadId);

      setError(null);
      setMessage(null);

      const rawTerms = billingDrafts[loadId]?.paymentTermsDays.trim() ?? "";
      const terms = rawTerms === "" ? undefined : Number(rawTerms);
      if (terms !== undefined && (!Number.isInteger(terms) || terms < 0 || terms > 365)) {
        throw new Error("Payment terms must be a whole number from 0 to 365 days.");
      }

      const response = await apiFetch(
        `${API_BASE_URL}/back-office/loads/${loadId}/carrier-invoice`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(terms === undefined ? {} : { paymentTermsDays: terms }),
        },
      );

      if (!response.ok) {
        throw new Error(
          await responseError(response, "Unable to generate carrier invoice."),
        );
      }

      const result = (await response.json()) as {
        created: boolean;

        load: {
          status: string;
        };
      };

      await loadQueue();

      setMessage(
        result.created
          ? result.load.status === "PAYMENT_READY"
            ? "Carrier invoice generated. Load is Payment Ready."
            : "Carrier invoice generated."
          : "Carrier invoice already exists.",
      );
    } catch (generateError) {
      setError(
        generateError instanceof Error
          ? generateError.message
          : "Unable to generate carrier invoice.",
      );
    } finally {
      setGeneratingLoadId(null);
    }
  }

  async function downloadBillingPacket(loadId: string, loadNumber: string) {
    try {
      setDownloadingLoadId(loadId);

      setError(null);
      setMessage(null);

      const response = await apiFetch(
        `${API_BASE_URL}/back-office/loads/${loadId}/billing-packet`,
      );

      if (!response.ok) {
        throw new Error(
          await responseError(response, "Unable to generate billing packet."),
        );
      }

      const blob = await response.blob();

      const url = URL.createObjectURL(blob);

      const safeLoadNumber = loadNumber.replace(/[^a-zA-Z0-9-_]/g, "-");

      const anchor = document.createElement("a");

      anchor.href = url;

      anchor.download = `${safeLoadNumber}_Billing_Packet.pdf`;

      document.body.appendChild(anchor);

      anchor.click();

      anchor.remove();

      URL.revokeObjectURL(url);

      setMessage(`${loadNumber} billing packet downloaded.`);
    } catch (downloadError) {
      setError(
        downloadError instanceof Error
          ? downloadError.message
          : "Unable to download billing packet.",
      );
    } finally {
      setDownloadingLoadId(null);
    }
  }

  async function submitBilling(item: QueueItem) {
    const draft = billingDrafts[item.load.id];

    if (!draft) {
      setError("Billing details are missing.");

      return;
    }

    const recipientName = draft.recipientName.trim();

    const recipientEmail = draft.recipientEmail.trim();

    const paymentTermsDays = draft.paymentTermsDays.trim() === "" ? undefined : Number(draft.paymentTermsDays);

    if (!recipientName) {
      setError("Billing recipient name is required.");

      return;
    }

    if (
      paymentTermsDays !== undefined && (!Number.isInteger(paymentTermsDays) ||
      paymentTermsDays < 0 ||
      paymentTermsDays > 365)
    ) {
      setError("Payment terms must be a whole number from 0 to 365 days.");

      return;
    }

    try {
      setSubmittingLoadId(item.load.id);

      setError(null);
      setMessage(null);

      const body: {
        recipientName: string;
        recipientEmail?: string;
        paymentTermsDays?: number;
      } = {
        recipientName,
        paymentTermsDays,
      };

      if (recipientEmail) {
        body.recipientEmail = recipientEmail;
      }

      const response = await apiFetch(
        `${API_BASE_URL}/back-office/loads/${item.load.id}/submit-billing`,
        {
          method: "POST",

          headers: {
            "Content-Type": "application/json",
          },

          body: JSON.stringify(body),
        },
      );

      if (!response.ok) {
        throw new Error(
          await responseError(response, "Unable to submit billing."),
        );
      }

      const result = (await response.json()) as SubmitBillingResponse;

      await loadQueue();

      if (result.submitted) {
        setMessage(
          `${item.load.loadNumber} submitted for billing. Invoice ${result.load.invoiceNumber ?? ""} is now INVOICED.`,
        );
      } else {
        setMessage(result.message);
      }
    } catch (submitError) {
      setError(
        submitError instanceof Error
          ? submitError.message
          : "Unable to submit billing.",
      );
    } finally {
      setSubmittingLoadId(null);
    }
  }

  return (
    <main className="min-h-screen bg-slate-50">
      <AppHeader />

      <div className="mx-auto max-w-6xl px-4 sm:px-6 py-8">
        <div>
          <p className="text-sm font-bold uppercase tracking-wide text-slate-600">
            Payment Readiness
          </p>

          <h1 className="mt-2 text-3xl font-bold tracking-tight text-slate-950">
            Delivered Loads
          </h1>

          <p className="mt-2 max-w-2xl text-slate-600">
            Clear missing paperwork, prepare the billing packet, and submit
            completed loads for payment.
          </p>
        </div>

        {error && (
          <div className="mt-6 rounded-xl border border-red-200 bg-red-50 p-4">
            <p className="text-sm font-semibold text-red-700">{error}</p>
          </div>
        )}

        {message && (
          <div className="mt-6 rounded-xl border border-emerald-200 bg-emerald-50 p-4">
            <p className="text-sm font-semibold text-emerald-700">
              ✓ {message}
            </p>
          </div>
        )}

        {isLoading && (
          <div className="mt-8 rounded-2xl border border-slate-200 bg-white p-6">
            Loading back-office queue...
          </div>
        )}

        {!isLoading && loads.length === 0 && (
          <div className="mt-8 rounded-2xl border border-slate-200 bg-white p-8 text-center">
            <p className="font-bold text-slate-900">
              Back-office queue is clear
            </p>

            <p className="mt-2 text-sm text-slate-600">
              There are currently no delivered or Payment Ready loads waiting
              for billing.
            </p>
          </div>
        )}

        {!isLoading && loads.length > 0 && (
          <div className="mt-8 space-y-5">
            {loads.map((item) => {
              const draft = billingDrafts[item.load.id] ?? {
                recipientName: item.load.brokerName,

                recipientEmail: "",

                paymentTermsDays: "",
              };

              return (
                <div key={item.load.id}><LoadCard
                  item={item}
                  billingDraft={draft}
                  isGenerating={generatingLoadId === item.load.id}
                  isDownloading={downloadingLoadId === item.load.id}
                  isSubmitting={submittingLoadId === item.load.id}
                  onGenerateInvoice={() => void generateInvoice(item.load.id)}
                  onDownloadPacket={() =>
                    void downloadBillingPacket(
                      item.load.id,
                      item.load.loadNumber,
                    )
                  }
                  onBillingDraftChange={(field, value) =>
                    updateBillingDraft(item.load.id, field, value)
                  }
                  onSubmitBilling={() => void submitBilling(item)}
                /><InvoiceCharges loadId={item.load.id} paymentTermsDays={draft.paymentTermsDays} onChanged={()=>void loadQueue()} /></div>
              );
            })}
          </div>
        )}
      </div>
    </main>
  );
}

function LoadCard({
  item,
  billingDraft,
  isGenerating,
  isDownloading,
  isSubmitting,
  onGenerateInvoice,
  onDownloadPacket,
  onBillingDraftChange,
  onSubmitBilling,
}: {
  item: QueueItem;

  billingDraft: BillingDraft;

  isGenerating: boolean;

  isDownloading: boolean;

  isSubmitting: boolean;

  onGenerateInvoice: () => void;

  onDownloadPacket: () => void;

  onBillingDraftChange: (field: keyof BillingDraft, value: string) => void;

  onSubmitBilling: () => void;
}) {
  const invoiceRequirement = item.readiness.requirements.find(
    (requirement) => requirement.documentType === "CARRIER_INVOICE",
  );

  const needsInvoice = invoiceRequirement?.status === "MISSING";

  return (
    <article className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-5 p-6">
        <div>
          <div className="flex flex-wrap items-center gap-3">
            <Link
              href={`/loads/${item.load.id}`}
              className="text-xl font-bold text-blue-700 hover:underline"
            >
              {item.load.loadNumber}
            </Link>

            <StatusBadge status={item.load.status} />
            <Link href={`/back-office/loads/${item.load.id}/review`} className="text-sm font-semibold text-blue-700 hover:underline">Review Documents</Link>
          </div>

          <p className="mt-2 font-semibold text-slate-900">
            {item.load.brokerName}
          </p>

          <p className="mt-2 text-sm text-slate-600">{routeLabel(item)}</p>

          {item.driver && (
            <p className="mt-3 text-sm text-slate-600">
              Driver: <strong>{item.driver.name}</strong>
            </p>
          )}
        </div>

        <div className="text-right">
          <p className="text-xl font-bold text-slate-950">
            {formatMoney(item.load.totalRate)}
          </p>

          <ReadinessBadge
            ready={item.readiness.ready}
            blockingCount={item.readiness.blockingCount}
          />
        </div>
      </div>

      <div className="border-t border-slate-100 bg-slate-50 p-6">
        <p className="text-xs font-bold uppercase tracking-wide text-slate-600">
          Required Paperwork
        </p>

        <div className="mt-4 grid gap-3 md:grid-cols-3">
          {item.readiness.requirements.map((requirement) => (
            <RequirementCard key={requirement.id} requirement={requirement} />
          ))}
        </div>

        <label className="mt-5 block text-sm font-semibold text-slate-700">
          Payment Terms (days)
          <input type="number" min={0} max={365} step={1}
            className={inputClass}
            value={billingDraft.paymentTermsDays}
            disabled={isGenerating || isSubmitting || (!!item.load.invoiceIssuedAt && item.load.paymentTermsDays != null && !!item.load.paymentDueAt)}
            placeholder={`Use effective default: ${item.load.effectivePaymentTermsDays ?? 30}`}
            onChange={(event) => onBillingDraftChange("paymentTermsDays", event.target.value)} />
        </label>
        <p className="mt-2 text-sm text-slate-600">
          {item.load.invoiceIssuedAt && item.load.paymentTermsDays != null && item.load.paymentDueAt
            ? `Issued terms: ${item.load.paymentTermsDays} days. Due ${new Intl.DateTimeFormat("en-US", { timeZone: "America/Chicago", dateStyle: "medium" }).format(new Date(item.load.paymentDueAt))}. Terms are fixed in the invoice.`
            : `Leave blank to use agreed load terms, then company default (${item.load.effectivePaymentTermsDays ?? 30} effective days). Zero means due on the invoice date. Choose an override before generating the invoice.`}
          {" "}Billing dates use America/Chicago and calendar days.
        </p>
        {needsInvoice && <p className="mt-2 text-sm text-slate-600">The carrier name and available contact details come from Company Settings. Ask an Owner to complete missing company details.</p>}

        {needsInvoice && (
          <div className="mt-5">
            <button
              type="button"
              disabled={isGenerating}
              onClick={onGenerateInvoice}
              className="rounded-xl bg-slate-950 px-5 py-3.5 text-sm font-bold text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-600"
            >
              {isGenerating
                ? "Generating Invoice..."
                : "Generate Carrier Invoice"}
            </button>
          </div>
        )}

        {item.readiness.ready && (
          <>
            <div className="mt-5 rounded-xl border border-emerald-200 bg-emerald-50 p-4">
              <p className="font-bold text-emerald-900">✓ Payment Ready</p>

              <p className="mt-1 text-sm text-emerald-700">
                All required paperwork is present. The load can now be billed.
              </p>
            </div>

            <div className="mt-5">
              <button
                type="button"
                disabled={isDownloading}
                onClick={onDownloadPacket}
                className="rounded-xl border border-blue-200 bg-white px-5 py-3.5 text-sm font-bold text-blue-700 hover:bg-blue-50 disabled:cursor-not-allowed disabled:text-slate-600"
              >
                {isDownloading
                  ? "Preparing Packet..."
                  : "Download Billing Packet"}
              </button>
            </div>

            <div className="mt-6 rounded-2xl border border-slate-200 bg-white p-5">
              <div>
                <p className="text-xs font-bold uppercase tracking-wide text-slate-600">
                  Billing Submission
                </p>

                <h2 className="mt-1 text-lg font-bold text-slate-950">
                  Submit for Payment
                </h2>

                <p className="mt-1 text-sm text-slate-600">
                  Record where the billing packet was submitted and when payment
                  is due.
                </p>
              </div>

              <div className="mt-5 grid gap-4 md:grid-cols-2">
                <label className="block">
                  <span className="text-sm font-semibold text-slate-700">
                    Recipient Name
                  </span>

                  <input
                    type="text"
                    value={billingDraft.recipientName}
                    onChange={(event) =>
                      onBillingDraftChange("recipientName", event.target.value)
                    }
                    className="mt-2 w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm text-slate-950 outline-none focus:border-blue-500"
                    placeholder="Broker or factoring company"
                  />
                </label>

                <label className="block">
                  <span className="text-sm font-semibold text-slate-700">
                    Billing Email
                  </span>

                  <input
                    type="email"
                    value={billingDraft.recipientEmail}
                    onChange={(event) =>
                      onBillingDraftChange("recipientEmail", event.target.value)
                    }
                    className="mt-2 w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm text-slate-950 outline-none focus:border-blue-500"
                    placeholder="billing@example.com"
                  />
                </label>

              </div>

              <div className="mt-5 border-t border-slate-100 pt-5">
                <button
                  type="button"
                  disabled={isSubmitting}
                  onClick={onSubmitBilling}
                  className="rounded-xl bg-blue-700 px-6 py-3.5 text-sm font-bold text-white hover:bg-blue-600 disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-600"
                >
                  {isSubmitting ? "Submitting Billing..." : "Submit Billing"}
                </button>

                <p className="mt-3 text-xs text-slate-600">
                  This records the billing submission and changes the load from
                  Payment Ready to Invoiced.
                </p>
              </div>
            </div>
          </>
        )}
      </div>
    </article>
  );
}

function RequirementCard({ requirement }: { requirement: Requirement }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <p className="font-semibold text-slate-900">
        {formatDocumentType(requirement.documentType)}
      </p>

      <p
        className={`mt-2 text-sm font-bold ${
          requirement.blocking ? "text-red-700" : "text-emerald-700"
        }`}
      >
        {requirement.blocking
          ? requirement.status === 'RECEIVED' ? 'Awaiting review' : requirement.status === 'REJECTED' ? 'Rejected — needs re-upload' : 'Missing'
          : `✓ ${formatStatus(requirement.status)}`}
      </p>
    </div>
  );
}

function ReadinessBadge({
  ready,
  blockingCount,
}: {
  ready: boolean;
  blockingCount: number;
}) {
  if (ready) {
    return (
      <span className="mt-2 inline-block rounded-full bg-emerald-50 px-3 py-1 text-xs font-bold text-emerald-700">
        Payment Ready
      </span>
    );
  }

  return (
    <span className="mt-2 inline-block rounded-full bg-amber-50 px-3 py-1 text-xs font-bold text-amber-700">
      {blockingCount} {blockingCount === 1 ? "blocker" : "blockers"}
    </span>
  );
}

function StatusBadge({ status }: { status: string }) {
  return (
    <span className="inline-flex whitespace-nowrap rounded-full bg-slate-100 px-3 py-1 text-xs font-bold text-slate-700">
      {formatStatus(status)}
    </span>
  );
}

function routeLabel(item: QueueItem) {
  const pickup =
    item.load.pickup?.facilityName ?? item.load.pickup?.address ?? "Pickup";

  const delivery =
    item.load.delivery?.facilityName ??
    item.load.delivery?.address ??
    "Delivery";

  return `${pickup} → ${delivery}`;
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

function formatDocumentType(type: string) {
  const labels: Record<string, string> = {
    BOL: "Bill of Lading",

    POD: "Proof of Delivery",

    CARRIER_INVOICE: "Carrier Invoice",

    LUMPER_RECEIPT: "Lumper Receipt",

    SCALE_TICKET: "Scale Ticket",
  };

  return labels[type] ?? type;
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
