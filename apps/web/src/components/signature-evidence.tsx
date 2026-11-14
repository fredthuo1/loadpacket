"use client";
import { useEffect, useState } from "react";
import type { SignatureEvidence } from "../../../../packages/api-contracts/signatures";
import { apiFetch } from "@/lib/api/api-fetch";
import { managementRequest } from "@/lib/api/management";
import { secondaryClass } from "./management-ui";
export function SignatureEvidencePanel({
  documentId,
  versionId,
}: {
  documentId: string;
  versionId: string;
}) {
  const [items, setItems] = useState<SignatureEvidence[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<{ url: string; id: string } | null>(
    null,
  );
  const [busy, setBusy] = useState(false);
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    let active = true;
    void managementRequest<{ signatures: SignatureEvidence[] }>(
      `/documents/${documentId}/signatures`,
    )
      .then((result) => {
        if (active) {
          setItems(result.signatures);
          setError(null);
        }
      })
      .catch(() => {
        if (active)
          setError(
            "Signature evidence is unavailable. Document review can continue.",
          );
      });
    return () => {
      active = false;
    };
  }, [documentId, revision]);
  useEffect(
    () => () => {
      if (preview) URL.revokeObjectURL(preview.url);
    },
    [preview],
  );
  async function view(item: SignatureEvidence) {
    setBusy(true);
    setError(null);
    try {
      const response = await apiFetch(
        `/documents/${documentId}/signatures/${item.id}/content`,
        { cache: "no-store" },
      );
      if (!response.ok) throw new Error();
      const blob = await response.blob();
      if (blob.type !== "image/png") throw new Error();
      setPreview({ id: item.id, url: URL.createObjectURL(blob) });
    } catch {
      setError(
        "Signature preview is unavailable. Retry with authorized access.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <section
      aria-label="Signature Evidence"
      className="mt-4 space-y-3 border-t border-slate-200 pt-3 text-slate-950"
    >
      <h4 className="font-semibold">Signature Evidence</h4>
      <p className="text-sm text-slate-600">
        Optional captured evidence; signer identity is not independently
        verified.
      </p>
      {error && (
        <>
          <p role="alert">{error}</p>
          <button
            className={secondaryClass}
            onClick={() => setRevision((value) => value + 1)}
          >
            Retry Signature Evidence
          </button>
        </>
      )}
      {!error && !items && <p>Loading signatures…</p>}
      {items && !items.length && <p>No signature captured.</p>}
      {items?.map((item) => (
        <div key={item.id} className="rounded border border-slate-200 p-3">
          <p className="font-semibold">
            Signature captured · {item.signerName}
          </p>
          <p>
            {item.signerRole === "RECEIVER"
              ? "Receiver / Consignee"
              : item.signerRole === "SHIPPER"
                ? "Shipper"
                : "Driver"}
          </p>
          <p className="text-sm">
            {new Date(item.signedAt).toLocaleString()} · Version{" "}
            {item.versionNumber}
            {item.documentVersionId === versionId
              ? " · Current version"
              : " · Earlier version"}
          </p>
          <button
            className={secondaryClass}
            disabled={busy}
            onClick={() => void view(item)}
          >
            View Signature
          </button>
          {preview?.id === item.id && (
            <>
              {/* Authenticated PNG blob: Next image optimization must not request private API files. */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={preview.url}
                alt={`Captured signature of ${item.signerName}`}
                className="mt-2 max-h-44 w-full object-contain"
              />
              <button
                className={secondaryClass}
                onClick={() => setPreview(null)}
              >
                Close Preview
              </button>
            </>
          )}
        </div>
      ))}
    </section>
  );
}
