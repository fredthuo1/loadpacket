"use client";
import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api/api-fetch";
import type { DocumentIntelligence } from "../../../../packages/api-contracts/document-intelligence";
import { secondaryClass } from "./management-ui";
export function IntakeEvidence({
  documentId,
  evidence,
  onRetry,
}: {
  documentId: string;
  evidence: DocumentIntelligence;
  onRetry: () => void;
}) {
  const [preview, setPreview] = useState(""),
    [mime, setMime] = useState(""),
    [error, setError] = useState("");
  useEffect(() => {
    let active = true,
      url = "";
    void apiFetch(`/documents/${documentId}/intake-preview`)
      .then(async (response) => {
        if (!response.ok) throw Error();
        const blob = await response.blob();
        url = URL.createObjectURL(blob);
        if (active) {
          setPreview(url);
          setMime(blob.type);
        } else URL.revokeObjectURL(url);
      })
      .catch(() => {
        if (active)
          setError(
            "Preview unavailable. Retry or use your original document before confirming.",
          );
      });
    return () => {
      active = false;
      if (url) URL.revokeObjectURL(url);
    };
  }, [documentId]);
  return (
    <section className="my-6 min-w-0 space-y-4 rounded-xl border bg-white p-4">
      <h2 className="text-lg font-bold">Original and source evidence</h2>
      <p className="text-sm">
        {evidence.status === "FAILED"
          ? "Processing failed. Enter verified values manually."
          : evidence.classification === "UNKNOWN"
            ? "Document type is uncertain. Confirm this is a Rate Confirmation."
            : "Rate Confirmation candidate — verify every field."}{" "}
        Attempt {evidence.attemptCount} of 2. External AI is disabled.
      </p>
      {evidence.retryAllowed && (
        <button type="button" className={secondaryClass} onClick={onRetry}>
          Retry processing once
        </button>
      )}
      {error && <p role="alert">{error}</p>}
      {preview && (
        <>
          <a
            href={preview}
            target="_blank"
            rel="noreferrer"
            className="text-blue-700 underline"
          >
            Open original document
          </a>
          {mime === "application/pdf" ? (
            <iframe
              className="h-96 w-full border"
              title="Original Rate Confirmation"
              sandbox="allow-same-origin"
              src={preview}
            />
          ) : (
            <>
              {/* eslint-disable-next-line @next/next/no-img-element -- private revocable Blob; no image optimizer */}
              <img
                className="max-h-96 max-w-full object-contain"
                alt="Original Rate Confirmation"
                src={preview}
              />
            </>
          )}
        </>
      )}
      <details>
        <summary className="cursor-pointer font-semibold">
          Field evidence and uncertainty
        </summary>
        <p className="my-2 text-sm">
          Unverified means a suggestion, not a probability of accuracy. Source
          evidence remains unchanged when you correct a value below.
        </p>
        <div className="space-y-3">
          {Object.entries(evidence.fields).map(([name, field]) => (
            <article key={name} className="break-words border-t pt-3 text-sm">
              <strong>{name}</strong>:{" "}
              {field.value === null ? "Missing" : String(field.value)} ·{" "}
              {field.uncertainty}
              {field.warnings.map((w) => (
                <p key={w} className="text-amber-800">
                  {w}
                </p>
              ))}
              {field.sources.map((s, i) => (
                <blockquote className="mt-1 border-l-2 pl-3" key={i}>
                  Page {s.page} ·{" "}
                  {s.method === "LOCAL_OCR" ? "Local OCR" : "PDF text"}:{" "}
                  {s.text}
                </blockquote>
              ))}
            </article>
          ))}
        </div>
      </details>
    </section>
  );
}
