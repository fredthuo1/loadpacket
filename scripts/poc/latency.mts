import { performance } from "node:perf_hooks";
import assert from "node:assert/strict";
import { percentiles } from "./core.mts";
export const workloadNames = [
  "simple-read",
  "simple-write",
  "multi-record-transaction",
  "load-creation",
  "document-metadata-commit",
  "driver-stop-event",
  "signature-commit",
  "finance-transaction",
] as const;
export interface Sample {
  operation: string;
  layer: "database" | "api";
  elapsedMs: number;
  success: boolean;
  phase: string;
}
export async function measure<T>(
  samples: Sample[],
  operation: string,
  layer: Sample["layer"],
  phase: string,
  work: () => Promise<T>,
): Promise<T> {
  if (!workloadNames.includes(operation as (typeof workloadNames)[number]))
    throw new Error("Unknown latency operation");
  const start = performance.now();
  let success = false;
  try {
    const result = await work();
    success = true;
    return result;
  } finally {
    samples.push({
      operation,
      layer,
      phase,
      elapsedMs: performance.now() - start,
      success,
    });
  }
}
export function summarize(samples: Sample[]) {
  for (const s of samples) {
    assert(
      workloadNames.includes(s.operation as (typeof workloadNames)[number]),
    );
    assert(s.layer === "database" || s.layer === "api");
    assert(typeof s.success === "boolean");
    assert(s.phase.length > 0);
    assert(Number.isFinite(s.elapsedMs) && s.elapsedMs >= 0);
  }
  return workloadNames.flatMap((operation) =>
    ["database", "api"].map((layer) => {
      const selected = samples.filter(
        (s) => s.operation === operation && s.layer === layer,
      );
      return {
        operation,
        layer,
        status: selected.length ? "MEASURED" : "NOT_RUN",
        success: percentiles(
          selected.filter((s) => s.success).map((s) => s.elapsedMs),
        ),
        failures: selected.filter((s) => !s.success).length,
        phases: [...new Set(selected.map((s) => s.phase))],
      };
    }),
  );
}
export type Workloads = Record<
  (typeof workloadNames)[number],
  (iteration: number) => Promise<unknown>
>;
// API callbacks must await the complete response AND assert status/tenant/value.
// Database callbacks must await COMMIT, not merely dispatch the final query.
export async function runLatencySuite(
  work: Workloads,
  layer: Sample["layer"],
  phase: string,
  iterations = 100,
  warmups = 10,
) {
  assert(
    Number.isInteger(iterations) && iterations >= 1 && iterations <= 10000,
  );
  assert(Number.isInteger(warmups) && warmups >= 0 && warmups <= 100);
  assert(phase.length > 0);
  for (const operation of workloadNames)
    assert.equal(
      typeof work[operation],
      "function",
      "Missing workload: " + operation,
    );
  const samples: Sample[] = [];
  for (let i = 0; i < iterations + warmups; i++)
    for (const operation of workloadNames) {
      try {
        if (i < warmups) await work[operation](i);
        else
          await measure(samples, operation, layer, phase, () =>
            work[operation](i),
          );
      } catch {
        if (i < warmups)
          throw new Error("Warmup failed; no benchmark reported");
      }
    }
  return samples;
}
