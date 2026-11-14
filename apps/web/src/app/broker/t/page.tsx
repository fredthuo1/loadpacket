"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { API_BASE_URL } from "@/lib/api/api-fetch";
type View = {
  summary: {
    carrier: string;
    loadNumber: string;
    status: string;
    equipment: string | null;
  } | null;
  route: {
    sequence: number;
    type: string;
    facilityName: string | null;
    address: string;
    appointmentText: string | null;
  }[];
  documents: { type: string; handle: string }[];
  documentStatus: { type: string; status: string }[];
  agreements: { title: string; status: string }[];
  timeline: { type: string; occurredAt: string }[];
};
export default function BrokerPage() {
  const token = useRef("");
  const [data, setData] = useState<View | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const refresh = useCallback(async () => {
    setBusy(true);
    setError("");
    try {
      const response = await fetch(`${API_BASE_URL}/external/transactions`, {
        headers: { "X-Broker-Token": token.current },
        cache: "no-store",
        credentials: "omit",
        referrerPolicy: "no-referrer",
      });
      if (!response.ok)
        throw new Error(
          response.status === 404
            ? "This LoadPacket link is unavailable or has expired. Ask the carrier to send a new link."
            : "The shared load is temporarily unavailable. Try again.",
        );
      setData(await response.json());
    } catch (e) {
      setData(null);
      setError(e instanceof Error ? e.message : "Could not reach LoadPacket.");
    } finally {
      setBusy(false);
    }
  }, []);
  useEffect(() => {
    if (!token.current) {
      token.current = window.location.hash.slice(1);
      window.history.replaceState(null, "", "/broker/t");
    }
    const pending = setTimeout(() => {
      void refresh();
    }, 0);
    return () => clearTimeout(pending);
  }, [refresh]);
  return (
    <main className="mx-auto max-w-3xl space-y-6 p-6 text-slate-950">
      <p className="font-bold text-blue-700">LoadPacket</p>
      <h1 className="text-3xl font-bold">Shared Load</h1>
      {busy && <p>Loading…</p>}
      {error && <p role="alert">{error}</p>}
      <button
        className="rounded border bg-white px-4 py-2"
        disabled={busy}
        onClick={() => void refresh()}
      >
        Refresh
      </button>
      {data && (
        <>
          {data.summary && (
            <section className="rounded-xl border bg-white p-5">
              <h2 className="text-2xl font-bold">
                Load {data.summary.loadNumber}
              </h2>
              <p>{data.summary.carrier}</p>
              <p>{data.summary.status.replaceAll("_", " ")}</p>
              <p>{data.summary.equipment}</p>
            </section>
          )}
          {data.route.map((stop) => (
            <section
              key={stop.sequence}
              className="rounded-xl border bg-white p-5"
            >
              <h2 className="font-bold">
                {stop.type} · {stop.facilityName}
              </h2>
              <p>{stop.address}</p>
              <p>{stop.appointmentText}</p>
            </section>
          ))}
          {!!data.documentStatus.length && (
            <section>
              <h2 className="text-xl font-bold">Document Status</h2>
              {data.documentStatus.map((item) => (
                <p key={item.type}>
                  {item.type.replaceAll("_", " ")} — {item.status}
                </p>
              ))}
            </section>
          )}
          {!!data.documents.length && (
            <section>
              <h2 className="text-xl font-bold">Shared Documents</h2>
              {data.documents.map((file, i) => (
                <button
                  key={i}
                  disabled={busy}
                  className="mr-3 mt-3 rounded border bg-white p-3"
                  onClick={async () => {
                    setBusy(true);
                    setError("");
                    try {
                      const response = await fetch(
                        `${API_BASE_URL}/external/transactions/download`,
                        {
                          method: "POST",
                          headers: {
                            "X-Broker-Token": token.current,
                            "Content-Type": "application/json",
                          },
                          body: JSON.stringify({ handle: file.handle }),
                          cache: "no-store",
                          credentials: "omit",
                          referrerPolicy: "no-referrer",
                        },
                      );
                      if (!response.ok)
                        throw new Error(
                          "Download unavailable. Refresh to renew access, or ask the carrier for a new link.",
                        );
                      const blob = await response.blob();
                      const url = URL.createObjectURL(blob);
                      const anchor = document.createElement("a");
                      anchor.href = url;
                      anchor.download = `${file.type}.${blob.type === "application/pdf" ? "pdf" : blob.type === "image/png" ? "png" : "jpg"}`;
                      anchor.click();
                      setTimeout(() => URL.revokeObjectURL(url), 1000);
                    } catch (e) {
                      setError(
                        e instanceof Error ? e.message : "Download failed.",
                      );
                    } finally {
                      setBusy(false);
                    }
                  }}
                >
                  Download {file.type.replaceAll("_", " ")}
                </button>
              ))}
            </section>
          )}
          {data.agreements.map((item, i) => (
            <p key={i}>
              {item.title} — {item.status}
            </p>
          ))}
          {!!data.timeline.length && (
            <section>
              <h2 className="text-xl font-bold">Delivery Timeline</h2>
              {data.timeline.map((event, i) => (
                <p key={i}>
                  {event.type.replaceAll("_", " ")} ·{" "}
                  {new Date(event.occurredAt).toLocaleString()}
                </p>
              ))}
            </section>
          )}
        </>
      )}
    </main>
  );
}
