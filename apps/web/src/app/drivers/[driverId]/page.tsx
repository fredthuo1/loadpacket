"use client";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import {
  managementRequest,
  type DriverInput,
  type DriverProfile,
  type DriverLoadSummary,
} from "@/lib/api/management";
import { DriverForm } from "@/components/driver-form";
import { DriverAccount, accountLabel } from '@/components/driver-account';
import {
  ManagementPage,
  Panel,
  Feedback,
  DriverStatus,
  secondaryClass,
} from "@/components/management-ui";
function LoadCard({ load }: { load: DriverLoadSummary }) {
  return (
    <Link
      href={`/loads/${load.id}`}
      className="block rounded-xl border border-slate-200 p-4 hover:border-blue-400"
    >
      <span className="font-semibold text-blue-700">{load.loadNumber}</span>
      <p className="mt-1 text-xs text-slate-600">
        {load.status.replaceAll("_", " ")} · Assignment:{" "}
        {load.assignmentStatus.replaceAll("_", " ")}
      </p>
      <p className="mt-2 text-sm text-slate-700">
        {load.origin || "Origin not recorded"} →{" "}
        {load.destination || "Destination not recorded"}
      </p>
    </Link>
  );
}
function Detail({ label, value }: { label: string; value?: string | null }) {
  return (
    <div>
      <dt className="text-xs font-semibold uppercase tracking-wide text-slate-600">
        {label}
      </dt>
      <dd className="mt-1 break-words whitespace-pre-wrap text-sm text-slate-900">
        {value || "Not provided"}
      </dd>
    </div>
  );
}
export default function DriverDetailPage() {
  const { driverId } = useParams<{ driverId: string }>();
  const [driver, setDriver] = useState<DriverProfile | null>(null);
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    managementRequest<DriverProfile>(`/drivers/${driverId}`)
      .then((data) => {
        if (alive) {
          setDriver(data);
          if (new URLSearchParams(window.location.search).has("created")) {
            setSuccess("Driver added successfully.");
            window.history.replaceState(null, "", window.location.pathname);
          }
        }
      })
      .catch((err) => {
        if (alive) setError(err.message);
      });
    return () => {
      alive = false;
    };
  }, [driverId]);
  async function update(input?: DriverInput) {
    if (busy || !driver) return;
    setBusy(true);
    setError(null);
    setSuccess(null);
    try {
      const result = await managementRequest<DriverProfile>(
        `/drivers/${driverId}${input ? "" : driver.status === "ACTIVE" ? "/deactivate" : "/activate"}`,
        input ? "PATCH" : "POST",
        input ?? {},
      );
      setDriver(result);
      setEditing(false);
      setSuccess(
        input
          ? "Driver profile saved."
          : `Driver ${result.status === "ACTIVE" ? "activated" : "deactivated"}.`,
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to update driver.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <ManagementPage
      title={
        driver ? `${driver.firstName} ${driver.lastName}` : "Driver Detail"
      }
      description="Driver profile, account connection and load history."
      actions={
        <Link className={secondaryClass} href="/drivers">
          Back to Drivers
        </Link>
      }
    >
      <Feedback error={error} success={success} />
      {!driver && !error && <p role="status">Loading driver…</p>}
      {driver && (
        <>
          <div className="mb-6 flex flex-wrap items-center gap-3">
            <DriverStatus status={driver.status} />
            <span className="text-sm text-slate-600">
              Account: {accountLabel(driver.accountStatus, driver.accountConnected)}
            </span>
            {!editing && (
              <div className="flex gap-2 sm:ml-auto">
                <button
                  disabled={busy}
                  className={secondaryClass}
                  onClick={() => setEditing(true)}
                >
                  Edit
                </button>
                <button
                  disabled={busy}
                  className={secondaryClass}
                  onClick={() => void update()}
                >
                  {busy
                    ? "Saving…"
                    : driver.status === "ACTIVE"
                      ? "Deactivate"
                      : "Activate"}
                </button>
              </div>
            )}
          </div>
          <DriverAccount driver={driver} onChange={setDriver} />
          {editing ? (
            <DriverForm
              initial={driver}
              emailLocked={driver.accountConnected || driver.accountStatus === 'INVITE_PENDING' || driver.accountStatus === 'INVITE_CANCELLED'}
              saving={busy}
              onSave={(input) => void update(input)}
              onCancel={() => setEditing(false)}
              submitLabel="Save Changes"
            />
          ) : (
            <div className="grid gap-6 md:grid-cols-2">
              <Panel title="Contact">
                <dl className="space-y-4">
                  <Detail label="Email" value={driver.email} />
                  <Detail label="Phone" value={driver.phone} />
                  <Detail label="Hire Date" value={driver.hireDate} />
                  <Detail label="Notes" value={driver.notes} />
                </dl>
              </Panel>
              <Panel title="License">
                <dl className="space-y-4">
                  <Detail label="CDL Number" value={driver.cdlNumber} />
                  <Detail label="CDL State" value={driver.cdlState} />
                  <Detail label="Expiration" value={driver.cdlExpirationDate} />
                </dl>
              </Panel>
              <Panel title="Current Assignment">
                {driver.currentLoad ? (
                  <LoadCard load={driver.currentLoad} />
                ) : (
                  <p className="text-sm text-slate-600">No active load.</p>
                )}
              </Panel>
              <Panel title={`Recent Loads (${driver.totalLoadCount} total)`}>
                <div className="space-y-3">
                  {driver.recentLoads.length ? (
                    driver.recentLoads.map((load) => (
                      <LoadCard key={load.id} load={load} />
                    ))
                  ) : (
                    <p className="text-sm text-slate-600">
                      No load history yet.
                    </p>
                  )}
                </div>
              </Panel>
            </div>
          )}
        </>
      )}
    </ManagementPage>
  );
}
