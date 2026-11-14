const { test } = require("node:test");
const assert = require("node:assert/strict");
const { hasSecret } = require("./product-secret-audit.cjs");

test("audit catches configured values in bundles, including nonstandard keys", () => {
  assert.equal(
    hasSecret('bundled "fixture-value"', ["fixture-value"], false),
    true,
  );
});
test("audit catches credential patterns without environment configuration", () => {
  assert.equal(hasSecret("sb_secret_" + "x".repeat(30), [], false), true);
  assert.equal(hasSecret("sk_live_" + "x".repeat(30), [], false), true);
});
test("audit rejects server environment access in owned client sources", () => {
  assert.equal(
    hasSecret("process.env.SUPABASE_SERVICE_ROLE_KEY", [], true),
    true,
  );
});
test("dependency documentation is not a leaked value; actual values still fail", () => {
  assert.equal(hasSecret("process.env.SUPABASE_SECRET_KEY", [], false), false);
  assert.equal(
    hasSecret(
      "process.env.SUPABASE_SECRET_KEY = fixture-value",
      ["fixture-value"],
      false,
    ),
    true,
  );
});
test("public configuration and short fixture placeholders are allowed", () => {
  assert.equal(
    hasSecret(
      "process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY sb_secret_fixture",
      [],
      true,
    ),
    false,
  );
});
test("raw user and service JWTs fail while legacy public anon keys are allowed", () => {
  for (const role of ["authenticated", "service_role", "anon"]) {
    const token = [
      Buffer.from('{"alg":"HS256"}').toString("base64url"),
      Buffer.from(JSON.stringify({ role })).toString("base64url"),
      "fixture",
    ].join(".");
    assert.equal(hasSecret(token, [], false), role !== "anon");
  }
});
