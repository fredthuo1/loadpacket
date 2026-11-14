import Link from 'next/link';

export type OperationsSummaryData = {
  drivers: { active: number; inactive: number; invitePending: number };
  attention: { awaitingReview: number; blockedLoads: number; expiringDocuments: number; expiredDocuments: number; driverComplianceIssues: number | null };
  receivables: { partialCount: number; overdueCount: number; overdueAmount: string } | null;
  moneyFound: { count: number; amount: string } | null;
  recentActivity: Array<{ id: string; loadId: string; type: string; actorName: string | null; occurredAt: string }>;
};

const linkClass = 'inline-flex min-h-11 items-center justify-center rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-blue-700 hover:bg-slate-50';

export function OperationsSummary({ data, owner }: { data: OperationsSummaryData; owner: boolean }) {
  return <section className="mt-6 space-y-4" aria-label="Operations overview">
    <div className="rounded-2xl border border-slate-200 bg-white p-5">
      <h2 className="text-lg font-bold text-slate-950">Needs your attention</h2>
      <p className="mt-1 text-sm text-slate-600">Review paperwork and driver items before the next handoff.</p>
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
          <p className="font-semibold text-amber-950">{data.attention.blockedLoads} loads blocked by paperwork</p>
          <p className="mt-2 text-sm text-amber-950">{data.attention.awaitingReview} documents awaiting review</p>
          <p className="mt-2 text-xs text-slate-600">Booked, in-transit, delivered and payment-ready loads.</p>
          <Link className={`${linkClass} mt-3`} href={owner ? '/back-office' : '/#loads'}>{owner ? 'Review Documents' : 'Review loads'}</Link>
        </div>
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
          {owner && <p className="font-semibold text-amber-950">{data.attention.driverComplianceIssues === null ? 'Driver compliance unavailable' : `${data.attention.driverComplianceIssues} drivers need compliance attention`}</p>}
          <p className="mt-2 text-sm text-amber-950">{data.attention.expiringDocuments} documents expiring within 30 days · {data.attention.expiredDocuments} expired documents</p>
          {owner && <p className="mt-2 text-xs text-slate-600">Compliance checks require a CDL and medical certificate with a current expiration date.</p>}
          <div className="mt-3 flex flex-wrap gap-2"><Link className={linkClass} href="/drivers">Review drivers</Link><Link className={linkClass} href="/documents">Review expiry dates</Link></div>
        </div>
      </div>
      {owner && data.moneyFound && <div className="mt-3 rounded-xl bg-blue-50 p-4 text-sm text-slate-950">
        <p className="font-semibold">${data.moneyFound.amount} in potential charges · {data.moneyFound.count} opportunities</p>
        <p className="mt-1 text-slate-600">Detected and approved opportunities across all loads, including paid loads. These are not collected revenue. Open a load to review its charges.</p>
        <Link className={`${linkClass} mt-3`} href="/#loads">Review load opportunities</Link>
      </div>}
    </div>
    <div className="flex flex-wrap gap-2">
      <Link className="inline-flex min-h-11 items-center rounded-lg bg-blue-700 px-4 py-2 text-sm font-bold text-white" href="/loads/new">Create Load</Link>
      <Link className={linkClass} href="/documents">{owner ? 'Upload Document' : 'View Documents'}</Link>
      <Link className={linkClass} href="/drivers/new">Add Driver</Link>
    </div>
  </section>;
}

export function OperationsDetails({ data, owner }: { data: OperationsSummaryData; owner: boolean }) {
  return <section className="mt-6 grid gap-4 sm:grid-cols-2" aria-label="Driver and receivables details">
    <div className="rounded-xl border border-slate-200 bg-white p-5"><h2 className="font-bold">Drivers</h2><p className="mt-2">{data.drivers.active} active · {data.drivers.inactive} inactive</p>{owner && <p className="mt-2">{data.drivers.invitePending} invitation pending</p>}<Link className={`${linkClass} mt-3`} href="/drivers">View Drivers</Link></div>
    {owner && data.receivables && <div className="rounded-xl border border-slate-200 bg-white p-5"><h2 className="font-bold">Accounts Receivable</h2><p className="mt-2">{data.receivables.partialCount} partially paid invoices</p><p className="mt-2">{data.receivables.overdueCount} overdue invoices · ${data.receivables.overdueAmount}</p><Link className={`${linkClass} mt-3`} href="/back-office/accounts-receivable">View receivables</Link></div>}
  </section>;
}

export function RecentActivity({ data }: { data: OperationsSummaryData }) {
  return <section className="mt-6 rounded-xl border border-slate-200 bg-white p-5" aria-label="Recent activity"><h2 className="font-bold">Recent Activity</h2>{data.recentActivity.length === 0 ? <p className="mt-3 text-sm text-slate-600">No recent activity.</p> : <ul className="mt-3 divide-y divide-slate-100">{data.recentActivity.map(event => <li key={event.id} className="py-3 text-sm"><Link href={`/loads/${event.loadId}`} className="inline-flex min-h-11 items-center font-semibold text-blue-700">{event.type.replaceAll('_', ' ')}</Link><span className="ml-2 text-slate-600">{event.actorName ?? 'System'} · {new Date(event.occurredAt).toLocaleString()}</span></li>)}</ul>}</section>;
}
