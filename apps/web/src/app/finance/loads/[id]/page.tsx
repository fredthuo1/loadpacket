"use client";
import { InvoiceCharges } from "@/components/invoice-charges";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { ManagementPage, secondaryClass } from "@/components/management-ui";
import { financeRequest, moneyText } from "@/lib/api/finance";
type LoadFinancials = {
  loadId: string;
  loadNumber: string;
  linehaul: string | null;
  fuelSurcharge: string | null;
  agreedRate: string;
  additionalRevenue: string;
  grossRevenue: string;
  expenses: string;
  net: string;
  categories: { category: string; effect: string; amount: string }[];
  unrecognizedCharges: { type: string; amount: string; status: string }[];
};
export default function LoadFinancePage() {
  const { id } = useParams<{ id: string }>();
  return <LoadFinanceScreen key={id} id={id} />;
}
function LoadFinanceScreen({ id }: { id: string }) {
  const [revision, setRevision] = useState(0);
  const [data, setData] = useState<LoadFinancials | null>(null),
    [error, setError] = useState("");
  useEffect(() => {
    let alive = true;
    financeRequest<LoadFinancials>("/loads/" + id)
      .then((d) => {
        if (alive) {
          setData(d);
          setError("");
        }
      })
      .catch((e) => {
        if (alive) {
          setData(null);
          setError(
            e instanceof Error ? e.message : "Load financials unavailable.",
          );
        }
      });
    return () => {
      alive = false;
    };
  }, [id, revision]);
  return (
    <ManagementPage
      title={data ? `Load ${data.loadNumber} Financials` : "Load Financials"}
      description="Agreed load value plus recorded income and costs."
      actions={
        <Link className={secondaryClass} href={"/loads/" + id}>
          Open Load
        </Link>
      }
    >
      <InvoiceCharges
        loadId={id}
        onChanged={() => setRevision((value) => value + 1)}
      />
      {error && (
        <div>
          <p role="alert" className="text-red-700">
            {error}
          </p>
          <button
            className={`${secondaryClass} my-4`}
            onClick={() => {
              setError("");
              setRevision((value) => value + 1);
            }}
          >
            Retry load financials
          </button>
        </div>
      )}
      {!data && !error && <p role="status">Loading load financials…</p>}
      {data && (
        <>
          <p className="mb-5">
            This estimate includes the agreed rate before invoicing. The Finance
            overview recognizes operational load revenue only after an invoice
            is submitted. Costs must be recorded; missing costs are not
            estimates.
          </p>
          <div className="grid gap-4 md:grid-cols-3">
            {[
              ["Linehaul", data.linehaul],
              ["Fuel Surcharge", data.fuelSurcharge],
              ["Agreed Rate", data.agreedRate],
              ["Additional Recorded Income", data.additionalRevenue],
              ["Gross Load Value", data.grossRevenue],
              ["Recorded Costs", data.expenses],
              ["Estimated Net", data.net],
            ].map(([k, v]) => (
              <section className="rounded-xl border bg-white p-5" key={k}>
                <h2>{k}</h2>
                <p className="mt-2 text-2xl font-bold">{moneyText(v)}</p>
              </section>
            ))}
          </div>
          <section className="my-6 rounded-xl border bg-white p-5">
            <h2 className="font-bold">Recorded categories</h2>
            {data.categories.map((c) => (
              <p key={c.effect + c.category} className="mt-3">
                {c.category} ({c.effect}): {moneyText(c.amount)}
              </p>
            ))}
            {!data.categories.length && (
              <p>No additional income or costs recorded.</p>
            )}
          </section>
          {data.unrecognizedCharges.length > 0 && (
            <section className="mb-5 rounded-xl border bg-amber-50 p-5">
              <h2 className="font-bold">Charges requiring revenue review</h2>
              <p>
                These opportunities are not automatically added to revenue;
                confirm whether the agreed rate already includes them before
                issuing reviewed invoice charges.
              </p>
              {data.unrecognizedCharges.map((c, i) => (
                <p key={i}>
                  {c.type} · {c.status} · {moneyText(c.amount)}
                </p>
              ))}
            </section>
          )}
          <Link
            className="text-blue-700 underline"
            href={`/finance?section=transactions&loadId=${id}&from=1900-01-01&to=9999-12-31`}
          >
            View this load&apos;s ledger
          </Link>
        </>
      )}
    </ManagementPage>
  );
}
