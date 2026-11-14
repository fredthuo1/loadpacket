"use client";
import { apiFetch, API_BASE_URL } from "@/lib/api/api-fetch";

import Link from "next/link";
import { IntakeEvidence } from "@/components/intake-evidence";
import { useParams, useRouter } from "next/navigation";

import { useEffect, useRef, useState } from "react";

type CreateLoadResponse = {
  created: boolean;

  load: {
    id: string;
  };
};

import type {
  DraftRequirementType,
  RateConDraftResponse,
} from "../../../../../../../../packages/api-contracts/ratecon";
import {
  INVALID_RATECON_DRAFT,
  parseRateConDraft,
  stopAppointment,
} from "@/lib/api/ratecon-draft";

type FormState = {
  loadNumber: string;
  brokerName: string;
  brokerContact: string;
  equipment: string;

  linehaul: string;
  fuelSurcharge: string;
  totalRate: string;

  pickupFacility: string;
  pickupAddress: string;
  pickupAppointment: string;
  pickupNumber: string;

  deliveryFacility: string;
  deliveryAddress: string;
  deliveryAppointment: string;
  deliveryNumber: string;
};

export default function ReviewLoadPage() {
  const params = useParams<{
    documentId: string;
  }>();

  const router = useRouter();

  const [isCreating, setIsCreating] = useState(false);

  const [createError, setCreateError] = useState<string | null>(null);

  const documentId = params.documentId;

  const [draft, setDraft] = useState<RateConDraftResponse | null>(null);
  const [confirmed, setConfirmed] = useState(false),
    [currency, setCurrency] = useState(""),
    [terms, setTerms] = useState("");
  const [generation, setGeneration] = useState(0);
  const confirmationKey = useRef<string | null>(null);

  const [form, setForm] = useState<FormState | null>(null);

  const [error, setError] = useState<string | null>(null);

  const [isLoading, setIsLoading] = useState(true);

  const hasLoaded = useRef(false);

  useEffect(() => {
    if (!documentId || hasLoaded.current) {
      return;
    }

    hasLoaded.current = true;

    async function loadDraft() {
      try {
        const response = await apiFetch(
          `${API_BASE_URL}/documents/${documentId}/intelligence`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ retry: generation > 0 }),
          },
        );

        if (!response.ok) {
          throw new Error("LoadPacket could not read this Rate Confirmation.");
        }

        const result = parseRateConDraft(await response.json(), documentId);

        setDraft(result);
        setCurrency(result.currency);
        setTerms(
          String(result.intelligence?.fields.paymentTermsDays?.value ?? ""),
        );
        setConfirmed(false);

        setForm({
          loadNumber: result.loadNumber ?? "",

          brokerName: result.brokerName ?? "",

          brokerContact: result.brokerContact ?? "",

          equipment: result.equipment ?? "",

          linehaul: result.linehaul ?? "",

          fuelSurcharge: result.fuelSurcharge ?? "",

          totalRate: result.totalRate ?? "",

          pickupFacility: result.pickup.facilityName ?? "",

          pickupAddress: result.pickup.address ?? "",

          pickupAppointment: stopAppointment(result.pickup),

          pickupNumber: result.pickup.referenceNumber ?? "",

          deliveryFacility: result.delivery.facilityName ?? "",

          deliveryAddress: result.delivery.address ?? "",

          deliveryAppointment: stopAppointment(result.delivery),

          deliveryNumber: result.delivery.referenceNumber ?? "",
        });
      } catch {
        setError(INVALID_RATECON_DRAFT);
      } finally {
        setIsLoading(false);
      }
    }

    void loadDraft();
  }, [documentId, generation]);

  function updateField(field: keyof FormState, value: string) {
    setForm((current) => {
      if (!current) {
        return current;
      }

      return {
        ...current,
        [field]: value,
      };
    });
  }

  if (isLoading) {
    return (
      <main className="min-h-screen bg-slate-50">
        <div className="mx-auto max-w-5xl px-6 py-16">
          <div className="rounded-2xl border bg-white p-10 text-center shadow-sm">
            <div className="text-4xl">📄</div>

            <h1 className="mt-5 text-xl font-bold text-slate-900">
              Reading your Rate Confirmation
            </h1>

            <p className="mt-2 text-sm text-slate-600">
              LoadPacket is preparing the load details for review.
            </p>
          </div>
        </div>
      </main>
    );
  }

  if (error || !draft || !form) {
    return (
      <main className="min-h-screen bg-slate-50">
        <div className="mx-auto max-w-3xl px-6 py-16">
          <div className="rounded-2xl border border-red-200 bg-white p-8">
            <h1 className="text-xl font-bold text-slate-900">
              We couldn&apos;t prepare this load
            </h1>

            <p className="mt-3 text-sm text-red-700">
              {error ?? INVALID_RATECON_DRAFT}
            </p>

            <Link
              href="/loads/new"
              className="mt-6 inline-block font-semibold text-slate-900 underline"
            >
              Try another RateCon
            </Link>
            <button
              type="button"
              className="ml-4 underline"
              onClick={() => {
                hasLoaded.current = false;
                setError(null);
                setIsLoading(true);
                setGeneration((g) => g + 1);
              }}
            >
              Retry this document
            </button>
          </div>
        </div>
      </main>
    );
  }

  async function handleCreateLoad() {
    if (!form || !draft) {
      return;
    }

    setCreateError(null);
    if (draft.intelligence && (!confirmed || currency !== "USD")) {
      setCreateError(
        "Verify the original and all values, select USD, and explicitly confirm your review.",
      );
      return;
    }
    if (terms !== "" && (!/^\d{1,3}$/.test(terms) || Number(terms) > 365)) {
      setCreateError(
        "Payment terms must be 0–365 whole days, or blank to use saved defaults.",
      );
      return;
    }

    const requiredFields = [
      form.loadNumber,
      form.brokerName,
      form.totalRate,
      form.pickupFacility,
      form.pickupAddress,
      form.deliveryFacility,
      form.deliveryAddress,
    ];

    if (requiredFields.some((value) => !value.trim())) {
      setCreateError(
        "Complete all required load, broker, pickup, delivery, and rate fields before creating the load.",
      );

      return;
    }

    setIsCreating(true);

    try {
      const payload = {
        ...(draft.intelligence
          ? {
              processingRunId: draft.intelligence.runId,
              reviewConfirmed: confirmed,
              confirmationKey:
                confirmationKey.current ??
                (confirmationKey.current = crypto.randomUUID()),
              currency,
              paymentTermsDays: terms === "" ? undefined : Number(terms),
            }
          : {}),
        documentId: draft.documentId,

        loadNumber: form.loadNumber.trim(),

        brokerName: form.brokerName.trim(),

        brokerContact: form.brokerContact.trim() || undefined,

        equipment: form.equipment.trim() || undefined,

        linehaul: form.linehaul.trim() || undefined,

        fuelSurcharge: form.fuelSurcharge.trim() || undefined,

        totalRate: form.totalRate.trim(),

        pickup: {
          facilityName: form.pickupFacility.trim(),

          address: form.pickupAddress.trim(),

          appointment: form.pickupAppointment.trim() || undefined,

          referenceNumber: form.pickupNumber.trim() || undefined,
        },

        delivery: {
          facilityName: form.deliveryFacility.trim(),

          address: form.deliveryAddress.trim(),

          appointment: form.deliveryAppointment.trim() || undefined,

          referenceNumber: form.deliveryNumber.trim() || undefined,
        },

        requirements: draft.requirements.map((document) => ({
          documentType: document.documentType,

          requirement: document.requirement,
        })),
      };

      const response = await apiFetch(`${API_BASE_URL}/loads`, {
        method: "POST",

        headers: {
          "Content-Type": "application/json",
        },

        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        let message = "Unable to create the load.";

        try {
          const body = (await response.json()) as {
            message?: string | string[];
          };

          if (Array.isArray(body.message)) {
            message = body.message.join(", ");
          } else if (body.message) {
            message = body.message;
          }
        } catch {
          // Keep default message.
        }

        setCreateError(message);
        return;
      }

      const result = (await response.json()) as CreateLoadResponse;

      if (
        !result ||
        !result.load ||
        typeof result.load.id !== "string" ||
        !result.load.id
      ) {
        setCreateError(
          "LoadPacket couldn't confirm the created load. Check your loads before trying again.",
        );
        return;
      }

      router.push(`/loads/${result.load.id}`);
    } catch {
      setCreateError(
        "LoadPacket couldn't confirm the created load. Check your loads before trying again.",
      );
    } finally {
      setIsCreating(false);
    }
  }

  return (
    <main className="min-h-screen bg-slate-50">
      <div className="mx-auto max-w-6xl px-6 py-10">
        <Link
          href="/loads/new"
          className="text-sm font-semibold text-slate-600 hover:text-slate-900"
        >
          ← Back
        </Link>

        <div className="mt-6 flex flex-col justify-between gap-5 md:flex-row md:items-end">
          <div>
            <p className="text-sm font-bold text-emerald-700">
              {draft.intelligence?.status === "FAILED"
                ? "Manual review needed"
                : "RateCon ready for review"}
            </p>

            <h1 className="mt-2 text-3xl font-bold tracking-tight text-slate-950">
              Review Your Load
            </h1>

            <p className="mt-2 max-w-2xl text-slate-600">
              We extracted these details from your Rate Confirmation. Review
              them before creating the load.
            </p>
          </div>

          <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-amber-700">
              Review required
            </p>

            <p className="mt-1 text-sm text-amber-900">
              Nothing has been approved yet.
            </p>
          </div>
        </div>

        {draft.intelligence && (
          <>
            <IntakeEvidence
              documentId={documentId}
              evidence={draft.intelligence}
              onRetry={() => {
                hasLoaded.current = false;
                setIsLoading(true);
                setError(null);
                setGeneration((g) => g + 1);
              }}
            />
            <section className="my-5 space-y-4 rounded-xl border bg-white p-4">
              <label className="block">
                Confirmed currency
                <select
                  className="ml-3 rounded border p-2"
                  value={currency}
                  onChange={(e) => setCurrency(e.target.value)}
                >
                  <option value="">Select currency</option>
                  {currency && currency !== "USD" && (
                    <option value={currency}>{currency} — unsupported</option>
                  )}
                  <option value="USD">USD</option>
                </select>
              </label>
              <p className="text-sm text-slate-600">
                Only USD loads are currently supported. Do not treat an
                unsupported currency as USD or infer a conversion.
              </p>
              <label className="block">
                Payment terms (days)
                <input
                  className="ml-3 w-24 rounded border p-2"
                  type="number"
                  min="0"
                  max="365"
                  step="1"
                  value={terms}
                  onChange={(e) => setTerms(e.target.value)}
                />
              </label>
              <p className="text-sm text-slate-600">
                0 means due on the invoice date; blank leaves terms unresolved
                and uses the existing organization/default invoice policy.
              </p>
              <label className="flex items-start gap-3">
                <input
                  type="checkbox"
                  className="mt-1"
                  checked={confirmed}
                  onChange={(e) => setConfirmed(e.target.checked)}
                />
                <span>
                  I reviewed the original Rate Confirmation and verified the
                  fields, amounts, currency, terms and document requirements.
                  These values are my confirmed instructions.
                </span>
              </label>
            </section>
          </>
        )}
        {draft.warnings.length > 0 && (
          <div
            role="status"
            className="mt-6 rounded-xl border border-amber-200 bg-amber-50 p-4 text-amber-900"
          >
            {draft.warnings.map((warning) => (
              <p key={warning}>{warning}</p>
            ))}
          </div>
        )}
        <div className="mt-8 grid gap-6 lg:grid-cols-[1fr_320px]">
          <div className="space-y-6">
            <Section title="Load Details">
              <div className="grid gap-4 md:grid-cols-2">
                <Field
                  label="Load Number"
                  value={form.loadNumber}
                  onChange={(value) => updateField("loadNumber", value)}
                />

                <Field
                  label="Equipment"
                  value={form.equipment}
                  onChange={(value) => updateField("equipment", value)}
                />

                <Field
                  label="Broker"
                  value={form.brokerName}
                  onChange={(value) => updateField("brokerName", value)}
                />

                <Field
                  label="Broker Contact"
                  value={form.brokerContact}
                  onChange={(value) => updateField("brokerContact", value)}
                />
              </div>
            </Section>

            <Section title="Rate">
              <div className="grid gap-4 md:grid-cols-3">
                <MoneyField
                  label="Linehaul"
                  value={form.linehaul}
                  onChange={(value) => updateField("linehaul", value)}
                />

                <MoneyField
                  label="Fuel Surcharge"
                  value={form.fuelSurcharge}
                  onChange={(value) => updateField("fuelSurcharge", value)}
                />

                <MoneyField
                  label="Total Rate"
                  value={form.totalRate}
                  onChange={(value) => updateField("totalRate", value)}
                />
              </div>
            </Section>

            <Section title="Pickup">
              <div className="grid gap-4 md:grid-cols-2">
                <Field
                  label="Facility"
                  value={form.pickupFacility}
                  onChange={(value) => updateField("pickupFacility", value)}
                />

                <Field
                  label="Pickup Number"
                  value={form.pickupNumber}
                  onChange={(value) => updateField("pickupNumber", value)}
                />

                <Field
                  label="Address"
                  value={form.pickupAddress}
                  onChange={(value) => updateField("pickupAddress", value)}
                />

                <Field
                  label="Appointment"
                  value={form.pickupAppointment}
                  onChange={(value) => updateField("pickupAppointment", value)}
                />
              </div>
            </Section>

            <Section title="Delivery">
              <div className="grid gap-4 md:grid-cols-2">
                <Field
                  label="Facility"
                  value={form.deliveryFacility}
                  onChange={(value) => updateField("deliveryFacility", value)}
                />

                <Field
                  label="Delivery Number"
                  value={form.deliveryNumber}
                  onChange={(value) => updateField("deliveryNumber", value)}
                />

                <Field
                  label="Address"
                  value={form.deliveryAddress}
                  onChange={(value) => updateField("deliveryAddress", value)}
                />

                <Field
                  label="Appointment"
                  value={form.deliveryAppointment}
                  onChange={(value) =>
                    updateField("deliveryAppointment", value)
                  }
                />
              </div>
            </Section>
          </div>

          <aside className="space-y-6">
            <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
              <h2 className="font-bold text-slate-950">Required Paperwork</h2>

              <p className="mt-1 text-sm text-slate-600">
                Verify the source suggestions and operational defaults. Add or
                remove paperwork as needed.
              </p>

              <div className="mt-5 space-y-3">
                {draft.requirements.map((document) => (
                  <div
                    key={document.type}
                    className="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-3"
                  >
                    <span className="text-sm font-semibold text-slate-800">
                      {formatDocumentType(document.type)}
                    </span>

                    <select
                      aria-label={`${formatDocumentType(document.type)} requirement`}
                      className="max-w-36 rounded border p-2 text-sm"
                      value={document.requirement}
                      onChange={(e) =>
                        setDraft({
                          ...draft,
                          requirements:
                            e.target.value === "OMIT"
                              ? draft.requirements.filter(
                                  (r) => r.type !== document.type,
                                )
                              : draft.requirements.map((r) =>
                                  r.type === document.type
                                    ? {
                                        ...r,
                                        requirement: e.target.value as
                                          "REQUIRED" | "CONDITIONAL",
                                      }
                                    : r,
                                ),
                        })
                      }
                    >
                      <option value="REQUIRED">Required</option>
                      <option value="CONDITIONAL">Conditional</option>
                      <option value="OMIT">Remove</option>
                    </select>
                  </div>
                ))}
                <select
                  aria-label="Add required document"
                  className="w-full rounded border p-2 text-sm"
                  value=""
                  onChange={(e) => {
                    const type = e.target.value as DraftRequirementType;
                    if (type)
                      setDraft({
                        ...draft,
                        requirements: [
                          ...draft.requirements,
                          {
                            type,
                            documentType: type,
                            requirement: "REQUIRED",
                            confidence: 0,
                          },
                        ],
                      });
                  }}
                >
                  <option value="">Add paperwork…</option>
                  {(
                    [
                      "BOL",
                      "POD",
                      "CARRIER_INVOICE",
                      "LUMPER_RECEIPT",
                      "SCALE_TICKET",
                    ] as const
                  )
                    .filter(
                      (type) =>
                        !draft.requirements.some((r) => r.type === type),
                    )
                    .map((type) => (
                      <option key={type} value={type}>
                        {formatDocumentType(type)}
                      </option>
                    ))}
                </select>
              </div>
            </div>

            <div className="rounded-2xl bg-slate-950 p-6 text-white">
              <p className="text-sm text-slate-400">Total Agreed Rate</p>

              <p className="mt-2 text-3xl font-bold">
                ${form.totalRate || "Unverified"}
              </p>

              <button
                type="button"
                onClick={handleCreateLoad}
                disabled={isCreating}
                className="mt-6 w-full rounded-lg bg-white px-4 py-3 text-sm font-bold text-slate-950 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-100 disabled:bg-slate-100 disabled:text-slate-600"
              >
                {isCreating ? "Creating Load..." : "Confirm & Create Load"}
              </button>

              <p className="mt-3 text-center text-xs text-slate-400">
                Creates the load and required paperwork checklist.
              </p>

              {createError && (
                <div className="mt-4 rounded-lg bg-red-50 p-3">
                  <p className="text-sm font-medium text-red-700">
                    {createError}
                  </p>
                </div>
              )}
            </div>

            <div className="rounded-xl border border-slate-200 bg-white p-4 text-xs text-slate-600">
              Source document
              <p className="mt-1 break-all font-mono text-slate-700">
                {draft.documentId}
              </p>
              <p className="mt-3">
                {draft.extraction.pageCount} pages ·{" "}
                {draft.extraction.characterCount.toLocaleString()} characters
                read
              </p>
            </div>
          </aside>
        </div>
      </div>
    </main>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
      <h2 className="text-lg font-bold text-slate-950">{title}</h2>

      <div className="mt-5">{children}</div>
    </section>
  );
}

function Field({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label>
      <div className="mb-2 flex items-center justify-between gap-3">
        <span className="text-sm font-semibold text-slate-700">{label}</span>

        <span aria-hidden="true" className="text-xs text-amber-700">
          Review
        </span>
      </div>

      <input
        aria-label={label}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-950 outline-none transition focus:border-slate-900 focus:ring-1 focus:ring-slate-900"
      />
    </label>
  );
}

function MoneyField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label>
      <div className="mb-2 flex items-center justify-between gap-2">
        <span className="text-sm font-semibold text-slate-700">{label}</span>

        <span aria-hidden="true" className="text-xs text-amber-700">
          Review
        </span>
      </div>

      <div className="flex rounded-lg border border-slate-300 bg-white focus-within:border-slate-900 focus-within:ring-1 focus-within:ring-slate-900">
        <span className="flex items-center border-r border-slate-200 px-3 text-slate-600">
          $
        </span>

        <input
          aria-label={label}
          value={value}
          inputMode="decimal"
          onChange={(event) => onChange(event.target.value)}
          className="min-w-0 flex-1 rounded-r-lg px-3 py-2.5 text-sm text-slate-950 outline-none"
        />
      </div>
    </label>
  );
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
