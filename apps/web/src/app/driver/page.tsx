"use client";
import { apiFetch } from "@/lib/api/api-fetch";

import type { DriverAssignmentHistory } from "../../../../../packages/api-contracts/driver";
import Link from "next/link";

import { useEffect, useState } from "react";

import { AppHeader } from "../../components/app-header";

type Driver = {
  id: string;
  firstName: string;
  lastName: string;
  phone: string | null;
  email: string | null;
  status: string;
};

type StopSummary = {
  facilityName: string | null;
  address: string;
  appointmentText: string | null;
  referenceNumber: string | null;
};

type PaperworkCount = {
  captured: number;
  total: number;
};

type DriverLoad = {
  assignment: {
    id: string;
    status: string;
    assignedAt: string;
    acceptedAt: string | null;
    completedAt: string | null;
  };

  load: {
    id: string;
    loadNumber: string;
    status: string;
    equipment: string | null;

    pickup: StopSummary | null;
    delivery: StopSummary | null;

    paperwork: {
      required: PaperworkCount;
      optional: PaperworkCount;
    };
  };
};

type DriverLoadsResponse = {
  driver: Driver;
  loads: DriverLoad[];
  history?: DriverAssignmentHistory[];
};

export default function DriverHomePage() {
  const [data, setData] = useState<DriverLoadsResponse | null>(null);

  const [isLoading, setIsLoading] = useState(true);

  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function loadAssignedLoads() {
      try {
        const response = await apiFetch("/me/loads");
        if (!response.ok) throw new Error("Unable to load assigned loads.");
        const result = (await response.json()) as DriverLoadsResponse;
        if (!cancelled) setData(result);
      } catch (err) {
        if (!cancelled)
          setError(
            err instanceof Error ? err.message : "Unable to load loads.",
          );
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }
    void loadAssignedLoads();
    return () => {
      cancelled = true;
    };
  }, []);
  const driver = data?.driver ?? null;

  return (
    <main className="min-h-screen bg-slate-50">
      <AppHeader />

      <div className="mx-auto max-w-3xl px-5 py-8">
        {driver && (
          <section>
            <p className="text-sm font-semibold text-slate-600">Driver Home</p>

            <h1 className="mt-1 text-3xl font-bold tracking-tight text-slate-950">
              Hi, {driver.firstName}
            </h1>

            <p className="mt-2 text-slate-600">
              Your assigned loads and required paperwork are all in one place.
            </p>
          </section>
        )}

        {error && (
          <div className="mt-6 rounded-xl border border-red-200 bg-red-50 p-4">
            <p className="text-sm font-semibold text-red-700">{error}</p>
          </div>
        )}

        {isLoading && (
          <div className="mt-8 rounded-2xl border border-slate-200 bg-white p-6">
            <p className="text-sm text-slate-600">Loading assigned loads...</p>
          </div>
        )}

        {!isLoading && data && data.loads.length === 0 && (
          <div className="mt-8 rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-sm">
            <p className="font-bold text-slate-900">No assigned loads</p>

            <p className="mt-2 text-sm text-slate-600">
              Loads assigned by the dispatcher will appear here.
            </p>
          </div>
        )}

        {!isLoading && data && data.loads.length > 0 && (
          <section className="mt-8">
            <div className="flex items-end justify-between">
              <div>
                <h2 className="text-xl font-bold text-slate-950">My Loads</h2>

                <p className="mt-1 text-sm text-slate-600">
                  {data.loads.length} assigned
                </p>
              </div>
            </div>

            <div className="mt-4 space-y-4">
              {data.loads.map((item) => (
                <LoadCard key={item.assignment.id} item={item} />
              ))}
            </div>
          </section>
        )}
      </div>
    </main>
  );
}

function LoadCard({ item }: { item: DriverLoad }) {
  const { load, assignment } = item;

  return (
    <article className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-4 border-b border-slate-100 p-5">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-xl font-bold text-slate-950">
              {load.loadNumber}
            </h3>

            <AssignmentBadge status={assignment.status} />
          </div>

          <p className="mt-2 text-sm font-medium text-slate-700">
            {routeLabel(load)}
          </p>
        </div>

        <LoadStatusBadge status={load.status} />
      </div>

      <div className="grid gap-4 p-5 sm:grid-cols-2">
        <StopPreview label="Pickup" stop={load.pickup} />

        <StopPreview label="Delivery" stop={load.delivery} />
      </div>

      <div className="border-t border-slate-100 bg-slate-50 px-5 py-4">
        <div className="grid gap-4 sm:grid-cols-[1fr_1fr_auto] sm:items-center">
          <PaperworkSummary
            label="Required paperwork"
            captured={load.paperwork.required.captured}
            total={load.paperwork.required.total}
            required
          />

          <PaperworkSummary
            label="Optional receipts"
            captured={load.paperwork.optional.captured}
            total={load.paperwork.optional.total}
          />

          <Link
            href={`/driver/loads/${load.id}`}
            className="rounded-lg bg-slate-950 px-5 py-3 text-center text-sm font-bold text-white hover:bg-slate-800"
          >
            Open Load
          </Link>
        </div>
      </div>
    </article>
  );
}

function PaperworkSummary({
  label,
  captured,
  total,
  required = false,
}: {
  label: string;
  captured: number;
  total: number;
  required?: boolean;
}) {
  const complete = total > 0 && captured >= total;

  return (
    <div>
      <p className="text-xs font-bold uppercase tracking-wide text-slate-600">
        {label}
      </p>

      <p
        className={`mt-1 text-sm font-semibold ${
          complete
            ? "text-emerald-700"
            : required
              ? "text-amber-700"
              : "text-slate-700"
        }`}
      >
        {captured}/{total} {required ? "complete" : "captured"}
      </p>
    </div>
  );
}

function StopPreview({
  label,
  stop,
}: {
  label: string;
  stop: StopSummary | null;
}) {
  return (
    <div>
      <p className="text-xs font-bold uppercase tracking-wide text-blue-700">
        {label}
      </p>

      {stop ? (
        <>
          <p className="mt-2 font-semibold text-slate-900">
            {stop.facilityName ?? stop.address}
          </p>

          <p className="mt-1 text-sm text-slate-600">
            {stop.appointmentText ?? "Appointment not specified"}
          </p>
        </>
      ) : (
        <p className="mt-2 text-sm text-slate-600">Stop unavailable</p>
      )}
    </div>
  );
}

function routeLabel(load: DriverLoad["load"]) {
  const pickup = load.pickup?.facilityName ?? load.pickup?.address ?? "Pickup";

  const delivery =
    load.delivery?.facilityName ?? load.delivery?.address ?? "Delivery";

  return `${pickup} -> ${delivery}`;
}

function AssignmentBadge({ status }: { status: string }) {
  return (
    <span className="rounded-full bg-blue-50 px-3 py-1 text-xs font-bold text-blue-700">
      {formatStatus(status)}
    </span>
  );
}

function LoadStatusBadge({ status }: { status: string }) {
  return (
    <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-bold text-slate-700">
      {formatStatus(status)}
    </span>
  );
}

function formatStatus(status: string) {
  return status
    .replaceAll("_", " ")
    .toLowerCase()
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}
