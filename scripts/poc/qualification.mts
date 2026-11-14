import assert from "node:assert/strict";
import { hash, uuid, type Target } from "./core.mts";
import { marker, type DB } from "./database.mts";
import { fixtures } from "./fixtures.mts";
export async function qualify(db: DB, target: Target) {
  await marker(db, target);
  const rows = fixtures(target.runId);
  const org = uuid(`${target.runId}:a:org`),
    other = uuid(`${target.runId}:b:org`);
  const id = (s: string) => uuid(`${target.runId}:a:${s}`);
  const checks: Record<string, string> = {};
  for (const table of new Set(rows.map((r) => r.table))) {
    const found = await db.query(
      `SELECT count(*)::text AS count FROM public."${table}"`,
    );
    assert(
      Number(found.rows[0].count) >=
        rows.filter((r) => r.table === table).length,
      "Missing fixture rows: " + table,
    );
  }
  checks.allModels = "PASS";
  const money = await db.query(
    "SELECT total_rate::text AS amount,linehaul::text AS linehaul FROM loads WHERE id=$1",
    [id("load")],
  );
  assert.equal(money.rows[0].amount, "1234.56");
  assert.equal(money.rows[0].linehaul, "1200.00");
  checks.decimal = "PASS";
  const batch = await db.query(
    "SELECT file_bytes,headers,column_mapping FROM financial_import_batches WHERE id=$1",
    [id("batch")],
  );
  assert.equal(
    hash(batch.rows[0].file_bytes as Buffer),
    hash(Buffer.from("load,amount\nFICTIONAL,12.34\n")),
  );
  assert.deepEqual(batch.rows[0].headers, ["load", "amount"]);
  assert.deepEqual(batch.rows[0].column_mapping, { loadNumber: "load" });
  checks.bytesJson = "PASS";
  const date = await db.query(
    "SELECT transaction_date::text AS day,created_at::text AS ts FROM financial_transactions WHERE id=$1",
    [id("finance")],
  );
  assert.equal(date.rows[0].day, "2026-01-15");
  assert(String(date.rows[0].ts).startsWith("2026-01-15 12:00:00"));
  checks.dateTime = "PASS";
  const rejects = async (
    name: string,
    sql: string,
    params: unknown[],
    codes: string[],
  ) => {
    await db.query("BEGIN");
    let code = "";
    try {
      await db.query(sql, params);
    } catch (e) {
      code = (e as { code?: string }).code ?? "";
    } finally {
      await db.query("ROLLBACK");
    }
    assert(codes.includes(code), name + " did not enforce expected constraint");
    checks[name] = "PASS";
  };
  await rejects(
    "signatureImmutable",
    "UPDATE document_signatures SET signer_name=$1 WHERE id=$2",
    ["Changed", id("signature")],
    ["23514"],
  );
  await rejects(
    "financeImmutable",
    "UPDATE financial_transactions SET amount=$1 WHERE id=$2",
    ["99.99", id("finance")],
    ["P0001"],
  );
  await rejects(
    "immutableActorUpdate",
    "UPDATE financial_transactions SET created_by_id=$1 WHERE id=$2",
    [uuid(`${target.runId}:b:OWNER`), id("finance")],
    ["P0001"],
  );
  // UPDATE immutability masks FK tests; insert a fresh record to test the FK itself.
  await rejects(
    "tenantInsertFK",
    "INSERT INTO financial_transactions(id,organization_id,type,effect,category,amount,transaction_date,description,idempotency_key,created_by_id) VALUES($1,$2,'EXPENSE','EXPENSE','Fuel',1.00,'2026-01-15','POC negative',$3,$4)",
    [
      uuid(`${target.runId}:negative`),
      org,
      "negative-key",
      uuid(`${target.runId}:b:OWNER`),
    ],
    ["23503"],
  );
  await rejects(
    "compoundUnique",
    "INSERT INTO users(id,auth_user_id,organization_id,role,first_name,last_name,email,updated_at) VALUES($1,$2,$3,'OWNER','POC','Duplicate',$4,CURRENT_TIMESTAMP)",
    [
      uuid("duplicate-" + target.runId),
      uuid("duplicate-auth-" + target.runId),
      org,
      "owner-a@example.invalid",
    ],
    ["23505"],
  );
  await rejects(
    "restrictDelete",
    "DELETE FROM users WHERE id=$1",
    [id("OWNER")],
    ["23503"],
  );
  await rejects(
    "historicalLiveTrigger",
    "UPDATE loads SET load_number='POC-a-HISTORY' WHERE id=$1",
    [id("load")],
    ["23505"],
  );
  await rejects(
    "negativeMoney",
    "INSERT INTO load_payments(id,organization_id,load_id,amount,currency,idempotency_key,recorded_at) VALUES($1,$2,$3,-1,'USD','negative',CURRENT_TIMESTAMP)",
    [uuid("negative-payment-" + target.runId), org, id("load")],
    ["23514"],
  );
  const view = await db.query(
    "SELECT amount::text FROM finance_records WHERE organization_id=$1",
    [org],
  );
  assert(view.rows.length > 0);
  checks.financeView = "PASS";
  assert.equal(
    (
      await db.query(
        "SELECT id FROM loads WHERE id=$1 AND organization_id=$2",
        [id("load"), other],
      )
    ).rows.length,
    0,
  );
  checks.tenantPredicate = "PASS";
  await db.query("BEGIN");
  try {
    const newOrg = uuid(target.runId + "cascade-org"),
      newLoad = uuid(target.runId + "cascade-load");
    await db.query(
      "INSERT INTO organizations(id,name,updated_at) VALUES($1,'Fictional cascade probe',CURRENT_TIMESTAMP)",
      [newOrg],
    );
    await db.query(
      "INSERT INTO loads(id,organization_id,load_number,broker_name,total_rate,updated_at) VALUES($1,$2,'CASCADE-POC','Fictional',1,CURRENT_TIMESTAMP)",
      [newLoad, newOrg],
    );
    await db.query("DELETE FROM organizations WHERE id=$1", [newOrg]);
    assert.equal(
      (await db.query("SELECT id FROM loads WHERE id=$1", [newLoad])).rows
        .length,
      0,
    );
    checks.cascade = "PASS";
  } finally {
    await db.query("ROLLBACK");
  }
  return {
    status: "PASS_FOR_EXECUTED_FIXTURE_CASES",
    checks,
    notProven: [
      "all legacy tenant foreign keys",
      "runtime RLS/privileges",
      "regional durability",
      "production idempotency",
      "object bytes",
    ],
  };
}
