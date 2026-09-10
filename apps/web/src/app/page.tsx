import Link from "next/link";

export default function Home() {
  return (
    <main className="min-h-screen bg-slate-50">
      {/* Header */}
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-slate-900">
              LoadPacket
            </h1>
            <p className="text-sm text-slate-500">
              From paperwork to payment.
            </p>
          </div>

          <Link
  		href="/loads/new"
  		className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-700"
	 >
  		+ New Load
	 </Link>
        </div>
      </header>

      {/* Page Content */}
      <div className="mx-auto max-w-7xl px-6 py-8">
        <div className="mb-8">
          <p className="text-sm font-medium text-slate-500">Dashboard</p>
          <h2 className="mt-1 text-3xl font-bold tracking-tight text-slate-900">
            Good morning
          </h2>
          <p className="mt-2 text-slate-600">
            Here&apos;s what&apos;s happening with your loads.
          </p>
        </div>

        {/* Stats */}
        <section className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <StatCard
            title="Active Loads"
            value="2"
            description="Currently moving"
          />

          <StatCard
            title="Payment Ready"
            value="$3,450"
            description="Ready to invoice"
          />

          <StatCard
            title="Blocked"
            value="$2,800"
            description="Missing paperwork"
          />

          <StatCard
            title="Needs Attention"
            value="1"
            description="Requires action"
          />
        </section>

        {/* Loads */}
        <section className="mt-10">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h3 className="text-xl font-semibold text-slate-900">
                Recent Loads
              </h3>
              <p className="text-sm text-slate-500">
                Track paperwork and payment readiness.
              </p>
            </div>

            <button className="text-sm font-semibold text-slate-700 hover:text-slate-950">
              View all
            </button>
          </div>

          <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
            <div className="grid grid-cols-12 border-b border-slate-200 bg-slate-50 px-5 py-3 text-xs font-semibold uppercase tracking-wide text-slate-500">
              <div className="col-span-2">Load</div>
              <div className="col-span-3">Broker</div>
              <div className="col-span-3">Route</div>
              <div className="col-span-2">Rate</div>
              <div className="col-span-2">Status</div>
            </div>

            <LoadRow
              loadNumber="#58291"
              broker="ABC Logistics"
              route="St. Louis, MO → Dallas, TX"
              rate="$3,450"
              status="Confirmed"
              statusStyle="bg-blue-50 text-blue-700"
            />

            <LoadRow
              loadNumber="#58304"
              broker="NorthStar Freight"
              route="Kansas City, MO → Atlanta, GA"
              rate="$2,800"
              status="Missing POD"
              statusStyle="bg-red-50 text-red-700"
            />
          </div>
        </section>

        {/* Needs Attention */}
        <section className="mt-10">
          <h3 className="text-xl font-semibold text-slate-900">
            Needs Attention
          </h3>

          <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-5">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="font-semibold text-slate-900">
                  Load #58304 is missing a POD
                </p>

                <p className="mt-1 text-sm text-slate-600">
                  $2,800 is currently blocked by missing paperwork.
                </p>
              </div>

              <button className="rounded-lg border border-amber-300 bg-white px-3 py-2 text-sm font-semibold text-slate-800 hover:bg-amber-100">
                Review
              </button>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}

type StatCardProps = {
  title: string;
  value: string;
  description: string;
};

function StatCard({ title, value, description }: StatCardProps) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <p className="text-sm font-medium text-slate-500">{title}</p>

      <p className="mt-2 text-2xl font-bold tracking-tight text-slate-900">
        {value}
      </p>

      <p className="mt-1 text-sm text-slate-500">{description}</p>
    </div>
  );
}

type LoadRowProps = {
  loadNumber: string;
  broker: string;
  route: string;
  rate: string;
  status: string;
  statusStyle: string;
};

function LoadRow({
  loadNumber,
  broker,
  route,
  rate,
  status,
  statusStyle,
}: LoadRowProps) {
  return (
    <div className="grid grid-cols-12 items-center border-b border-slate-100 px-5 py-4 text-sm last:border-0">
      <div className="col-span-2 font-semibold text-slate-900">
        {loadNumber}
      </div>

      <div className="col-span-3 text-slate-700">{broker}</div>

      <div className="col-span-3 text-slate-700">{route}</div>

      <div className="col-span-2 font-semibold text-slate-900">{rate}</div>

      <div className="col-span-2">
        <span
          className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${statusStyle}`}
        >
          {status}
        </span>
      </div>
    </div>
  );
}