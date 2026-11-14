"use client";
import { SignatureEvidencePanel } from "./signature-evidence";
import { useCallback, useEffect, useState } from "react";
import { managementRequest } from "@/lib/api/management";
import { API_BASE_URL } from "@/lib/api/api-fetch";
import {
  buttonClass,
  secondaryClass,
  inputClass,
  Feedback,
} from "./management-ui";
type Requirement = {
  id: string;
  documentType: string;
  status: string;
  reason: string | null;
  documentId: string | null;
  versionId: string | null;
  versionNumber: number | null;
  fileName: string | null;
  uploadedBy: string | null;
};
type Review = { loadStatus: string; requirements: Requirement[] };
export function DocumentReview({
  loadId,
  onChange,
}: {
  loadId: string;
  onChange: () => Promise<void>;
}) {
  const [data, setData] = useState<Review | null>(null);
  const [reasons, setReasons] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const refresh = useCallback(
    () =>
      managementRequest<Review>(`/back-office/loads/${loadId}/requirements`),
    [loadId],
  );
  useEffect(() => {
    let active = true;
    void refresh()
      .then((result) => {
        if (active) setData(result);
      })
      .catch((err) => {
        if (active)
          setError(
            err instanceof Error
              ? err.message
              : "Unable to load document reviews.",
          );
      });
    return () => {
      active = false;
    };
  }, [refresh]);
  async function review(
    item: Requirement,
    action: "accept" | "reject" | "waive",
  ) {
    setBusy(true);
    setError(null);
    setSuccess(null);
    try {
      await managementRequest(
        `/back-office/loads/${loadId}/requirements/${item.id}/${action}`,
        "POST",
        {
          ...(item.versionId ? { versionId: item.versionId } : {}),
          ...(action === "accept" ? {} : { reason: reasons[item.id] ?? "" }),
        },
      );
      setData(await refresh());
      await onChange();
      setSuccess("Document review saved.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Review failed.");
    } finally {
      setBusy(false);
    }
  }
  async function download(item: Requirement) {
    setBusy(true);
    setError(null);
    try {
      const grant = await managementRequest<{ path: string }>(
        `/documents/vault/${item.documentId}/versions/${item.versionId}/download`,
        "POST",
        {},
      );
      if (!grant.path.startsWith("/documents/vault-files/"))
        throw new Error("Invalid download destination.");
      const link = document.createElement("a");
      link.href = API_BASE_URL + grant.path;
      link.rel = "noreferrer";
      link.click();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Download failed.");
    } finally {
      setBusy(false);
    }
  }
  const editable = data && !["INVOICED", "PAID"].includes(data.loadStatus);
  return (
    <section
      aria-label="Document review"
      className="min-w-0 rounded-2xl border border-slate-200 bg-white p-5 sm:p-6"
    >
      <h2 className="text-xl font-bold">Review Documents</h2>
      <p className="my-3 text-sm text-slate-600">
        Review the current file before accepting it. Rejections and waivers
        require a reason.
      </p>
      <Feedback error={error} success={success} />
      {!data ? (
        <p>Loading reviews…</p>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {data.requirements.map((item) => (
            <div key={item.id} className="min-w-0 rounded-xl border border-slate-200 p-4">
              <h3 className="font-semibold">
                {item.documentType.replaceAll("_", " ")}
              </h3>
              <p className="my-2 w-fit rounded-full bg-slate-100 px-3 py-1 text-xs font-bold text-slate-700">{item.status}</p>
              {item.fileName && (
                <p className="break-words text-sm leading-6 text-slate-600">
                  {item.fileName} · Version {item.versionNumber} · Uploaded by{" "}
                  {item.uploadedBy ?? "Unknown (historical upload)"}
                </p>
              )}
              {item.reason && (
                <p className="my-2 text-sm">
                  Reason: {item.reason}
                  {item.status === "REJECTED" ? " — Needs re-upload" : ""}
                </p>
              )}
              <div className="mt-3 flex flex-wrap gap-2">
                {item.versionId && (
                  <button
                    disabled={busy}
                    className={secondaryClass}
                    onClick={() => void download(item)}
                  >
                    View {item.documentType}
                  </button>
                )}
                {editable && item.status === "RECEIVED" && item.versionId && (
                  <button
                    disabled={busy}
                    className={buttonClass}
                    onClick={() => void review(item, "accept")}
                  >
                    Accept {item.documentType}
                  </button>
                )}
              </div>
              {editable &&
                ["MISSING", "RECEIVED", "REJECTED"].includes(item.status) && (
                  <div className="mt-3">
                    <label className="text-sm">
                      Reason for {item.documentType}
                      <input
                        className={inputClass}
                        maxLength={1000}
                        disabled={busy}
                        value={reasons[item.id] ?? ""}
                        onChange={(event) =>
                          setReasons({
                            ...reasons,
                            [item.id]: event.target.value,
                          })
                        }
                      />
                    </label>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {item.status === "RECEIVED" && item.versionId && (
                        <button
                          disabled={busy || !reasons[item.id]?.trim()}
                          className={secondaryClass}
                          onClick={() => void review(item, "reject")}
                        >
                          Reject {item.documentType}
                        </button>
                      )}
                      <button
                        disabled={busy || !reasons[item.id]?.trim()}
                        className={secondaryClass}
                        onClick={() => void review(item, "waive")}
                      >
                        Waive {item.documentType}
                      </button>
                    </div>
                  </div>
                )}
              {item.documentId &&
                item.versionId &&
                ["BOL", "POD"].includes(item.documentType) && (
                  <SignatureEvidencePanel
                    key={`${item.documentId}-${item.versionId}`}
                    documentId={item.documentId}
                    versionId={item.versionId}
                  />
                )}
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
