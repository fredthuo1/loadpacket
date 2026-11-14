"use client";
import { accountLabel } from '@/components/driver-account';
import Link from "next/link";
import { useEffect, useState } from "react";
import { managementRequest, type DriverSummary } from "@/lib/api/management";
import {
  ManagementPage,
  DriverStatus,
  Feedback,
  buttonClass,
  inputClass,
} from "@/components/management-ui";
export default function DriversPage() {
  const [drivers, setDrivers] = useState<DriverSummary[] | null>(null);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("ALL");
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    managementRequest<DriverSummary[]>("/drivers")
      .then((data) => {
        if (alive) setDrivers(data);
      })
      .catch((err) => {
        if (alive) setError(err.message);
      });
    return () => {
      alive = false;
    };
  }, []);
  const shown = drivers?.filter(
    (driver) =>
      (status === "ALL" || driver.status === status) &&
      `${driver.firstName} ${driver.lastName} ${driver.email ?? ""}`
        .toLowerCase()
        .includes(search.trim().toLowerCase()),
  );
  return (
    <ManagementPage
      title="Drivers"
      description="Manage your company’s driver roster, assignments and account connections."
      actions={
        <Link className={buttonClass} href="/drivers/new">
          + Add Driver
        </Link>
      }
    >
      <Feedback error={error} />
      <div className="mb-6 grid gap-4 sm:grid-cols-[1fr_200px]">
        <label className="text-sm font-semibold text-slate-700">
          Search drivers
          <input
            className={inputClass}
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Name or email"
          />
        </label>
        <label className="text-sm font-semibold text-slate-700">
          Status
          <select
            className={inputClass}
            value={status}
            onChange={(event) => setStatus(event.target.value)}
          >
            <option value="ALL">All</option>
            <option value="ACTIVE">Active</option>
            <option value="INACTIVE">Inactive</option>
          </select>
        </label>
      </div>
      {!drivers && !error && <p role="status">Loading drivers…</p>}
      {drivers && (
        <p className="mb-4 text-sm text-slate-600">
          {drivers.filter((d) => d.status === "ACTIVE").length} active ·{" "}
          {drivers.filter((d) => d.status === "INACTIVE").length} inactive
        </p>
      )}
      <div className="grid gap-4 md:grid-cols-2">
        {shown?.map((driver) => (
          <Link
            key={driver.id}
            href={`/drivers/${driver.id}`}
            className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm focus:outline-2 focus:outline-blue-600 hover:border-blue-400"
          >
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="text-lg font-bold text-slate-950">
                {driver.firstName} {driver.lastName}
              </h2>
              <DriverStatus status={driver.status} />
            </div>
            <p className="mt-3 break-words text-sm text-slate-600">
              {driver.email || "No email"}
              {driver.phone ? ` · ${driver.phone}` : ""}
            </p>
            <p className="mt-4 text-sm font-semibold text-slate-800">
              {driver.currentLoad
                ? `Current load: ${driver.currentLoad.loadNumber}`
                : "No active load"}
            </p>
            <p className="mt-2 text-sm text-slate-600">
              Account: {accountLabel(driver.accountStatus, driver.accountConnected)}
            </p>
          </Link>
        ))}
      </div>
      {shown?.length === 0 && (
        <p className="rounded-xl border border-dashed border-slate-300 p-8 text-center text-slate-600">
          {drivers?.length
            ? "No drivers match your search."
            : "No drivers yet. Add your first driver to get started."}
        </p>
      )}
    </ManagementPage>
  );
}
