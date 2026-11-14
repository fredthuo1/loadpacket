"use client";
import { InvoiceCharges } from "@/components/invoice-charges";
import { BrokerConnect } from '@/components/broker-connect';
import { DetentionTerms } from '@/components/detention-terms';
import { useCurrentUser } from "@/components/auth-provider";
import { DocumentReview } from "@/components/document-review";
import { apiFetch, API_BASE_URL } from "@/lib/api/api-fetch";

import { LoadManagement } from "@/components/load-management";
import Link from "next/link";
import { useParams } from "next/navigation";

import {
  useCallback,
  useEffect, useRef,
  useMemo,
  useState,
  type ReactNode,
} from "react";

import { AppHeader } from "../../../components/app-header";

const BUSINESS_TIME_ZONE = "America/Chicago";

const lifecycle = [
  "BOOKED",
  "IN_TRANSIT",
  "DELIVERED",
  "PAYMENT_READY",
  "INVOICED",
  "PAID",
];

type Requirement = {
  id: string;
  documentType: string;
  requirement: string;
  status: string;
  blocking: boolean;
};

type DriverOption = {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
};

type Overview = {
  load: {
    id: string;
    loadNumber: string;
    status: string;
    brokerName: string;
    brokerContact: string | null;
    equipment: string | null;
    currency: string;
    linehaul: string | null;
    fuelSurcharge: string | null;
    totalRate: string;
    createdAt: string;
    updatedAt: string;
  };

  route: {
    stops: Array<{
      id: string;
      sequence: number;
      type: string;
      facilityName: string | null;
      address: string;
      appointmentText: string | null;
      referenceNumber: string | null;
    }>;
  };

  driver: {
    id: string;
    name: string;
    phone: string | null;
    email: string | null;
    assignmentStatus: string;
    assignedAt: string;
  } | null;

  paperwork: {
    requiredCount: number;
    blockingCount: number;
    ready: boolean;
    requirements: Requirement[];
  };

  billing: {
    invoiceNumber: string | null;
    invoiceIssuedAt: string | null;
    billingSubmittedAt: string | null;
    paymentTermsDays: number | null;
    paymentDueAt: string | null;
    billingRecipientName: string | null;
    billingRecipientEmail: string | null;
    amountPaid: string | null;
    paidAt: string | null;
    balanceDue: string;
  };

  availableDrivers: DriverOption[];
};

type AutopilotAction = {
  type: string;
  priority: string;
  label: string;
  message: string;
};

type AutopilotTimelineEvent = {
  id?: string;
  type: string;
  label?: string;
  actorType?: string | null;
  actorId?: string | null;
  actorName?: string | null;
  occurredAt: string;
  metadata?: Record<string, unknown> | null;
};

type AutopilotResponse = {
  load: {
    id: string;
    loadNumber: string;
    status: string;
  };

  driver?: {
    id: string;
    name: string;
    assignmentStatus: string;
  } | null;

  ownerAction: AutopilotAction;

  paperwork?: {
    required?: {
      complete: number;
      total: number;
      missing?: string[];
    };
  };

  moneyOpportunities?: Array<{
    id: string;
    type: string;
    status: string;
    amount: string | null;
    currency: string;
  }>;

  timeline: AutopilotTimelineEvent[];
};

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

type ScanMoneyResponse = {
  createdCount: number;
  opportunities: MoneyOpportunity[];
};

export default function LoadDetailPage() {
  const user = useCurrentUser();
  const canFinance = user?.role === "OWNER" || user?.role === "BACK_OFFICE";
  const canDispatch = user?.role === "OWNER" || user?.role === "DISPATCHER";
  const params = useParams<{
    loadId: string;
  }>();

  const loadId = params.loadId;

  const [managementToken, setManagementToken] = useState("");
  const assignmentRetry = useRef<{ fingerprint: string; key: string } | null>(null);
  const [overview, setOverview] = useState<Overview | null>(null);

  const [autopilot, setAutopilot] = useState<AutopilotResponse | null>(null);

  const [opportunities, setOpportunities] = useState<MoneyOpportunity[]>([]);

  const [opportunityAmounts, setOpportunityAmounts] = useState<
    Record<string, string>
  >({});

  const [selectedDriverId, setSelectedDriverId] = useState("");

  const [isLoading, setIsLoading] = useState(true);

  const [isAssigning, setIsAssigning] = useState(false);

  const [isGeneratingInvoice, setIsGeneratingInvoice] = useState(false);

  const [scanningMoney, setScanningMoney] = useState(false);

  const [busyOpportunityId, setBusyOpportunityId] = useState<string | null>(
    null,
  );

  const [error, setError] = useState<string | null>(null);

  const [message, setMessage] = useState<string | null>(null);

  const loadOverview = useCallback(async () => {
    const response = await apiFetch(`${API_BASE_URL}/owner/loads/${loadId}`, {
      cache: "no-store",
    });

    if (!response.ok) {
      throw new Error(
        await responseError(
          response,
          `Unable to load load details (${response.status}).`,
        ),
      );
    }

    const result = (await response.json()) as Overview;

    setOverview(result);

    setSelectedDriverId(
      (current) => current || result.availableDrivers[0]?.id || "",
    );
  }, [loadId]);

  const loadAutopilot = useCallback(async () => {
    const response = await apiFetch(
      `${API_BASE_URL}/autopilot/loads/${loadId}`,
      {
        cache: "no-store",
      },
    );

    if (!response.ok) {
      throw new Error(
        await responseError(response, "Unable to load LoadPacket Autopilot."),
      );
    }

    const result = (await response.json()) as AutopilotResponse;

    setAutopilot(result);
  }, [loadId]);

  const loadMoneyOpportunities = useCallback(async () => {
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

    setOpportunityAmounts((current) => {
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

  const refreshPage = useCallback(async () => {
    await Promise.all([
      loadOverview(),
      loadAutopilot(),
      loadMoneyOpportunities(),
    ]);
  }, [loadOverview, loadAutopilot, loadMoneyOpportunities]);

  const scanMoneyOpportunities = useCallback(
    async (silent = false) => {
      if (!canFinance) return;
      try {
        setScanningMoney(true);

        const response = await apiFetch(
          `${API_BASE_URL}/money-opportunities/loads/${loadId}/scan`,
          {
            method: "POST",
          },
        );

        if (!response.ok) {
          throw new Error(
            await responseError(
              response,
              "Unable to scan load documents for money opportunities.",
            ),
          );
        }

        const result = (await response.json()) as ScanMoneyResponse;

        if (!silent) {
          setMessage(
            result.createdCount > 0
              ? `${result.createdCount} new money opportunity${
                  result.createdCount === 1 ? "" : "ies"
                } detected.`
              : "No new money opportunities were found.",
          );
        }

        await Promise.all([loadMoneyOpportunities(), loadAutopilot()]);
      } finally {
        setScanningMoney(false);
      }
    },
    [loadId, canFinance, loadAutopilot, loadMoneyOpportunities],
  );

  useEffect(() => {
    async function initialize() {
      try {
        setIsLoading(true);

        setError(null);

        /*
         * The scan endpoint is idempotent.
         *
         * Opening the Owner load therefore
         * checks captured receipts without
         * creating duplicates.
         */
        await scanMoneyOpportunities(true);

        await refreshPage();
      } catch (loadError) {
        setError(
          loadError instanceof Error
            ? loadError.message
            : "Unable to load load details.",
        );
      } finally {
        setIsLoading(false);
      }
    }

    void initialize();
  }, [refreshPage, scanMoneyOpportunities]);

  async function assignDriver() {
    if (!selectedDriverId) {
      setError("Select a driver first.");

      return;
    }

    if (!managementToken) { setError("Refresh management options before assigning."); return; }
    const reason = window.prompt("Reason for assigning or reassigning this Driver (at least 3 characters):");
    if (!reason || reason.trim().length < 3) { setError("An assignment reason of at least 3 characters is required."); return; }
    const fingerprint = JSON.stringify({driverId: selectedDriverId, expectedToken: managementToken, reason: reason.trim()});
    if (assignmentRetry.current?.fingerprint !== fingerprint) assignmentRetry.current = { fingerprint, key: crypto.randomUUID() };
    try {
      setIsAssigning(true);

      setError(null);

      setMessage(null);

      const response = await apiFetch(
        `${API_BASE_URL}/loads/${loadId}/assign-driver`,
        {
          method: "POST",

          headers: {
            "Content-Type": "application/json",
          },

          body: JSON.stringify({
            driverId: selectedDriverId,
            expectedToken: managementToken, reason: reason.trim(), idempotencyKey: assignmentRetry.current.key,
          }),
        },
      );

      if (!response.ok) {
        throw new Error(
          await responseError(response, "Unable to assign driver."),
        );
      }

      await refreshPage();

      assignmentRetry.current = null;
      setMessage("Driver assigned successfully.");
    } catch (assignError) {
      setError(
        assignError instanceof Error
          ? assignError.message
          : "Unable to assign driver.",
      );
    } finally {
      setIsAssigning(false);
    }
  }

  async function generateCarrierInvoice() {
    const confirmed = window.confirm(
      "Generate the Carrier Invoice for this load?",
    );

    if (!confirmed) {
      return;
    }

    try {
      setIsGeneratingInvoice(true);

      setError(null);

      setMessage(null);

      const response = await apiFetch(
        `${API_BASE_URL}/back-office/loads/${loadId}/carrier-invoice`,
        {
          method: "POST",
        },
      );

      if (!response.ok) {
        throw new Error(
          await responseError(response, "Unable to generate Carrier Invoice."),
        );
      }

      const result = (await response.json()) as {
        created?: boolean;
        message?: string;
        invoice?: {
          invoiceNumber?: string | null;
        };
      };

      await refreshPage();

      setMessage(
        result.created
          ? `Carrier Invoice ${
              result.invoice?.invoiceNumber ?? ""
            } generated successfully.`.trim()
          : (result.message ?? "Carrier Invoice already exists."),
      );
    } catch (invoiceError) {
      setError(
        invoiceError instanceof Error
          ? invoiceError.message
          : "Unable to generate Carrier Invoice.",
      );
    } finally {
      setIsGeneratingInvoice(false);
    }
  }

  async function saveOpportunityAmount(opportunity: MoneyOpportunity) {
    const amount = opportunityAmounts[opportunity.id]?.trim();

    if (!amount) {
      setError("Enter a reimbursement amount first.");

      return;
    }

    try {
      setBusyOpportunityId(opportunity.id);

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
          await responseError(response, "Unable to save reimbursement amount."),
        );
      }

      await Promise.all([loadMoneyOpportunities(), loadAutopilot()]);

      setMessage(`${formatOpportunityType(opportunity.type)} amount saved.`);
    } catch (amountError) {
      setError(
        amountError instanceof Error
          ? amountError.message
          : "Unable to save reimbursement amount.",
      );
    } finally {
      setBusyOpportunityId(null);
    }
  }

  async function approveOpportunity(opportunity: MoneyOpportunity) {
    const amount = opportunityAmounts[opportunity.id]?.trim();

    if (!amount && !opportunity.amount) {
      setError("Enter the reimbursement amount before approving.");

      return;
    }

    try {
      setBusyOpportunityId(opportunity.id);

      setError(null);

      setMessage(null);

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
              "Unable to save reimbursement amount.",
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
          await responseError(response, "Unable to approve money opportunity."),
        );
      }

      await refreshPage();

      setMessage(`${formatOpportunityType(opportunity.type)} approved.`);
    } catch (approveError) {
      setError(
        approveError instanceof Error
          ? approveError.message
          : "Unable to approve money opportunity.",
      );
    } finally {
      setBusyOpportunityId(null);
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
      setBusyOpportunityId(opportunity.id);

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
          await responseError(response, "Unable to dismiss money opportunity."),
        );
      }

      await refreshPage();

      setMessage(`${formatOpportunityType(opportunity.type)} dismissed.`);
    } catch (dismissError) {
      setError(
        dismissError instanceof Error
          ? dismissError.message
          : "Unable to dismiss money opportunity.",
      );
    } finally {
      setBusyOpportunityId(null);
    }
  }

  const activeMoneyOpportunities = useMemo(
    () =>
      opportunities.filter(
        (opportunity) =>
          opportunity.status === "DETECTED" ||
          opportunity.status === "APPROVED",
      ),
    [opportunities],
  );

  const moneyFound = useMemo(
    () =>
      activeMoneyOpportunities.reduce(
        (total, opportunity) => total + moneyToCents(opportunity.amount),
        BigInt(0),
      ),
    [activeMoneyOpportunities],
  );

  const detectedCount = opportunities.filter(
    (opportunity) => opportunity.status === "DETECTED",
  ).length;

  const approvedCount = opportunities.filter(
    (opportunity) => opportunity.status === "APPROVED",
  ).length;

  return (
    <main className="min-h-screen bg-slate-50">
      <AppHeader />

      <div className="mx-auto max-w-6xl px-4 sm:px-6 py-8">
        {error && <Message tone="error">{error}</Message>}

        {message && <Message tone="success">{message}</Message>}

        {isLoading && (
          <div className="rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
            Loading load details...
          </div>
        )}

        {!isLoading && overview && (
          <>
            <section className="flex flex-wrap items-start justify-between gap-5">
              <div>
                <Link
                  href="/"
                  className="text-sm font-semibold text-blue-700 hover:underline"
                >
                  Back to Owner
                </Link>

                <div className="mt-3 flex flex-wrap items-center gap-3">
                  <h1 className="text-3xl font-bold tracking-tight text-slate-950">
                    {overview.load.loadNumber}
                  </h1>

                  <StatusBadge status={overview.load.status} />
                </div>

                <p className="mt-2 text-lg font-semibold text-slate-700">
                  {overview.load.brokerName}
                </p>
              </div>

              <div className="text-right">
                <p className="text-sm font-semibold text-slate-600">
                  Load Revenue
                </p>

                <p className="mt-1 text-3xl font-bold text-slate-950">
                  {formatMoney(overview.load.totalRate, overview.load.currency)}
                </p>
              </div>
            </section>

            {canFinance && <Link href={`/finance/loads/${loadId}`} className="mb-4 inline-block rounded-xl border bg-white px-4 py-2 font-semibold text-blue-700">Load Financials</Link>}
            {autopilot && canFinance && (
              <div className="mt-8">
                <OwnerAutopilotAction
                  action={autopilot.ownerAction}
                  loadId={loadId}
                  generatingInvoice={isGeneratingInvoice}
                  onGenerateInvoice={generateCarrierInvoice}
                />
              </div>
            )}

            <Lifecycle status={overview.load.status} />
            {canFinance && <InvoiceCharges loadId={loadId} onChanged={()=>void refreshPage()} />}
            {canDispatch && <LoadManagement loadId={loadId} revision={overview} onToken={setManagementToken} onChanged={refreshPage} />}

            <section className="mt-8 grid gap-6 xl:grid-cols-3">
              <div className="space-y-6 xl:col-span-2">
                <Card title="Route" description="Pickup and delivery details.">
                  <div className="space-y-4">
                    {overview.route.stops.map((stop) => (
                      <div
                        key={stop.id}
                        className="rounded-xl border border-slate-200 p-4"
                      >
                        <div className="flex items-center justify-between">
                          <p className="text-xs font-bold uppercase tracking-wide text-slate-600">
                            {stop.type}
                          </p>

                          <span className="text-xs text-slate-600">
                            Stop {stop.sequence}
                          </span>
                        </div>

                        <p className="mt-2 font-bold text-slate-950">
                          {stop.facilityName ?? stop.address}
                        </p>

                        {stop.facilityName && (
                          <p className="mt-1 text-sm text-slate-600">
                            {stop.address}
                          </p>
                        )}

                        {stop.appointmentText && (
                          <p className="mt-2 text-sm text-slate-600">
                            Appointment: {stop.appointmentText}
                          </p>
                        )}

                        {stop.referenceNumber && (
                          <p className="mt-1 text-sm text-slate-600">
                            Reference: {stop.referenceNumber}
                          </p>
                        )}
                      </div>
                    ))}
                  </div>
                </Card>

                {canFinance && <DocumentReview loadId={loadId} onChange={loadOverview} />}
                <Card
                  title="Paperwork"
                  description={`${overview.paperwork.requiredCount} required documents, ${overview.paperwork.blockingCount} blocking.`}
                >
                  <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                    {overview.paperwork.requirements.map((requirement) => (
                      <div
                        key={requirement.id}
                        className="rounded-xl border border-slate-200 p-4"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <p className="font-semibold text-slate-950">
                            {formatDocumentType(requirement.documentType)}
                          </p>

                          {requirement.requirement === "CONDITIONAL" && (
                            <span className="inline-flex whitespace-nowrap rounded-full bg-slate-100 px-2 py-1 text-[10px] font-bold uppercase text-slate-600">
                              Optional
                            </span>
                          )}
                        </div>

                        <p
                          className={`mt-2 text-sm font-bold ${
                            requirement.blocking
                              ? "text-red-700"
                              : requirement.status === "MISSING"
                                ? "text-slate-600"
                                : "text-emerald-700"
                          }`}
                        >
                          {requirement.requirement === "CONDITIONAL" &&
                          requirement.status === "MISSING"
                            ? "Optional - Not provided"
                            : formatStatus(requirement.status)}
                        </p>
                      </div>
                    ))}
                  </div>
                </Card>

                <section className="overflow-hidden rounded-2xl border border-emerald-200 bg-white shadow-sm">
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
                          Potential reimbursements detected from load documents.
                        </p>
                      </div>

                      <div className="text-right">
                        <p className="text-xs font-bold uppercase tracking-wide text-slate-600">
                          Potential Value
                        </p>

                        <p className="mt-1 text-2xl font-bold text-emerald-700">
                          {formatMoney(moneyFound, overview.load.currency)}
                        </p>
                      </div>
                    </div>
                  </div>

                  <div className="p-6">
                    {opportunities.length === 0 ? (
                      <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-6 text-center">
                        <p className="font-semibold text-slate-800">
                          No money opportunities detected
                        </p>

                        <p className="mt-1 text-sm text-slate-600">
                          Lumper receipts, scale tickets, detention, layovers,
                          and other reimbursable charges will appear here.
                        </p>

                        {canFinance && (
                          <button
                            type="button"
                            disabled={scanningMoney}
                            onClick={() => {
                              setError(null);

                              setMessage(null);

                              void scanMoneyOpportunities().catch(
                                (scanError) => {
                                  setError(
                                    scanError instanceof Error
                                      ? scanError.message
                                      : "Unable to scan documents.",
                                  );
                                },
                              );
                            }}
                            className="mt-4 rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-bold text-slate-700 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-100 disabled:bg-slate-100 disabled:text-slate-600"
                          >
                            {scanningMoney ? "Scanning..." : "Scan Documents"}
                          </button>
                        )}
                      </div>
                    ) : (
                      <>
                        <div className="space-y-4">
                          {opportunities.map((opportunity) => (
                            <MoneyOpportunityCard
                              readOnly={!canFinance}
                              key={opportunity.id}
                              opportunity={opportunity}
                              amount={opportunityAmounts[opportunity.id] ?? ""}
                              busy={busyOpportunityId === opportunity.id}
                              onAmountChange={(value) =>
                                setOpportunityAmounts((current) => ({
                                  ...current,

                                  [opportunity.id]: value,
                                }))
                              }
                              onSave={() =>
                                void saveOpportunityAmount(opportunity)
                              }
                              onApprove={() =>
                                void approveOpportunity(opportunity)
                              }
                              onDismiss={() =>
                                void dismissOpportunity(opportunity)
                              }
                            />
                          ))}
                        </div>

                        <div className="mt-5 flex flex-wrap items-center justify-between gap-4 border-t border-slate-200 pt-5">
                          <div className="flex flex-wrap gap-5 text-sm">
                            <span className="text-slate-600">
                              Needs Review:{" "}
                              <strong className="text-amber-700">
                                {detectedCount}
                              </strong>
                            </span>

                            <span className="text-slate-600">
                              Approved:{" "}
                              <strong className="text-emerald-700">
                                {approvedCount}
                              </strong>
                            </span>
                          </div>

                          {canFinance && (
                            <button
                              type="button"
                              disabled={scanningMoney}
                              onClick={() => {
                                setError(null);

                                setMessage(null);

                                void scanMoneyOpportunities().catch(
                                  (scanError) => {
                                    setError(
                                      scanError instanceof Error
                                        ? scanError.message
                                        : "Unable to scan documents.",
                                    );
                                  },
                                );
                              }}
                              className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-bold text-slate-700 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-100 disabled:bg-slate-100 disabled:text-slate-600"
                            >
                              {scanningMoney
                                ? "Scanning..."
                                : "Rescan Documents"}
                            </button>
                          )}
                        </div>
                      </>
                    )}
                  </div>
                </section>

                <Card
                  title="Billing and Payment"
                  description="Financial status from invoice through payment."
                >
                  <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                    <FinancialField
                      label="Invoice"
                      value={overview.billing.invoiceNumber ?? "Not invoiced"}
                    />

                    <FinancialField
                      label="Invoice Date"
                      value={
                        overview.billing.invoiceIssuedAt
                          ? formatDate(overview.billing.invoiceIssuedAt)
                          : "-"
                      }
                    />

                    <FinancialField
                      label="Submitted"
                      value={
                        overview.billing.billingSubmittedAt
                          ? formatDate(overview.billing.billingSubmittedAt)
                          : "-"
                      }
                    />

                    <FinancialField
                      label="Payment Terms"
                      value={
                        overview.billing.paymentTermsDays
                          ? `Net ${overview.billing.paymentTermsDays}`
                          : "-"
                      }
                    />

                    <FinancialField
                      label="Due Date"
                      value={
                        overview.billing.paymentDueAt
                          ? formatDate(overview.billing.paymentDueAt)
                          : "-"
                      }
                    />

                    <FinancialField
                      label="Balance Due"
                      value={formatMoney(
                        overview.billing.balanceDue,
                        overview.load.currency,
                      )}
                    />

                    <FinancialField
                      label="Paid"
                      value={
                        overview.billing.amountPaid
                          ? formatMoney(
                              overview.billing.amountPaid,
                              overview.load.currency,
                            )
                          : formatMoney(0, overview.load.currency)
                      }
                    />

                    <FinancialField
                      label="Paid Date"
                      value={
                        overview.billing.paidAt
                          ? formatDate(overview.billing.paidAt)
                          : "-"
                      }
                    />

                    <FinancialField
                      label="Billing Recipient"
                      value={overview.billing.billingRecipientName ?? "-"}
                    />

                    <FinancialField
                      label="Billing Email"
                      value={overview.billing.billingRecipientEmail ?? "-"}
                    />
                  </div>
                </Card>

                <Card
                  title="Load Timeline"
                  description="Important events recorded by LoadPacket."
                >
                  <LoadTimeline events={autopilot?.timeline ?? []} />
                </Card>
              </div>

              <aside className="space-y-6">
{user?.role === 'OWNER' && <BrokerConnect loadId={loadId} />}
{canFinance && <DetentionTerms loadId={loadId} onSaved={refreshPage} />}
                <Card title="Driver" description="Current load assignment.">
                  {overview.driver ? (
                    <div>
                      <p className="text-xl font-bold text-slate-950">
                        {overview.driver.name}
                      </p>

                      <p className="mt-2 text-sm font-semibold text-blue-700">
                        {formatStatus(overview.driver.assignmentStatus)}
                      </p>

                      {overview.driver.phone && (
                        <p className="mt-3 text-sm text-slate-600">
                          {overview.driver.phone}
                        </p>
                      )}

                      {overview.driver.email && (
                        <p className="mt-1 text-sm text-slate-600">
                          {overview.driver.email}
                        </p>
                      )}

                      <p className="mt-5 text-sm text-slate-600">
                        The assigned driver opens this packet from their own
                        account.
                      </p>
                    </div>
                  ) : (
                    <div>
                      <p className="text-sm text-slate-600">
                        No driver is currently assigned.
                      </p>

                      {overview.load.status === "BOOKED" &&
                        overview.availableDrivers.length > 0 && (
                          <div className="mt-4">
                            <select
                              value={selectedDriverId}
                              onChange={(event) =>
                                setSelectedDriverId(event.target.value)
                              }
                              className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm"
                            >
                              {overview.availableDrivers.map((driver) => (
                                <option key={driver.id} value={driver.id}>
                                  {driver.name}
                                </option>
                              ))}
                            </select>

                            {canDispatch && (
                              <button
                                type="button"
                                onClick={() => void assignDriver()}
                                disabled={isAssigning}
                                className="mt-3 w-full rounded-xl bg-blue-700 px-4 py-3 text-sm font-bold text-white hover:bg-blue-600 disabled:bg-slate-200 disabled:text-slate-600"
                              >
                                {isAssigning ? "Assigning..." : "Assign Driver"}
                              </button>
                            )}
                          </div>
                        )}
                    </div>
                  )}
                </Card>

                <Card
                  title="Rate Breakdown"
                  description="Booked load economics."
                >
                  <MoneyRow
                    label="Linehaul"
                    value={overview.load.linehaul}
                    currency={overview.load.currency}
                  />

                  <MoneyRow
                    label="Fuel"
                    value={overview.load.fuelSurcharge}
                    currency={overview.load.currency}
                  />

                  <div className="mt-4 border-t border-slate-200 pt-4">
                    <MoneyRow
                      label="Total"
                      value={overview.load.totalRate}
                      currency={overview.load.currency}
                      strong
                    />
                  </div>
                </Card>

                {autopilot && (
                  <Card
                    title="Autopilot Status"
                    description="Current system recommendation."
                  >
                    <div className="space-y-3">
                      <div>
                        <p className="text-xs font-bold uppercase tracking-wide text-slate-600">
                          Priority
                        </p>

                        <div className="mt-2">
                          <PriorityBadge
                            priority={autopilot.ownerAction.priority}
                          />
                        </div>
                      </div>

                      <div>
                        <p className="text-xs font-bold uppercase tracking-wide text-slate-600">
                          Action
                        </p>

                        <p className="mt-1 font-bold text-slate-950">
                          {autopilot.ownerAction.label}
                        </p>
                      </div>

                      <p className="text-sm leading-6 text-slate-600">
                        {autopilot.ownerAction.message}
                      </p>

                      {opportunities.length > 0 && (
                        <div className="rounded-xl bg-emerald-50 p-3">
                          <p className="text-xs font-bold uppercase text-emerald-700">
                            Money Found
                          </p>

                          <p className="mt-1 text-lg font-bold text-emerald-800">
                            {formatMoney(moneyFound, overview.load.currency)}
                          </p>
                        </div>
                      )}
                    </div>
                  </Card>
                )}
              </aside>
            </section>
          </>
        )}
      </div>
    </main>
  );
}

function OwnerAutopilotAction({
  action,
  loadId,
  generatingInvoice,
  onGenerateInvoice,
}: {
  action: AutopilotAction;

  loadId: string;

  generatingInvoice: boolean;

  onGenerateInvoice: () => Promise<void>;
}) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-slate-950 p-6 text-white shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-5">
        <div className="max-w-3xl">
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-blue-300">
            LoadPacket Autopilot
          </p>

          <p className="mt-2 text-sm text-slate-300">Next Owner Action</p>

          <div className="mt-3 flex flex-wrap items-center gap-3">
            <h2 className="text-2xl font-bold">{action.label}</h2>

            <PriorityBadge priority={action.priority} />
          </div>

          <p className="mt-3 text-sm leading-6 text-slate-300">
            {action.message}
          </p>
        </div>

        <OwnerActionButton
          action={action}
          loadId={loadId}
          generatingInvoice={generatingInvoice}
          onGenerateInvoice={onGenerateInvoice}
        />
      </div>
    </section>
  );
}

function OwnerActionButton({
  action,
  generatingInvoice,
  onGenerateInvoice,
}: {
  action: AutopilotAction;

  loadId: string;

  generatingInvoice: boolean;

  onGenerateInvoice: () => Promise<void>;
}) {
  switch (action.type) {
    case "GENERATE_CARRIER_INVOICE":
      return (
        <button
          type="button"
          disabled={generatingInvoice}
          onClick={() => void onGenerateInvoice()}
          className="rounded-xl bg-white px-5 py-3 text-sm font-bold text-slate-950 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-100 disabled:bg-slate-100 disabled:text-slate-600"
        >
          {generatingInvoice ? "Generating..." : "Generate Carrier Invoice"}
        </button>
      );

    case "ASSIGN_DRIVER":
      return (
        <a
          href="#driver-card"
          className="rounded-xl bg-white px-5 py-3 text-sm font-bold text-slate-950 hover:bg-slate-100"
        >
          Assign Driver
        </a>
      );

    case "WAITING_ON_DRIVER":
      return (
        <p className="mt-5 text-sm text-slate-600">
          The assigned driver opens this packet from their own account.
        </p>
      );

    case "RESOLVE_DOCUMENT_BLOCKERS":
      return (
        <p className="mt-5 text-sm text-slate-600">
          The assigned driver opens this packet from their own account.
        </p>
      );

    case "CONTINUE_BACK_OFFICE":
    case "SUBMIT_BILLING":
      return (
        <Link
          href="/back-office"
          className="rounded-xl bg-white px-5 py-3 text-sm font-bold text-slate-950 hover:bg-slate-100"
        >
          Open Back Office
        </Link>
      );

    case "WAITING_FOR_PAYMENT":
      return (
        <Link
          href="/back-office/accounts-receivable"
          className="rounded-xl bg-white px-5 py-3 text-sm font-bold text-slate-950 hover:bg-slate-100"
        >
          Open A/R
        </Link>
      );

    case "COMPLETE":
      return (
        <span className="rounded-xl border border-emerald-700 bg-emerald-950 px-5 py-3 text-sm font-bold text-emerald-300">
          No action required
        </span>
      );

    default:
      return null;
  }
}

function MoneyOpportunityCard({
  readOnly,
  opportunity,
  amount,
  busy,
  onAmountChange,
  onSave,
  onApprove,
  onDismiss,
}: {
  readOnly: boolean;
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

  const billed = opportunity.status === "BILLED";

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
              {formatMoney(opportunity.amount, opportunity.currency)}
            </p>
          </div>
        )}
      </div>

      {detected && !readOnly && (
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
            Confirm the supporting receipt or contract calculation before approving. Approved extras require billing follow-up and do not change an issued invoice.
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
            Ready for the broker charge or amendment workflow.
          </p>
        </div>
      )}

      {dismissed && (
        <div className="mt-4 rounded-xl bg-slate-100 p-4">
          <p className="text-sm font-semibold text-slate-600">
            Dismissed - no owner action required.
          </p>
        </div>
      )}

      {billed && (
        <div className="mt-4 rounded-xl border border-blue-200 bg-blue-50 p-4">
          <p className="text-sm font-bold text-blue-800">Billed to broker</p>
        </div>
      )}
    </article>
  );
}

function LoadTimeline({ events }: { events: AutopilotTimelineEvent[] }) {
  if (events.length === 0) {
    return (
      <p className="text-sm text-slate-600">
        No LoadPacket events have been recorded yet.
      </p>
    );
  }

  const sortedEvents = [...events].sort(
    (left, right) =>
      new Date(right.occurredAt).getTime() -
      new Date(left.occurredAt).getTime(),
  );

  return (
    <div className="space-y-5">
      {sortedEvents.map((event, index) => {
        const documentType = getMetadataString(event.metadata, "documentType");

        const originalFileName = getMetadataString(
          event.metadata,
          "originalFileName",
        );

        const opportunityType = getMetadataString(
          event.metadata,
          "opportunityType",
        );

        const amount = getMetadataString(event.metadata, "amount");

        return (
          <div
            key={event.id ?? `${event.type}-${event.occurredAt}-${index}`}
            className="relative border-l-2 border-slate-200 pl-5"
          >
            <div className="absolute -left-[7px] top-1 h-3 w-3 rounded-full border-2 border-white bg-blue-600" />

            <p className="font-bold text-slate-950">
              {event.label ?? formatEventType(event.type)}
            </p>

            <p className="mt-1 text-xs text-slate-600">
              {formatDateTime(event.occurredAt)}

              {event.actorName ? ` - ${event.actorName}` : ""}
            </p>

            {documentType && (
              <p className="mt-2 text-sm text-slate-600">
                {formatDocumentType(documentType)}

                {originalFileName ? ` - ${originalFileName}` : ""}
              </p>
            )}

            {opportunityType && (
              <p className="mt-2 text-sm text-emerald-700">
                {formatOpportunityType(opportunityType)}

                {amount ? ` - ${formatMoney(amount)}` : ""}
              </p>
            )}
          </div>
        );
      })}
    </div>
  );
}

function Lifecycle({ status }: { status: string }) {
  if (status === "CANCELLED") return <p className="rounded-xl bg-slate-100 p-4 text-sm font-bold text-slate-700">Cancelled — document and assignment history retained</p>;
  const currentIndex = lifecycle.indexOf(status);

  return (
    <section className="mt-8 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
      <p className="text-xs font-bold uppercase tracking-wide text-slate-600">
        Load Lifecycle
      </p>

      <div className="mt-5 grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {lifecycle.map((stage, index) => {
          const reached = currentIndex >= index;

          const current = status === stage;

          return (
            <div
              key={stage}
              className={`rounded-xl border p-4 ${
                current
                  ? "border-blue-500 bg-blue-50"
                  : reached
                    ? "border-emerald-200 bg-emerald-50"
                    : "border-slate-200 bg-slate-50"
              }`}
            >
              <p className="text-xs font-bold text-slate-600">{index + 1}</p>

              <p
                className={`mt-2 text-sm font-bold ${
                  current
                    ? "text-blue-700"
                    : reached
                      ? "text-emerald-700"
                      : "text-slate-600"
                }`}
              >
                {formatStatus(stage)}
              </p>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function Card({
  title,
  description,
  children,
}: {
  title: string;

  description: string;

  children: ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
      <h2 className="text-lg font-bold text-slate-950">{title}</h2>

      <p className="mt-1 text-sm text-slate-600">{description}</p>

      <div className="mt-5">{children}</div>
    </section>
  );
}

function FinancialField({
  label,
  value,
}: {
  label: string;

  value: string;
}) {
  return (
    <div className="rounded-xl bg-slate-50 p-4">
      <p className="text-xs font-bold uppercase tracking-wide text-slate-600">
        {label}
      </p>

      <p className="mt-2 break-words font-semibold text-slate-950">{value}</p>
    </div>
  );
}

function MoneyRow({
  label,
  value,
  currency,
  strong = false,
}: {
  label: string;

  value: string | null;

  currency: string;

  strong?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-4 py-1.5">
      <span className="text-sm text-slate-600">{label}</span>

      <span
        className={
          strong ? "font-bold text-slate-950" : "font-semibold text-slate-800"
        }
      >
        {value ? formatMoney(value, currency) : "-"}
      </span>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  return (
    <span className="inline-flex whitespace-nowrap rounded-full bg-blue-100 px-3 py-1 text-xs font-bold text-blue-700">
      {formatStatus(status)}
    </span>
  );
}

function PriorityBadge({ priority }: { priority: string }) {
  const style =
    priority === "HIGH"
      ? "bg-red-100 text-red-700"
      : priority === "NORMAL"
        ? "bg-amber-100 text-amber-800"
        : "bg-emerald-100 text-emerald-700";

  return (
    <span className={`inline-flex whitespace-nowrap rounded-full px-3 py-1 text-xs font-bold ${style}`}>
      {priority}
    </span>
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
    <span className={`inline-flex whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-bold ${className}`}>
      {status === "DETECTED"
        ? "NEEDS REVIEW"
        : formatStatus(status).toUpperCase()}
    </span>
  );
}

function Message({
  children,
  tone,
}: {
  children: ReactNode;

  tone: "error" | "success";
}) {
  return (
    <div
      className={`mb-6 rounded-xl border p-4 ${
        tone === "error"
          ? "border-red-200 bg-red-50 text-red-700"
          : "border-emerald-200 bg-emerald-50 text-emerald-700"
      }`}
    >
      {children}
    </div>
  );
}

function formatDocumentType(value: string) {
  const labels: Record<string, string> = {
    RATE_CONFIRMATION: "Rate Confirmation",

    BOL: "Bill of Lading",

    POD: "Proof of Delivery",

    CARRIER_INVOICE: "Carrier Invoice",

    LUMPER_RECEIPT: "Lumper Receipt",

    SCALE_TICKET: "Scale Ticket",

    OTHER: "Other Document",
  };

  return labels[value] ?? formatStatus(value);
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

function formatEventType(value: string) {
  const labels: Record<string, string> = {
    LOAD_CREATED: "Load created",

    DRIVER_ASSIGNED: "Driver assigned",

    DRIVER_ACCEPTED: "Driver accepted load",

    LOAD_STARTED: "Load started",

    ARRIVED_PICKUP: "Arrived at pickup",

    DEPARTED_PICKUP: "Departed pickup",

    ARRIVED_DELIVERY: "Arrived at delivery",

    DEPARTED_DELIVERY: "Departed delivery",

    DOCUMENT_CAPTURED: "Document captured",

    DOCUMENT_VALIDATED: "Document validated",

    DELIVERY_CONFIRMED: "Delivery confirmed",

    LOAD_COMPLETED: "Load completed",

    AGREEMENT_CREATED: "Agreement created",

    AGREEMENT_ACCEPTED: "Agreement accepted",

    AGREEMENT_EXECUTED: "Agreement executed",

    AGREEMENT_SUPERSEDED: "Agreement superseded",

    CHARGE_OPPORTUNITY_DETECTED: "Charge opportunity detected",

    CHARGE_OPPORTUNITY_APPROVED: "Charge opportunity approved",

    CHARGE_OPPORTUNITY_DISMISSED: "Charge opportunity dismissed",

    CHARGE_OPPORTUNITY_BILLED: "Charge opportunity billed",

    INVOICE_CREATED: "Invoice created",

    PAYMENT_READY: "Payment ready",

    BILLING_SUBMITTED: "Billing submitted",

    PAYMENT_RECEIVED: "Payment received",
  };

  return labels[value] ?? formatStatus(value);
}

function formatMoney(value: string | number | bigint, currency = "USD") {
  if (typeof value === 'bigint') return `${currency === 'USD' ? '$' : currency + ' '}${(value / BigInt(100)).toLocaleString('en-US')}.${(value % BigInt(100)).toString().padStart(2, '0')}`;
  const amount = typeof value === "number" ? value : Number(value);

  if (!Number.isFinite(amount)) {
    return String(value);
  }

  return new Intl.NumberFormat("en-US", {
    style: "currency",

    currency: currency || "USD",
  }).format(amount);
}

function moneyToCents(value: string | null) {
  if (!value || !/^\d+(\.\d{1,2})?$/.test(value)) return BigInt(0);
  const [whole, fraction = ''] = value.split('.');
  return BigInt(whole) * BigInt(100) + BigInt(fraction.padEnd(2, '0'));
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: BUSINESS_TIME_ZONE,

    month: "short",

    day: "numeric",

    year: "numeric",
  }).format(new Date(value));
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: BUSINESS_TIME_ZONE,

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

function getMetadataString(
  metadata: Record<string, unknown> | null | undefined,
  key: string,
) {
  if (!metadata) {
    return null;
  }

  const value = metadata[key];

  if (typeof value === "string") {
    return value;
  }

  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }

  return null;
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

