import { uuid, type Target } from "./core.mts";
import { fixtures, type Fixture } from "./fixtures.mts";
import { identifier, marker, type DB } from "./database.mts";
import { type Workloads } from "./latency.mts";

// SQL probes use actual migrated tables, not replacement production services.
// No blob bytes, authentication, HTTP or application validation is timed here.
export async function databaseWorkloads(
  db: DB,
  target: Target,
  batch: string,
): Promise<Workloads> {
  await marker(db, target);
  if (!/^[a-z0-9]{8,24}$/.test(batch))
    throw new Error("Unique latency batch label required");
  const base = fixtures(target.runId).filter(
    (f) => f.row.organization_id === uuid(`${target.runId}:a:org`),
  );
  const first = (model: string) => base.find((f) => f.model === model)!;
  const insert = async (f: Fixture) => {
    const keys = Object.keys(f.row),
      values = keys.map((k) =>
        typeof f.row[k] === "object" &&
        f.row[k] !== null &&
        !Buffer.isBuffer(f.row[k])
          ? JSON.stringify(f.row[k])
          : f.row[k],
      );
    await db.query(
      `INSERT INTO public.${identifier(f.table)} (${keys.map(identifier).join(",")}) VALUES (${keys.map((_, i) => "$" + (i + 1)).join(",")})`,
      values,
    );
  };
  const clone = (
    model: string,
    key: string,
    overrides: Fixture["row"] = {},
  ): Fixture => ({
    ...first(model),
    row: {
      ...first(model).row,
      id: uuid(`${target.runId}:${batch}:${key}`),
      ...overrides,
    },
  });
  const transaction = async (rows: Fixture[]) => {
    await db.query("BEGIN");
    try {
      for (const f of rows) await insert(f);
      await db.query("COMMIT");
    } catch (e) {
      await db.query("ROLLBACK").catch(() => {});
      throw e;
    }
  };
  return {
    "simple-read": async () =>
      db.query(
        "SELECT id,total_rate::text FROM loads WHERE id=$1 AND organization_id=$2",
        [first("Load").row.id, first("Load").row.organization_id],
      ),
    "simple-write": async (i) =>
      transaction([clone("LoadEvent", `write-${i}`)]),
    "multi-record-transaction": async (i) =>
      transaction([
        clone("LoadEvent", `multi-a-${i}`),
        clone("LoadEvent", `multi-b-${i}`),
      ]),
    "load-creation": async (i) => {
      const load = clone("Load", `load-${i}`, {
        load_number: `LAT-${batch}-${i}`,
      });
      const stops = base
        .filter((f) => f.model === "LoadStop")
        .map((f, j) => ({
          ...f,
          row: {
            ...f.row,
            id: uuid(`${batch}:stop:${i}:${j}`),
            load_id: load.row.id,
          },
        }));
      await transaction([
        load,
        ...stops,
        clone("LoadEvent", `load-event-${i}`, { load_id: load.row.id }),
      ]);
    },
    "document-metadata-commit": async (i) => {
      const doc = clone("Document", `doc-${i}`, { type: "BOL" });
      await transaction([
        doc,
        clone("DocumentVersion", `version-${i}`, {
          document_id: doc.row.id,
          upload_key: uuid(`${batch}:upload:${i}`),
          storage_key: `poc/${batch}/${i}.pdf`,
        }),
        clone("LoadDocument", `doc-link-${i}`, {
          document_id: doc.row.id,
          role: "BOL",
        }),
      ]);
    },
    "driver-stop-event": async (i) => {
      await db.query("BEGIN");
      try {
        await db.query("SELECT id FROM load_stops WHERE id=$1 FOR UPDATE", [
          first("LoadStop").row.id,
        ]);
        await db.query(
          "UPDATE load_stops SET arrived_at=CURRENT_TIMESTAMP WHERE id=$1",
          [first("LoadStop").row.id],
        );
        await insert(
          clone("LoadEvent", `stop-event-${i}`, { type: "ARRIVED_PICKUP" }),
        );
        await db.query("COMMIT");
      } catch (e) {
        await db.query("ROLLBACK").catch(() => {});
        throw e;
      }
    },
    "signature-commit": async (i) =>
      transaction([
        clone("DocumentSignature", `signature-${i}`, {
          idempotency_key: `${batch}-${i}`,
          signature_storage_key: `poc/${batch}/${i}.png`,
        }),
        clone("LoadEvent", `signature-event-${i}`, {
          type: "DOCUMENT_SIGNATURE_CAPTURED",
        }),
      ]),
    "finance-transaction": async (i) => {
      const finance = clone("FinancialTransaction", `finance-${i}`, {
        idempotency_key: `${batch}-${i}`,
      });
      await transaction([
        finance,
        clone("FinancialAuditEvent", `audit-${i}`, {
          record_id: finance.row.id,
        }),
      ]);
    },
  };
}
