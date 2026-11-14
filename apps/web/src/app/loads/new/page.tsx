import Link from "next/link";

import RateConUpload from "./ratecon-upload";

export default function NewLoadPage() {
  return (
    <main className="min-h-screen bg-slate-50">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-4 py-4 sm:px-6">
          <div>
            <Link
              href="/"
              className="text-sm font-medium text-slate-600 hover:text-slate-900"
            >
              ← Dashboard
            </Link>

            <h1 className="mt-2 text-2xl font-bold tracking-tight text-slate-900">
              Create New Load
            </h1>
          </div>

          <div className="text-left sm:text-right">
            <p className="font-semibold text-slate-900">LoadPacket</p>

            <p className="text-xs text-slate-600">Carrier Operations</p>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
        <div className="mb-8">
          <p className="text-sm font-semibold uppercase tracking-wide text-slate-600">
            Smart Load Intake
          </p>

          <h2 className="mt-2 text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">
            How would you like to create this load?
          </h2>

          <p className="mt-3 max-w-2xl text-slate-600">
            Upload a Rate Confirmation and LoadPacket will extract the load
            details for you, or enter the information manually.
          </p>
          <ol aria-label="Rate Confirmation steps" className="mt-5 flex flex-wrap gap-x-4 gap-y-2 text-sm font-semibold text-slate-600">
            <li>1. Upload</li><li>2. Extract</li><li>3. Review</li><li>4. Create Load</li>
          </ol>
        </div>

        <div className="grid gap-6 md:grid-cols-2">
          <section className="min-w-0 rounded-2xl border border-blue-300 bg-white p-5 shadow-sm sm:p-6">
            <div className="mb-6 inline-flex rounded-lg bg-blue-50 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-blue-800">
              Recommended
            </div>

            <h3 className="text-xl font-bold text-slate-900">
              Upload Rate Confirmation
            </h3>

            <p className="mt-2 text-sm leading-6 text-slate-600">
              Let LoadPacket read your RateCon and prepare the load
              automatically.
            </p>

            <RateConUpload />

            <div className="mt-6">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-600">
                LoadPacket will look for
              </p>

              <div className="mt-3 grid grid-cols-2 gap-2 text-sm text-slate-600">
                <p>✓ Load number</p>
                <p>✓ Broker</p>
                <p>✓ Rate</p>
                <p>✓ Pickup</p>
                <p>✓ Delivery</p>
                <p>✓ Required documents</p>
              </div>
            </div>
          </section>

          <section className="min-w-0 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
            <div className="mb-6 inline-flex rounded-lg bg-slate-100 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-slate-600">
              Manual
            </div>

            <h3 className="text-xl font-bold text-slate-900">
              Enter Load Manually
            </h3>

            <p className="mt-2 text-sm leading-6 text-slate-600">
              Don&apos;t have a Rate Confirmation yet? Enter the load, route,
              rate, and paperwork requirements yourself.
            </p>

            <div className="mt-6 rounded-xl bg-slate-50 p-5">
              <p className="text-sm font-semibold text-slate-900">
                Manual entry includes
              </p>

              <div className="mt-4 space-y-3 text-sm text-slate-600">
                <p>✓ Load and broker details</p>
                <p>✓ Pickup and delivery</p>
                <p>✓ Load rate</p>
                <p>✓ Equipment</p>
                <p>✓ Required paperwork</p>
              </div>
            </div>

            <Link
              href="/loads/new/manual"
              className="mt-6 flex w-full items-center justify-center rounded-lg border border-slate-300 bg-white px-5 py-2.5 text-sm font-semibold text-slate-800 transition hover:border-slate-400 hover:bg-slate-50"
            >
              Create Manually
            </Link>
          </section>
        </div>

        <div className="mt-8 rounded-xl border border-blue-200 bg-blue-50 p-5">
          <p className="font-semibold text-slate-900">
            Two ways in. One load workflow.
          </p>

          <p className="mt-1 text-sm leading-6 text-slate-600">
            Whether a load starts from a Rate Confirmation or manual entry, it
            becomes the same LoadPacket load and can be assigned to a driver,
            tracked, documented, and billed.
          </p>
        </div>
      </div>
    </main>
  );
}
