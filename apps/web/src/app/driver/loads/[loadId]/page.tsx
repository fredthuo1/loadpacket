"use client";
import { apiFetch, API_BASE_URL } from "@/lib/api/api-fetch";

import Link from "next/link";
import { useParams } from "next/navigation";

import { useCallback, useEffect, useRef, useState } from "react";
import type { DriverStop } from "../../../../../../../packages/api-contracts/driver";
import { secondaryClass } from "@/components/management-ui";

import { AppHeader } from "../../../../components/app-header";

const DRIVER_DOCUMENT_TYPES = ["BOL", "POD", "LUMPER_RECEIPT", "SCALE_TICKET"];

type DriverPacket = {
  actionToken: string;
  driver: {
    id: string;
    firstName: string;
    lastName: string;
    phone: string | null;
    email: string | null;
    status: string;
  };

  assignment: {
    id: string;
    status: string;
    assignedAt: string;
    acceptedAt: string | null;
    completedAt: string | null;
  };

  load: {
    stops: DriverStop[];
    id: string;
    loadNumber: string;
    status: string;
    equipment: string | null;

    pickup: {
      id: string;
      facilityName: string | null;
      address: string;
      appointmentText: string | null;
      referenceNumber: string | null;
    } | null;

    delivery: {
      id: string;
      facilityName: string | null;
      address: string;
      appointmentText: string | null;
      referenceNumber: string | null;
    } | null;

    requirements: Array<{
      id: string;
      documentType: string;
      requirement: string;
      status: string;
      reviewReason?: string | null;
    }>;
  };
};

type DriverAction = {
  type: string;
  label: string;
  reason: string;
  blocking: boolean;
  documentType?: string;
};

type AutopilotResponse = {
  stopAction: {
    stopId: string;
    action: "arrive" | "depart";
    label: string;
    reason: string;
  } | null;
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
    assignmentId: string;
    assignmentStatus: string;
  } | null;

  driverAction: DriverAction;

  deliveryGuard: {
    applicable: boolean;
    canLeave: boolean;
    blockingCount: number;

    blockers: Array<{
      type: string;
      message: string;
    }>;

    message: string;
  };

  ownerAction: {
    type: string;
    priority: string;
    label: string;
    message: string;
  };

  paperwork: {
    required: {
      complete: number;
      total: number;

      missing: Array<{
        documentType: string;
        status: string;
      }>;
    };
  };

  moneyOpportunities: Array<{
    id: string;
    type: string;
    status: string;
    amount: string | null;
    currency: string;
    description: string | null;
    detectedAt: string;
  }>;

  timeline: Array<{
    id: string;
    type: string;
    label: string;
    actorType: string;
    actorName: string | null;
    occurredAt: string;
    metadata: unknown;
  }>;
};

export default function DriverLoadPage() {
  const params = useParams<{
    loadId: string;
  }>();

  const loadId = params.loadId;
  return <DriverLoadScreen key={loadId} loadId={loadId} />;
}
function DriverLoadScreen({ loadId }: { loadId: string }) {
  const actionLock = useRef(false);
  const requestState = useRef({ generation: 0 });

  const [packet, setPacket] = useState<DriverPacket | null>(null);

  const [autopilot, setAutopilot] = useState<AutopilotResponse | null>(null);

  const [isLoading, setIsLoading] = useState(true);

  const [busyAction, setBusyAction] = useState<string | null>(null);

  const [error, setError] = useState<string | null>(null);

  const [message, setMessage] = useState<string | null>(null);

  const fetchPage = useCallback(() => {
    const generation = ++requestState.current.generation;
    return Promise.all([
      apiFetch(`${API_BASE_URL}/me/loads/${loadId}`),

      apiFetch(`${API_BASE_URL}/me/loads/${loadId}/autopilot`),
    ])
      .then(async ([packetResponse, autopilotResponse]) => {
        if (!packetResponse.ok) {
          throw new Error(
            await responseError(
              packetResponse,
              "Unable to load the Driver Load Packet.",
            ),
          );
        }

        if (!autopilotResponse.ok) {
          throw new Error(
            await responseError(
              autopilotResponse,
              "Unable to load LoadPacket Autopilot.",
            ),
          );
        }

        const [packetResult, autopilotResult] = await Promise.all([
          packetResponse.json() as Promise<DriverPacket>,
          autopilotResponse.json() as Promise<AutopilotResponse>,
        ]);

        if (generation === requestState.current.generation) {
          setPacket(packetResult);
          setAutopilot(autopilotResult);
        }
      })
      .catch((e: unknown) => {
        if (generation !== requestState.current.generation) return;
        setError(
          e instanceof Error ? e.message : "Unable to load Driver Load Packet.",
        );
        throw e;
      })
      .finally(() => {
        if (generation === requestState.current.generation) setIsLoading(false);
      });
  }, [loadId]);

  const loadPage = useCallback(() => {
    setIsLoading(true);
    setError(null);
    setPacket(null);
    setAutopilot(null);
    return fetchPage();
  }, [fetchPage]);

  useEffect(() => {
    const state = requestState.current;
    void fetchPage().catch(() => {});
    return () => {
      state.generation++;
    };
  }, [fetchPage]);

  function invalidateAccess(response: Response) {
    if ([401, 403, 404, 409].includes(response.status)) {
      setPacket(null);
      setAutopilot(null);
    }
  }

  async function performWorkflowAction(actionType: string) {
    const endpoint = workflowEndpoint(actionType);

    if (!endpoint || actionLock.current || !packet?.actionToken) {
      return;
    }
    actionLock.current = true;
    try {
      setBusyAction(actionType);

      setError(null);
      setMessage(null);

      const response = await apiFetch(
        `${API_BASE_URL}/me/loads/${loadId}/${endpoint}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ actionToken: packet?.actionToken }),
        },
      );

      if (!response.ok) {
        invalidateAccess(response);
        throw new Error(
          await responseError(response, "Unable to update the load."),
        );
      }

      await loadPage();

      setMessage(workflowSuccessMessage(actionType));
    } catch (actionError) {
      setError(
        actionError instanceof Error
          ? actionError.message
          : "Unable to update the load.",
      );
    } finally {
      actionLock.current = false;
      setBusyAction(null);
    }
  }

  async function uploadDocument(documentType: string, file: File) {
    if (actionLock.current || !packet?.actionToken) return;
    actionLock.current = true;
    try {
      setBusyAction(`UPLOAD_${documentType}`);

      setError(null);
      setMessage(null);

      const formData = new FormData();

      formData.append("file", file);
      formData.append("actionToken", packet?.actionToken ?? "");

      const response = await apiFetch(
        `${API_BASE_URL}/me/loads/${loadId}/documents/${documentType}`,
        {
          method: "POST",

          body: formData,
        },
      );

      if (!response.ok) {
        invalidateAccess(response);
        throw new Error(
          await responseError(
            response,
            `Unable to upload ${formatDocumentType(documentType)}.`,
          ),
        );
      }

      await loadPage();

      setMessage(`${formatDocumentType(documentType)} captured successfully.`);
    } catch (uploadError) {
      setError(
        uploadError instanceof Error
          ? uploadError.message
          : "Unable to upload the document.",
      );
    } finally {
      actionLock.current = false;
      setBusyAction(null);
    }
  }

  async function recordStop(stop: DriverStop) {
    if (!stop.allowedAction || !packet?.actionToken || actionLock.current)
      return;
    actionLock.current = true;
    setBusyAction(`STOP_${stop.id}`);
    setError(null);
    setMessage(null);
    try {
      const response = await apiFetch(
        `/me/loads/${loadId}/stops/${stop.id}/${stop.allowedAction}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ actionToken: packet.actionToken }),
        },
      );
      if (!response.ok) {
        invalidateAccess(response);
        throw new Error(
          await responseError(
            response,
            "Unable to record this stop. Refresh before retrying.",
          ),
        );
      }
      await loadPage();
      setMessage("Stop event recorded.");
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "The stop outcome is uncertain. Refresh before retrying.",
      );
    } finally {
      actionLock.current = false;
      setBusyAction(null);
    }
  }

  if (isLoading) {
    return (
      <main className="min-h-screen bg-slate-50">
        <AppHeader />

        <div className="mx-auto max-w-4xl px-5 py-8">
          <div
            role="status"
            className="rounded-2xl border border-slate-200 bg-white p-8 shadow-sm"
          >
            Loading Driver Load Packet...
          </div>
        </div>
      </main>
    );
  }

  if (!packet || !autopilot) {
    return (
      <main className="min-h-screen bg-slate-50">
        <AppHeader />

        <div className="mx-auto max-w-4xl px-5 py-8">
          {error && <Message tone="error">{error}</Message>}
          <button
            className={`${secondaryClass} mt-4`}
            disabled={!!busyAction}
            onClick={() => void loadPage().catch(() => {})}
          >
            Retry load details
          </button>
          <Link href="/driver" className="mt-4 block text-blue-700 underline">
            Back to Driver Home
          </Link>
        </div>
      </main>
    );
  }

  const driverRequirements = packet.load.requirements.filter((requirement) =>
    DRIVER_DOCUMENT_TYPES.includes(requirement.documentType),
  );

  return (
    <main className="min-h-screen bg-slate-50">
      <AppHeader />

      <div className="mx-auto max-w-4xl px-5 py-8">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Link
            href="/driver"
            className="text-sm font-bold text-blue-700 hover:underline"
          >
            Back to Driver Home
          </Link>

          <button
            className={secondaryClass}
            disabled={!!busyAction}
            onClick={() => void loadPage().catch(() => {})}
          >
            Refresh load details
          </button>
        </div>

        {error && (
          <div className="mt-6">
            <Message tone="error">{error}</Message>
          </div>
        )}

        {message && (
          <div className="mt-6">
            <Message tone="success">{message}</Message>
          </div>
        )}

        <section className="mt-6 rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <p className="text-xs font-bold uppercase tracking-wide text-slate-600">
            Driver Load Packet
          </p>

          <div className="mt-3 flex flex-wrap items-center gap-3">
            <h1 className="text-3xl font-bold tracking-tight text-slate-950">
              {packet.load.loadNumber}
            </h1>

            <StatusBadge status={packet.load.status} />
          </div>

          <div className="mt-5 grid gap-4 sm:grid-cols-3">
            <SummaryField
              label="Driver"
              value={`${packet.driver.firstName} ${packet.driver.lastName}`}
            />

            <SummaryField
              label="Assignment"
              value={formatStatus(packet.assignment.status)}
            />

            <SummaryField
              label="Equipment"
              value={packet.load.equipment ?? "Not specified"}
            />
          </div>
        </section>

        <section className="mt-6">
          <SmartNextAction
            action={autopilot.driverAction}
            busyAction={busyAction}
            onWorkflowAction={performWorkflowAction}
            onUpload={uploadDocument}
          />
        </section>

        {autopilot.deliveryGuard.applicable && (
          <section className="mt-6">
            <DeliveryGuard guard={autopilot.deliveryGuard} />
          </section>
        )}

        <section className="mt-6 grid gap-6 md:grid-cols-2">
          {packet.load.stops.map((stop) => (
            <StopCard
              key={stop.id}
              label={stop.type === "PICKUP" ? "Pickup" : "Delivery"}
              stop={stop}
              busy={!!busyAction}
              onAction={() => void recordStop(stop)}
            />
          ))}
        </section>

        <section className="mt-6 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <h2 className="text-xl font-bold text-slate-950">Paperwork</h2>

              <p className="mt-1 text-sm text-slate-600">
                Required paperwork: {autopilot.paperwork.required.complete}/
                {autopilot.paperwork.required.total} complete
              </p>
            </div>

            {autopilot.paperwork.required.total > 0 && (
              <div className="text-right">
                <p className="text-sm font-bold text-slate-950">
                  {Math.round(
                    (autopilot.paperwork.required.complete /
                      autopilot.paperwork.required.total) *
                      100,
                  )}
                  %
                </p>

                <p className="text-xs text-slate-600">complete</p>
              </div>
            )}
          </div>

          <div className="mt-5 space-y-3">
            {driverRequirements.map((requirement) => (
              <PaperworkCard
                key={requirement.id}
                requirement={requirement}
                busyAction={busyAction}
                onUpload={uploadDocument}
              />
            ))}

            {driverRequirements.length === 0 && (
              <p className="text-sm text-slate-600">
                No driver paperwork requirements are configured for this load.
              </p>
            )}
          </div>
        </section>

        <section className="mt-6 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-xl font-bold text-slate-950">Load Timeline</h2>

          <p className="mt-1 text-sm text-slate-600">
            Important events recorded by LoadPacket.
          </p>

          <div className="mt-5">
            {autopilot.timeline.length === 0 ? (
              <p className="text-sm text-slate-600">
                No timeline events have been recorded for this load yet.
              </p>
            ) : (
              <div className="space-y-4">
                {autopilot.timeline
                  .slice()
                  .reverse()
                  .map((event) => (
                    <div key={event.id} className="flex gap-4">
                      <div className="mt-1 h-3 w-3 shrink-0 rounded-full bg-blue-600" />

                      <div>
                        <p className="font-semibold text-slate-950">
                          {event.label}
                        </p>

                        <p className="mt-1 text-sm text-slate-600">
                          {formatDateTime(event.occurredAt)}

                          {event.actorName ? ` - ${event.actorName}` : ""}
                        </p>

                        {event.type === "DOCUMENT_CAPTURED" && (
                          <DocumentEventMetadata metadata={event.metadata} />
                        )}
                      </div>
                    </div>
                  ))}
              </div>
            )}
          </div>
        </section>
      </div>
    </main>
  );
}

function SmartNextAction({
  action,
  busyAction,
  onWorkflowAction,
  onUpload,
}: {
  action: DriverAction;

  busyAction: string | null;

  onWorkflowAction: (actionType: string) => Promise<void>;

  onUpload: (documentType: string, file: File) => Promise<void>;
}) {
  const isUpload = Boolean(action.documentType);

  const canRunWorkflowAction = [
    "ACCEPT_LOAD",
    "START_LOAD",
    "COMPLETE_LOAD",
  ].includes(action.type);

  const busy = Boolean(busyAction);

  return (
    <div className="overflow-hidden rounded-3xl border border-blue-200 bg-white shadow-sm">
      <div className="bg-blue-700 px-6 py-3">
        <p className="text-xs font-bold uppercase tracking-[0.18em] text-blue-100">
          Next Action
        </p>
      </div>

      <div className="p-6">
        <h2 className="text-2xl font-bold text-slate-950">{action.label}</h2>

        <p className="mt-2 text-slate-600">{action.reason}</p>

        {canRunWorkflowAction && (
          <button
            type="button"
            disabled={busy}
            onClick={() => void onWorkflowAction(action.type)}
            className="mt-6 w-full rounded-xl bg-blue-700 px-5 py-4 text-base font-bold text-white hover:bg-blue-600 disabled:bg-slate-200 disabled:text-slate-600"
          >
            {busy ? "Working..." : action.label}
          </button>
        )}

        {isUpload && action.documentType && (
          <label className="mt-6 block cursor-pointer rounded-xl bg-blue-700 px-5 py-4 text-center text-base font-bold text-white hover:bg-blue-600 focus-within:ring-2 focus-within:ring-teal-700 focus-within:ring-offset-2">
            {busy ? "Uploading..." : action.label}

            <input
              type="file"
              disabled={busy}
              accept="application/pdf,image/jpeg,image/png"
              className="sr-only"
              onChange={(event) => {
                const file = event.target.files?.[0];

                if (file) {
                  void onUpload(action.documentType!, file);
                }

                event.currentTarget.value = "";
              }}
            />
          </label>
        )}

        {action.type === "DRIVER_COMPLETE" && (
          <div className="mt-6 rounded-xl bg-emerald-50 p-4 text-sm font-bold text-emerald-700">
            Your work on this load is complete.
          </div>
        )}
      </div>
    </div>
  );
}

function DeliveryGuard({
  guard,
}: {
  guard: AutopilotResponse["deliveryGuard"];
}) {
  if (guard.canLeave) {
    return (
      <div className="rounded-3xl border border-emerald-300 bg-emerald-50 p-6">
        <p className="text-xs font-bold uppercase tracking-[0.18em] text-emerald-700">
          Delivery Guard
        </p>

        <h2 className="mt-3 text-3xl font-bold text-emerald-950">
          YOU&apos;RE CLEAR TO LEAVE
        </h2>

        <p className="mt-2 text-emerald-800">{guard.message}</p>
      </div>
    );
  }

  return (
    <div className="rounded-3xl border border-red-300 bg-red-50 p-6">
      <p className="text-xs font-bold uppercase tracking-[0.18em] text-red-700">
        Delivery Guard
      </p>

      <h2 className="mt-3 text-3xl font-bold text-red-950">DO NOT LEAVE YET</h2>

      <p className="mt-2 text-red-800">{guard.message}</p>

      {guard.blockers.length > 0 && (
        <div className="mt-5 space-y-2">
          {guard.blockers.map((blocker) => (
            <div
              key={blocker.type}
              className="rounded-xl border border-red-200 bg-white p-4"
            >
              <p className="font-bold text-red-800">
                {formatDocumentType(blocker.type)}
              </p>

              <p className="mt-1 text-sm text-slate-600">{blocker.message}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function PaperworkCard({
  requirement,
  busyAction,
  onUpload,
}: {
  requirement: DriverPacket["load"]["requirements"][number];

  busyAction: string | null;

  onUpload: (documentType: string, file: File) => Promise<void>;
}) {
  const missing =
    requirement.status === "MISSING" || requirement.status === "REJECTED";

  const busy = Boolean(busyAction);

  return (
    <div className="flex flex-col gap-4 rounded-xl border border-slate-200 p-4 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <div className="flex flex-wrap items-center gap-2">
          <p className="font-bold text-slate-950">
            {formatDocumentType(requirement.documentType)}
          </p>

          <RequirementBadge value={requirement.requirement} />
        </div>

        <p
          className={`mt-2 text-sm font-bold ${
            missing ? "text-red-700" : "text-emerald-700"
          }`}
        >
          {formatStatus(requirement.status)}
        </p>
        {requirement.reviewReason && (
          <p className="mt-2 text-sm text-red-700">
            Reason: {requirement.reviewReason}. Needs re-upload.
          </p>
        )}
      </div>

      {missing && (
        <label className="cursor-pointer rounded-lg bg-slate-950 px-4 py-3 text-center text-sm font-bold text-white hover:bg-slate-800 focus-within:ring-2 focus-within:ring-teal-700 focus-within:ring-offset-2">
          {busy ? "Uploading..." : "Upload"}

          <input
            aria-label={`Upload ${formatDocumentType(requirement.documentType)}`}
            type="file"
            accept="application/pdf,image/jpeg,image/png"
            disabled={busy}
            className="sr-only"
            onChange={(event) => {
              const file = event.target.files?.[0];

              if (file) {
                void onUpload(requirement.documentType, file);
              }

              event.currentTarget.value = "";
            }}
          />
        </label>
      )}
    </div>
  );
}

function StopCard({
  label,
  stop,
  busy,
  onAction,
}: {
  label: string;

  stop: DriverStop;
  busy: boolean;
  onAction: () => void;
}) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
      <p className="text-xs font-bold uppercase tracking-wide text-blue-700">
        {label}
      </p>

      {stop ? (
        <>
          <h2 className="mt-3 text-lg font-bold text-slate-950">
            {stop.facilityName ?? stop.address}
          </h2>

          {stop.facilityName && (
            <p className="mt-1 text-sm text-slate-600">{stop.address}</p>
          )}

          <p className="mt-4 text-sm text-slate-600">
            Appointment: {stop.appointmentText ?? "Not specified"}
          </p>

          {stop.referenceNumber && (
            <p className="mt-1 text-sm text-slate-600">
              Reference: {stop.referenceNumber}
            </p>
          )}
          <p className="mt-3 text-sm">
            Arrival:{" "}
            {stop.arrivedAt ? formatDateTime(stop.arrivedAt) : "Not recorded"}
          </p>
          <p className="mt-1 text-sm">
            Departure:{" "}
            {stop.departedAt ? formatDateTime(stop.departedAt) : "Not recorded"}
          </p>
          {stop.allowedAction && (
            <button
              className={`${secondaryClass} mt-4`}
              disabled={busy}
              onClick={onAction}
            >
              {stop.allowedAction === "arrive"
                ? "Record arrival at"
                : "Record departure from"}{" "}
              {label.toLowerCase()}
            </button>
          )}
        </>
      ) : (
        <p className="mt-3 text-sm text-slate-600">
          Stop information unavailable.
        </p>
      )}
    </section>
  );
}

function DocumentEventMetadata({ metadata }: { metadata: unknown }) {
  if (!metadata || typeof metadata !== "object") {
    return null;
  }

  const value = metadata as {
    documentType?: string;
    originalFileName?: string;
  };

  return (
    <p className="mt-1 text-sm text-slate-600">
      {value.documentType ? formatDocumentType(value.documentType) : "Document"}

      {value.originalFileName ? ` - ${value.originalFileName}` : ""}
    </p>
  );
}

function SummaryField({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-slate-50 p-4">
      <p className="text-xs font-bold uppercase tracking-wide text-slate-600">
        {label}
      </p>

      <p className="mt-2 font-semibold text-slate-950">{value}</p>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  return (
    <span className="rounded-full bg-blue-100 px-3 py-1 text-xs font-bold text-blue-700">
      {formatStatus(status)}
    </span>
  );
}

function RequirementBadge({ value }: { value: string }) {
  const required = value === "REQUIRED";

  return (
    <span
      className={`rounded-full px-2.5 py-1 text-xs font-bold ${
        required ? "bg-red-100 text-red-700" : "bg-slate-100 text-slate-600"
      }`}
    >
      {required ? "Required" : "Optional"}
    </span>
  );
}

function Message({
  children,
  tone,
}: {
  children: React.ReactNode;

  tone: "error" | "success";
}) {
  return (
    <div
      role={tone === "error" ? "alert" : "status"}
      className={`rounded-xl border p-4 ${
        tone === "error"
          ? "border-red-200 bg-red-50 text-red-700"
          : "border-emerald-200 bg-emerald-50 text-emerald-700"
      }`}
    >
      {children}
    </div>
  );
}

function workflowEndpoint(actionType: string) {
  switch (actionType) {
    case "ACCEPT_LOAD":
      return "accept";

    case "START_LOAD":
      return "start";

    case "COMPLETE_LOAD":
      return "complete";

    default:
      return null;
  }
}

function workflowSuccessMessage(actionType: string) {
  switch (actionType) {
    case "ACCEPT_LOAD":
      return "Load accepted.";

    case "START_LOAD":
      return "Load started.";

    case "COMPLETE_LOAD":
      return "Delivery completed.";

    default:
      return "Load updated.";
  }
}

function formatDocumentType(value: string) {
  const labels: Record<string, string> = {
    BOL: "Bill of Lading",

    POD: "Proof of Delivery",

    LUMPER_RECEIPT: "Lumper Receipt",

    SCALE_TICKET: "Scale Ticket",

    CARRIER_INVOICE: "Carrier Invoice",

    RATE_CONFIRMATION: "Rate Confirmation",
  };

  return labels[value] ?? formatStatus(value);
}

function formatStatus(value: string) {
  return value
    .replaceAll("_", " ")
    .toLowerCase()
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",

    day: "numeric",

    hour: "numeric",

    minute: "2-digit",

    timeZone: "America/Chicago",
  }).format(new Date(value));
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
