"use client";
import { apiFetch, API_BASE_URL } from "@/lib/api/api-fetch";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

type StopForm = {
  facilityName: string;
  address: string;
  appointment: string;
  referenceNumber: string;
};

type ManualLoadForm = {
  loadNumber: string;
  brokerName: string;
  brokerContact: string;
  equipment: string;

  linehaul: string;
  fuelSurcharge: string;
  totalRate: string;

  pickup: StopForm;
  delivery: StopForm;
};

type RequirementChoice = {
  documentType: string;
  label: string;
  description: string;
  requirement: "REQUIRED" | "CONDITIONAL";
  selected: boolean;
};

type ManualLoadResponse = {
  created: boolean;
  source: string;

  load: {
    id: string;
    loadNumber: string;
    status: string;
  };
};

const INITIAL_FORM: ManualLoadForm = {
  loadNumber: "",
  brokerName: "",
  brokerContact: "",
  equipment: "",

  linehaul: "",
  fuelSurcharge: "",
  totalRate: "",

  pickup: {
    facilityName: "",
    address: "",
    appointment: "",
    referenceNumber: "",
  },

  delivery: {
    facilityName: "",
    address: "",
    appointment: "",
    referenceNumber: "",
  },
};

const INITIAL_REQUIREMENTS: RequirementChoice[] = [
  {
    documentType: "BOL",
    label: "Bill of Lading",
    description: "Driver captures the BOL at pickup.",
    requirement: "REQUIRED",
    selected: true,
  },

  {
    documentType: "POD",
    label: "Proof of Delivery",
    description: "Driver captures the signed POD at delivery.",
    requirement: "REQUIRED",
    selected: true,
  },

  {
    documentType: "CARRIER_INVOICE",
    label: "Carrier Invoice",
    description: "Back office prepares the invoice after delivery.",
    requirement: "REQUIRED",
    selected: true,
  },

  {
    documentType: "LUMPER_RECEIPT",
    label: "Lumper Receipt",
    description: "Capture when lumper service is used.",
    requirement: "CONDITIONAL",
    selected: false,
  },

  {
    documentType: "SCALE_TICKET",
    label: "Scale Ticket",
    description: "Capture when the load requires weighing.",
    requirement: "CONDITIONAL",
    selected: false,
  },
];

export default function ManualLoadPage() {
  const router = useRouter();

  const [form, setForm] = useState<ManualLoadForm>(INITIAL_FORM);

  const [requirements, setRequirements] =
    useState<RequirementChoice[]>(INITIAL_REQUIREMENTS);

  const [isCreating, setIsCreating] = useState(false);

  const [error, setError] = useState<string | null>(null);

  function updateField(
    field: Exclude<keyof ManualLoadForm, "pickup" | "delivery">,
    value: string,
  ) {
    setForm((current) => ({
      ...current,
      [field]: value,
    }));
  }

  function updatePickup(field: keyof StopForm, value: string) {
    setForm((current) => ({
      ...current,

      pickup: {
        ...current.pickup,
        [field]: value,
      },
    }));
  }

  function updateDelivery(field: keyof StopForm, value: string) {
    setForm((current) => ({
      ...current,

      delivery: {
        ...current.delivery,
        [field]: value,
      },
    }));
  }

  function toggleRequirement(documentType: string) {
    setRequirements((current) =>
      current.map((requirement) =>
        requirement.documentType === documentType
          ? {
              ...requirement,
              selected: !requirement.selected,
            }
          : requirement,
      ),
    );
  }

  async function handleSubmit() {
    setError(null);

    const requiredValues = [
      form.loadNumber,
      form.brokerName,
      form.totalRate,

      form.pickup.facilityName,
      form.pickup.address,

      form.delivery.facilityName,
      form.delivery.address,
    ];

    if (requiredValues.some((value) => !value.trim())) {
      setError(
        "Complete all required load, rate, pickup, and delivery fields.",
      );

      return;
    }

    if (!isValidMoney(form.totalRate)) {
      setError(
        "Total rate must be a valid monetary amount, for example 3450 or 3450.00.",
      );

      return;
    }

    if (form.linehaul && !isValidMoney(form.linehaul)) {
      setError("Linehaul must be a valid monetary amount.");

      return;
    }

    if (form.fuelSurcharge && !isValidMoney(form.fuelSurcharge)) {
      setError("Fuel surcharge must be a valid monetary amount.");

      return;
    }

    setIsCreating(true);

    try {
      const payload = {
        loadNumber: form.loadNumber.trim(),

        brokerName: form.brokerName.trim(),

        brokerContact: optionalValue(form.brokerContact),

        equipment: optionalValue(form.equipment),

        linehaul: optionalMoney(form.linehaul),

        fuelSurcharge: optionalMoney(form.fuelSurcharge),

        totalRate: normalizeMoney(form.totalRate),

        pickup: {
          facilityName: form.pickup.facilityName.trim(),

          address: form.pickup.address.trim(),

          appointment: optionalValue(form.pickup.appointment),

          referenceNumber: optionalValue(form.pickup.referenceNumber),
        },

        delivery: {
          facilityName: form.delivery.facilityName.trim(),

          address: form.delivery.address.trim(),

          appointment: optionalValue(form.delivery.appointment),

          referenceNumber: optionalValue(form.delivery.referenceNumber),
        },

        requirements: requirements
          .filter((requirement) => requirement.selected)
          .map((requirement) => ({
            documentType: requirement.documentType,

            requirement: requirement.requirement,
          })),
      };

      const response = await apiFetch(`${API_BASE_URL}/loads/manual`, {
        method: "POST",

        headers: {
          "Content-Type": "application/json",
        },

        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        let message = "Unable to create the manual load.";

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

        throw new Error(message);
      }

      const result = (await response.json()) as ManualLoadResponse;

      router.push(`/loads/${result.load.id}`);
    } catch (createError) {
      setError(
        createError instanceof Error
          ? createError.message
          : "Unable to create the manual load.",
      );
    } finally {
      setIsCreating(false);
    }
  }

  return (
    <main className="min-h-screen bg-slate-50">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto max-w-5xl px-6 py-5">
          <Link
            href="/loads/new"
            className="text-sm font-semibold text-blue-700 hover:underline"
          >
            ← Back to New Load
          </Link>

          <p className="mt-4 text-sm font-semibold uppercase tracking-wide text-slate-600">
            Manual Load Entry
          </p>

          <h1 className="mt-1 text-3xl font-bold tracking-tight text-slate-950">
            Create a load manually
          </h1>

          <p className="mt-2 max-w-2xl text-slate-600">
            Enter the information you already know. You can attach documents and
            complete the load packet later.
          </p>
        </div>
      </header>

      <div className="mx-auto max-w-5xl px-6 py-8">
        {error && (
          <div className="mb-6 rounded-xl border border-red-200 bg-red-50 p-4">
            <p className="text-sm font-semibold text-red-700">{error}</p>
          </div>
        )}

        <div className="space-y-8">
          <FormSection
            title="Load"
            description="Basic load and broker information."
          >
            <div className="grid gap-5 md:grid-cols-2">
              <TextField
                label="Load Number"
                required
                value={form.loadNumber}
                placeholder="PSL-73418"
                onChange={(value) => updateField("loadNumber", value)}
              />

              <TextField
                label="Equipment"
                value={form.equipment}
                placeholder="53' Dry Van"
                onChange={(value) => updateField("equipment", value)}
              />

              <TextField
                label="Broker"
                required
                value={form.brokerName}
                placeholder="BlueRiver Freight Brokerage LLC"
                onChange={(value) => updateField("brokerName", value)}
              />

              <TextField
                label="Broker Contact"
                value={form.brokerContact}
                placeholder="Jane Smith · (555) 555-0100"
                onChange={(value) => updateField("brokerContact", value)}
              />
            </div>
          </FormSection>

          <FormSection
            title="Rate"
            description="Enter monetary amounts without a dollar sign."
          >
            <div className="grid gap-5 md:grid-cols-3">
              <MoneyField
                label="Linehaul"
                value={form.linehaul}
                placeholder="3000.00"
                onChange={(value) => updateField("linehaul", value)}
              />

              <MoneyField
                label="Fuel Surcharge"
                value={form.fuelSurcharge}
                placeholder="450.00"
                onChange={(value) => updateField("fuelSurcharge", value)}
              />

              <MoneyField
                label="Total Rate"
                required
                value={form.totalRate}
                placeholder="3450.00"
                onChange={(value) => updateField("totalRate", value)}
              />
            </div>
          </FormSection>

          <div className="grid gap-8 lg:grid-cols-2">
            <FormSection
              title="Pickup"
              description="Where the freight is picked up."
            >
              <div className="space-y-5">
                <TextField
                  label="Facility"
                  required
                  value={form.pickup.facilityName}
                  placeholder="Ozark Distribution Center"
                  onChange={(value) => updatePickup("facilityName", value)}
                />

                <TextField
                  label="Address"
                  required
                  value={form.pickup.address}
                  placeholder="123 Freight Way, Springfield, MO"
                  onChange={(value) => updatePickup("address", value)}
                />

                <TextField
                  label="Appointment"
                  value={form.pickup.appointment}
                  placeholder="Sep 15, 2026 · 8:00 AM"
                  onChange={(value) => updatePickup("appointment", value)}
                />

                <TextField
                  label="Pickup Reference"
                  value={form.pickup.referenceNumber}
                  placeholder="PU-73418"
                  onChange={(value) => updatePickup("referenceNumber", value)}
                />
              </div>
            </FormSection>

            <FormSection
              title="Delivery"
              description="Where the freight is delivered."
            >
              <div className="space-y-5">
                <TextField
                  label="Facility"
                  required
                  value={form.delivery.facilityName}
                  placeholder="Mid-South Retail DC"
                  onChange={(value) => updateDelivery("facilityName", value)}
                />

                <TextField
                  label="Address"
                  required
                  value={form.delivery.address}
                  placeholder="456 Commerce Blvd, Memphis, TN"
                  onChange={(value) => updateDelivery("address", value)}
                />

                <TextField
                  label="Appointment"
                  value={form.delivery.appointment}
                  placeholder="Sep 16, 2026 · 10:00 AM"
                  onChange={(value) => updateDelivery("appointment", value)}
                />

                <TextField
                  label="Delivery Reference"
                  value={form.delivery.referenceNumber}
                  placeholder="DEL-73418"
                  onChange={(value) => updateDelivery("referenceNumber", value)}
                />
              </div>
            </FormSection>
          </div>

          <FormSection
            title="Load Packet Requirements"
            description="Choose the documents this load will need."
          >
            <div className="space-y-3">
              {requirements.map((requirement) => (
                <label
                  key={requirement.documentType}
                  className="flex cursor-pointer items-start gap-4 rounded-xl border border-slate-200 p-4 hover:bg-slate-50"
                >
                  <input
                    type="checkbox"
                    checked={requirement.selected}
                    onChange={() => toggleRequirement(requirement.documentType)}
                    className="mt-1 h-4 w-4"
                  />

                  <div className="flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-semibold text-slate-900">
                        {requirement.label}
                      </p>

                      <span className="rounded-full bg-slate-100 px-2 py-1 text-[11px] font-bold uppercase tracking-wide text-slate-600">
                        {requirement.requirement === "REQUIRED"
                          ? "Required"
                          : "Conditional"}
                      </span>
                    </div>

                    <p className="mt-1 text-sm text-slate-600">
                      {requirement.description}
                    </p>
                  </div>
                </label>
              ))}
            </div>
          </FormSection>

          <div className="flex flex-col-reverse gap-3 border-t border-slate-200 pt-6 sm:flex-row sm:justify-end">
            <Link
              href="/loads/new"
              className="rounded-lg border border-slate-300 bg-white px-5 py-3 text-center text-sm font-semibold text-slate-700 hover:bg-slate-50"
            >
              Cancel
            </Link>

            <button
              type="button"
              onClick={() => void handleSubmit()}
              disabled={isCreating}
              className="rounded-lg bg-slate-950 px-6 py-3 text-sm font-bold text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-600"
            >
              {isCreating ? "Creating Load..." : "Create Load"}
            </button>
          </div>
        </div>
      </div>
    </main>
  );
}

function FormSection({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
      <h2 className="text-lg font-bold text-slate-950">{title}</h2>

      <p className="mt-1 text-sm text-slate-600">{description}</p>

      <div className="mt-6">{children}</div>
    </section>
  );
}

function TextField({
  label,
  value,
  placeholder,
  required = false,
  onChange,
}: {
  label: string;
  value: string;
  placeholder: string;
  required?: boolean;
  onChange: (value: string) => void;
}) {
  return (
    <label className="block">
      <span className="text-sm font-semibold text-slate-700">
        {label}

        {required && <span className="ml-1 text-red-600">*</span>}
      </span>

      <input
        type="text"
        value={value}
        placeholder={placeholder}
        onChange={(event) => onChange(event.target.value)}
        className="mt-2 w-full rounded-lg border border-slate-300 bg-white px-3 py-3 text-sm text-slate-900 outline-none placeholder:text-slate-500 focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
      />
    </label>
  );
}

function MoneyField({
  label,
  value,
  placeholder,
  required = false,
  onChange,
}: {
  label: string;
  value: string;
  placeholder: string;
  required?: boolean;
  onChange: (value: string) => void;
}) {
  return (
    <label className="block">
      <span className="text-sm font-semibold text-slate-700">
        {label}

        {required && <span className="ml-1 text-red-600">*</span>}
      </span>

      <div className="mt-2 flex rounded-lg border border-slate-300 bg-white focus-within:border-blue-500 focus-within:ring-2 focus-within:ring-blue-100">
        <span className="flex items-center border-r border-slate-200 px-3 text-sm font-semibold text-slate-600">
          $
        </span>

        <input
          type="text"
          inputMode="decimal"
          value={value}
          placeholder={placeholder}
          onChange={(event) => onChange(event.target.value)}
          className="min-w-0 flex-1 rounded-r-lg px-3 py-3 text-sm text-slate-900 outline-none placeholder:text-slate-500"
        />
      </div>
    </label>
  );
}

function optionalValue(value: string) {
  const trimmed = value.trim();

  return trimmed || undefined;
}

function optionalMoney(value: string) {
  if (!value.trim()) {
    return undefined;
  }

  return normalizeMoney(value);
}

function normalizeMoney(value: string) {
  const trimmed = value.trim().replaceAll(",", "").replace("$", "");

  if (!trimmed.includes(".")) {
    return `${trimmed}.00`;
  }

  const [whole, decimal = ""] = trimmed.split(".");

  if (decimal.length === 1) {
    return `${whole}.${decimal}0`;
  }

  return `${whole}.${decimal}`;
}

function isValidMoney(value: string) {
  const normalized = value.trim().replaceAll(",", "").replace("$", "");

  return /^\d+(\.\d{1,2})?$/.test(normalized);
}
