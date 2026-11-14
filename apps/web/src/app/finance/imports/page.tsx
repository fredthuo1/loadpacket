"use client";
import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useCurrentUser } from "@/components/auth-provider";
import {
  ManagementPage,
  buttonClass,
  inputClass,
  secondaryClass,
} from "@/components/management-ui";
import {
  financeRequest,
  financeDownload,
  type ImportBatch,
} from "@/lib/api/finance";
function ImportsContent() {
  const params = useSearchParams(),
    owner = useCurrentUser()?.role === "OWNER";
  const [history, setHistory] = useState<ImportBatch[]>([]),
    [batch, setBatch] = useState<ImportBatch | null>(null),
    [mapping, setMapping] = useState<Record<string, string>>({}),
    [fields, setFields] = useState<string[]>([]),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [busy, setBusy] = useState(false),
    [page, setPage] = useState(0);
  const [warnings, setWarnings] = useState(false),
    [skip, setSkip] = useState(false),
    [reverse, setReverse] = useState(false);
  const adopt = (b: ImportBatch) => {
    setBatch(b);
    setMapping(b.columnMapping);
    setWarnings(false);
    setSkip(false);
    setPage(0);
    setReverse(false);
  };
  useEffect(() => {
    let alive = true;
    Promise.all([
      financeRequest<ImportBatch[]>("/imports"),
      financeRequest<{ importFields: string[] }>("/categories"),
      params.get("batch")
        ? financeRequest<ImportBatch>("/imports/" + params.get("batch"))
        : Promise.resolve(null),
    ])
      .then(([h, c, b]) => {
        if (alive) {
          setHistory(h);
          setFields(c.importFields);
          if (b) adopt(b);
        }
      })
      .catch((e) => {
        if (alive)
          setError(e instanceof Error ? e.message : "Could not load imports.");
      });
    return () => {
      alive = false;
    };
  }, [params]);
  async function action(work: () => Promise<void>) {
    if (busy) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await work();
      setHistory(await financeRequest<ImportBatch[]>("/imports"));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Import action failed.");
    } finally {
      setBusy(false);
    }
  }
  async function mutate(suffix: string, body: object) {
    const b = await financeRequest<ImportBatch>(
      `/imports/${batch!.id}/${suffix}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      },
    );
    adopt(b);
  }
  const editable = batch && ["DRAFT", "PREVIEWED"].includes(batch.status);
  return (
    <ManagementPage
      title="Historical Imports"
      description="Upload → map columns → review every result → explicitly confirm."
      actions={
        <Link href="/finance" className={secondaryClass}>
          Back to Finance
        </Link>
      }
    >
      <p className="mb-5 rounded-xl border bg-blue-50 p-4">
        USD only. Import completed historical deliveries, not active loads.
        Gross revenue includes fuel surcharge; payments do not add revenue. Up
        to 1,000 rows, 40 columns and 5 MB. XLSX must have one populated sheet
        and no formulas. Uploaded originals remain private.
      </p>
      <button
        className={secondaryClass}
        onClick={() =>
          void action(() =>
            financeDownload(
              "/imports/template",
              "LoadPacket-Import-Template.csv",
            ),
          )
        }
      >
        Download CSV Template
      </button>
      {owner && (
        <form
          className="my-5 rounded-xl border bg-white p-5"
          onSubmit={(e) => {
            e.preventDefault();
            const data = new FormData(e.currentTarget);
            void action(async () => {
              const uploaded = await financeRequest<ImportBatch>("/imports", {
                method: "POST",
                body: data,
              });
              adopt(
                await financeRequest<ImportBatch>("/imports/" + uploaded.id),
              );
              setNotice(
                uploaded.duplicate
                  ? "This exact file already exists. Its existing import has been opened."
                  : "File uploaded. No financial records have been created.",
              );
            });
          }}
        >
          <label className="block font-semibold">
            Choose CSV or XLSX
            <input
              required
              type="file"
              name="file"
              accept=".csv,.xlsx"
              className="mt-3 block w-full"
            />
          </label>
          <button disabled={busy} className={buttonClass + " mt-4"}>
            Upload for Review
          </button>
        </form>
      )}
      {error && (
        <p role="alert" className="my-4 rounded bg-red-50 p-4 text-red-800">
          {error}
        </p>
      )}
      {notice && (
        <p
          role="status"
          className="my-4 rounded bg-green-50 p-4 text-green-900"
        >
          {notice}
        </p>
      )}
      {busy && <p role="status">Processing import…</p>}
      {batch && (
        <section className="my-6 rounded-xl border bg-white p-5">
          <h2 className="text-xl font-bold">{batch.fileName}</h2>
          <p className="my-3">
            Status: {batch.status} · Uploaded{" "}
            {new Date(batch.createdAt).toLocaleString()}
          </p>
          {owner && (
            <button
              className={secondaryClass}
              disabled={busy}
              onClick={() =>
                void action(() =>
                  financeDownload(
                    `/imports/${batch.id}/source`,
                    batch.fileName,
                  ),
                )
              }
            >
              Download Original
            </button>
          )}
          <details className="my-3">
            <summary>Source checksum (SHA-256)</summary>
            <p className="break-all text-xs">{batch.fileChecksum}</p>
          </details>
          {owner && editable && (
            <form
              aria-label="Column mapping"
              onSubmit={(e) => {
                e.preventDefault();
                void action(() =>
                  mutate("preview", { mapping, revision: batch.revision }),
                );
              }}
            >
              <h3 className="mt-5 font-bold">Map your columns</h3>
              <p className="mb-4 text-sm">
                Required: load number, broker, delivery date and gross revenue.
                Unmapped columns remain in the original file. Dates must use
                YYYY-MM-DD or actual Excel dates. Paid invoices need a payment
                date.
              </p>
              <div className="grid gap-3 md:grid-cols-3">
                {fields.map((field) => (
                  <label key={field}>
                    {field.replace(/([A-Z])/g, " $1")}
                    <select
                      className={inputClass}
                      value={mapping[field] ?? ""}
                      onChange={(e) => {
                        const next = { ...mapping };
                        if (e.target.value) next[field] = e.target.value;
                        else delete next[field];
                        setMapping(next);
                      }}
                    >
                      <option value="">Not mapped</option>
                      {batch.headers.map((h) => (
                        <option key={h}>{h}</option>
                      ))}
                    </select>
                  </label>
                ))}
              </div>
              <button disabled={busy} className={buttonClass + " mt-5"}>
                Validate & Preview
              </button>
            </form>
          )}
          {batch.rows && batch.rows.length > 0 && (
            <>
              <h3 className="mt-6 font-bold">Preview results</h3>
              <p className="my-3">
                {Object.entries(batch.counts)
                  .map(([k, v]) => `${k}: ${v}`)
                  .join(" · ")}
              </p>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[750px] text-left text-sm">
                  <thead>
                    <tr>
                      {[
                        "Row",
                        "Result",
                        "Load / Invoice",
                        "Broker / Driver",
                        "Delivery / Gross USD",
                        "Validation notes",
                      ].map((h) => (
                        <th key={h} className="p-2">
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {batch.rows.slice(page * 50, page * 50 + 50).map((r) => (
                      <tr key={r.rowNumber} className="border-t">
                        <td className="p-2">{r.rowNumber}</td>
                        <td>{r.status}</td>
                        <td>
                          {r.normalizedData.loadNumber}
                          <br />
                          {r.normalizedData.invoiceNumber}
                        </td>
                        <td>
                          {r.normalizedData.brokerName}
                          <br />
                          {r.normalizedData.driverName}
                        </td>
                        <td>
                          {r.normalizedData.deliveryDate}
                          <br />
                          {r.normalizedData.grossRevenue}
                        </td>
                        <td className="max-w-sm p-2">
                          {r.issues.join(" ") || "Ready"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="my-4 flex gap-3">
                <button
                  className={secondaryClass}
                  disabled={page === 0}
                  onClick={() => setPage((p) => p - 1)}
                >
                  Previous rows
                </button>
                <button
                  className={secondaryClass}
                  disabled={(page + 1) * 50 >= batch.rows.length}
                  onClick={() => setPage((p) => p + 1)}
                >
                  Next rows
                </button>
              </div>
            </>
          )}
          {owner && batch.status === "PREVIEWED" && (
            <form
              className="mt-5 border-t pt-5"
              onSubmit={(e) => {
                e.preventDefault();
                void action(async () => {
                  await mutate("confirm", {
                    revision: batch.revision,
                    acceptWarnings: warnings,
                    skipInvalidRows: skip,
                  });
                  setNotice(
                    "Historical financial records imported. Live loads and driver events were not created.",
                  );
                });
              }}
            >
              <p className="mb-3">
                Confirmation uses the saved preview above. After changing
                mappings, validate again before confirming.
              </p>
              <label className="mb-3 block">
                <input
                  type="checkbox"
                  checked={warnings}
                  onChange={(e) => setWarnings(e.target.checked)}
                />{" "}
                I reviewed and accept the warning rows.
              </label>
              <label className="mb-3 block">
                <input
                  type="checkbox"
                  checked={skip}
                  onChange={(e) => setSkip(e.target.checked)}
                />{" "}
                Skip invalid and duplicate rows; import eligible rows only.
              </label>
              <label className="mb-4 block">
                <input type="checkbox" required /> I confirm these historical
                financial records are accurate.
              </label>
              <button
                disabled={
                  busy ||
                  JSON.stringify(mapping) !==
                    JSON.stringify(batch.columnMapping)
                }
                className={buttonClass}
              >
                Confirm Import
              </button>
            </form>
          )}
          {batch.status === "CONFIRMED" && (
            <div className="mt-5">
              <Link
                className="text-blue-700 underline"
                href={`/finance?section=transactions&importBatchId=${batch.id}&from=1900-01-01&to=9999-12-31`}
              >
                View imported transactions
              </Link>
              {owner && (
                <button
                  className={secondaryClass + " ml-4"}
                  disabled={busy}
                  onClick={() => setReverse((v) => !v)}
                >
                  Reverse Import
                </button>
              )}
            </div>
          )}
          {reverse && (
            <form
              className="mt-4 rounded border border-amber-300 p-4"
              onSubmit={(e) => {
                e.preventDefault();
                const reason = new FormData(e.currentTarget).get("reason");
                void action(async () => {
                  await mutate("reverse", { reason });
                  setNotice(
                    "Import reversed. Original file and audit history retained.",
                  );
                });
              }}
            >
              <p>
                Reversal removes this batch from financial totals. History
                remains available. Imports with subsequent corrections require
                separate review.
              </p>
              <label>
                Reason
                <input
                  className={inputClass}
                  name="reason"
                  minLength={5}
                  maxLength={500}
                  required
                />
              </label>
              <button disabled={busy} className={buttonClass + " mt-3"}>
                Confirm Reversal
              </button>
            </form>
          )}
        </section>
      )}
      <section className="mt-6">
        <h2 className="text-lg font-bold">Import History</h2>
        {!history.length && (
          <p className="mt-3">No spreadsheets uploaded yet.</p>
        )}
        {history.map((b) => (
          <button
            key={b.id}
            disabled={busy}
            className="mt-3 flex w-full justify-between gap-3 rounded-xl border bg-white p-4 text-left"
            onClick={() =>
              void action(async () =>
                adopt(await financeRequest<ImportBatch>("/imports/" + b.id)),
              )
            }
          >
            <span className="font-semibold">{b.fileName}</span>
            <span>
              {b.status} · {b.counts.imported ?? 0} imported
            </span>
          </button>
        ))}
      </section>
    </ManagementPage>
  );
}
export default function ImportsPage() {
  return (
    <Suspense fallback={<p className="p-8">Loading Imports…</p>}>
      <ImportsContent />
    </Suspense>
  );
}
