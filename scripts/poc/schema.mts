import { readFileSync, readdirSync } from "node:fs";
import { resolve, join } from "node:path";
import assert from "node:assert/strict";
import { hash } from "./core.mts";
import type { DB } from "./database.mts";
export const root = resolve(import.meta.dirname, "../..");
export function inventory() {
  const schema = readFileSync(
    join(root, "apps/api/prisma/schema.prisma"),
    "utf8",
  );
  const models = [...schema.matchAll(/^model (\w+) \{([\s\S]*?)^\}/gm)].map(
    (m) => ({
      name: m[1],
      table: /@@map\("([^"]+)"\)/.exec(m[2])![1],
      declarations: m[2]
        .trim()
        .split(/\r?\n/)
        .map((l) => l.trim())
        .filter(Boolean),
    }),
  );
  const enums = [...schema.matchAll(/^enum (\w+) \{([\s\S]*?)^\}/gm)].map(
    (m) => ({ name: m[1], values: m[2].trim().split(/\s+/) }),
  );
  const base = join(root, "apps/api/prisma/migrations");
  const migrations = readdirSync(base, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((e) => {
      const bytes = readFileSync(join(base, e.name, "migration.sql"));
      return { name: e.name, sha256: hash(bytes), sql: bytes.toString() };
    });
  assert.equal(models.length, 26, "Schema changed: review POC coverage");
  assert.equal(enums.length, 26);
  assert.equal(migrations.length, 17);
  return { schemaSha256: hash(schema), models, enums, migrations };
}
export async function catalog(db: DB) {
  const source = inventory();
  const tables = await db.query(
    "SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND table_type='BASE TABLE'",
  );
  const names = new Set(tables.rows.map((r) => r.table_name));
  assert(
    source.models.every((m) => names.has(m.table)),
    "Missing model table",
  );
  const types = await db.query(
    "SELECT t.typname,e.enumlabel,e.enumsortorder FROM pg_type t JOIN pg_enum e ON e.enumtypid=t.oid ORDER BY t.typname,e.enumsortorder",
  );
  for (const e of source.enums)
    assert.deepEqual(
      types.rows.filter((r) => r.typname === e.name).map((r) => r.enumlabel),
      e.values,
      "Enum mismatch: " + e.name,
    );
  const constraints = await db.query(
    "SELECT c.relname,con.conname,con.contype,pg_get_constraintdef(con.oid) AS definition FROM pg_constraint con JOIN pg_class c ON con.conrelid=c.oid WHERE con.connamespace='public'::regnamespace ORDER BY con.conname",
  );
  const indexes = await db.query(
    "SELECT tablename,indexname,indexdef FROM pg_indexes WHERE schemaname='public' ORDER BY indexname",
  );
  const triggers = await db.query(
    "SELECT tgname,pg_get_triggerdef(oid) AS definition FROM pg_trigger WHERE NOT tgisinternal ORDER BY tgname",
  );
  for (const name of [
    "financial_amounts_immutable",
    "historical_live_duplicate",
    "live_historical_duplicate",
    "document_signatures_immutable",
  ])
    assert(
      triggers.rows.some((r) => r.tgname === name),
      "Missing trigger " + name,
    );
  for (const name of [
    "historical_load_normalized",
    "historical_invoice_normalized",
  ])
    assert(
      indexes.rows.some((r) => r.indexname === name),
      "Missing expression index " + name,
    );
  await db.query("SELECT * FROM finance_records LIMIT 0");
  await db.query("SELECT hashtextextended($1,0)", ["poc-catalog"]);
  const columns = await db.query(
    "SELECT table_name,column_name,data_type,udt_name,is_nullable,numeric_precision,numeric_scale,datetime_precision FROM information_schema.columns WHERE table_schema='public' ORDER BY table_name,ordinal_position",
  );
  return {
    status: "CATALOG_CAPTURED_REQUIRES_SEMANTIC_TESTS",
    models: source.models.length,
    enums: source.enums.length,
    constraints: constraints.rows,
    indexes: indexes.rows,
    triggers: triggers.rows,
    columns: columns.rows,
  };
}
