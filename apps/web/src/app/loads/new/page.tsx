import Link from "next/link";
import RateConUpload from "./ratecon-upload";

export default function NewLoadPage() {
  return (
    <main className="min-h-screen bg-slate-50">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-4">
          <div>
            <Link
              href="/"
              className="text-sm font-medium text-slate-500 hover:text-slate-900"
            >
              ← Dashboard
            </Link>

            <h1 className="mt-2 text-2xl font-bold tracking-tight text-slate-900">
              Create New Load
            </h1>
          </div>

          <div className="text-right">
            <p className="font-semibold text-slate-900">LoadPacket</p>
            <p className="text-sm text-slate-500">
              From paperwork to payment.
            </p>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-5xl px-6 py-10">
        <div className="mb-8">
          <p className="text-sm font-semibold uppercase tracking-wide text-slate-500">
            Smart Load Intake
          </p>

          <h2 className="mt-2 text-3xl font-bold tracking-tight text-slate-900">
            How would you like to create this load?
          </h2>

          <p className="mt-3 max-w-2xl text-slate-600">
            Upload a Rate Confirmation and LoadPacket will extract the load
            details for you, or enter the information manually.
          </p>
        </div>

        <div className="grid gap-6 md:grid-cols-2">
          {/* Smart upload */}
          <section className="rounded-2xl border-2 border-slate-900 bg-white p-7 shadow-sm">
            <div className="mb-6 inline-flex rounded-lg bg-slate-900 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-white">
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
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
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

          {/* Manual */}
          <section className="rounded-2xl border border-slate-200 bg-white p-7 shadow-sm">
            <div className="mb-6 inline-flex rounded-lg bg-slate-100 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-slate-600">
              Manual
            </div>

            <h3 className="text-xl font-bold text-slate-900">
              Enter Load Manually
            </h3>

            <p className="mt-2 text-sm leading-6 text-slate-600">
              Enter the load information yourself if you don&apos;t have a
              Rate Confirmation or prefer manual entry.
            </p>

            <div className="mt-6 space-y-4 rounded-xl bg-slate-50 p-5">
              <ManualField label="Load number" value="#58291" />
              <ManualField label="Broker" value="ABC Logistics" />
              <ManualField label="Rate" value="$3,450" />
              <ManualField
                label="Route"
                value="St. Louis, MO → Dallas, TX"
              />
            </div>

            <button
              type="button"
              className="mt-6 w-full rounded-lg border border-slate-300 bg-white px-5 py-2.5 text-sm font-semibold text-slate-800 transition hover:bg-slate-50"
            >
              Create Manually
            </button>
          </section>
        </div>

        <div className="mt-8 rounded-xl border border-blue-200 bg-blue-50 p-5">
          <p className="font-semibold text-slate-900">
            You stay in control.
          </p>

          <p className="mt-1 text-sm leading-6 text-slate-600">
            AI-extracted information is never automatically approved. You will
            review and correct the load details before LoadPacket creates the
            final load.
          </p>
        </div>
      </div>
    </main>
  );
}

type ManualFieldProps = {
  label: string;
  value: string;
};

function ManualField({ label, value }: ManualFieldProps) {
  return (
    <div>
      <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
        {label}
      </p>
      <p className="mt-1 text-sm font-semibold text-slate-800">{value}</p>
    </div>
  );
}