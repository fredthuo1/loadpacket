import { test } from "node:test";
import assert from "node:assert/strict";
import { createApiClient, ApiError, type TokenSource } from "../src/api/client";
import {
  requestGeneration,
  assignmentCommand,
  uploadRetryMatches,
  canDriverCapture,
} from "../src/lib/request-state";
import { recoveryUrl } from "../src/auth/recovery";

const auth = (): TokenSource => ({
  identity: async () => "driver-a",
  token: async () => "token-a",
  refresh: async () => null,
  clear: async () => {},
});
test("deadline covers stalled response bodies and aborts without silently replaying a mutation", async (context) => {
  context.mock.timers.enable({ apis: ["setTimeout"] });
  let signal: AbortSignal | undefined,
    calls = 0;
  const client = createApiClient(
    "https://api.example.invalid",
    auth(),
    async (_url, init) => {
      calls++;
      signal = init?.signal as AbortSignal;
      return {
        status: 200,
        ok: true,
        json: () => new Promise(() => {}),
      } as Response;
    },
  );
  const failure = assert.rejects(
    client.request("/me/loads/x/start", {
      method: "POST",
      body: assignmentCommand("generation-a"),
    }),
    /may have reached/,
  );
  await new Promise<void>((resolve) => setImmediate(resolve));
  context.mock.timers.tick(30001);
  await failure;
  assert.equal(signal?.aborted, true);
  assert.equal(calls, 1);
});
test("revoked operational access invalidates mounted account state once without a me loop", async () => {
  let invalidations = 0,
    refreshes = 0;
  const source = auth();
  source.refresh = async () => {
    refreshes++;
    return null;
  };
  const client = createApiClient(
    "https://api.example.invalid",
    source,
    async () =>
      new Response(JSON.stringify({ message: "Account inactive." }), {
        status: 403,
      }),
  );
  const off = client.onAccessDenied(() => invalidations++);
  for (const path of ["/me/loads", "/me"])
    await assert.rejects(
      client.request(path),
      (e: unknown) => e instanceof ApiError && e.status === 403,
    );
  assert.equal(invalidations, 1);
  assert.equal(refreshes, 0);
  off();
  await assert.rejects(client.request("/me/loads"));
  assert.equal(invalidations, 1);
});
test("a late forbidden response from another account cannot invalidate the new account", async () => {
  let identity = "a",
    invalidations = 0;
  const source = auth();
  source.identity = async () => identity;
  const client = createApiClient(
    "https://api.example.invalid",
    source,
    async () => {
      identity = "b";
      return new Response("{}", { status: 403 });
    },
  );
  client.onAccessDenied(() => invalidations++);
  await assert.rejects(client.request("/me/loads"), /account changed/);
  assert.equal(invalidations, 0);
});
test("offline mutations have an uncertain outcome and never claim rollback or auto-retry", async () => {
  let calls = 0;
  const client = createApiClient(
    "https://api.example.invalid",
    auth(),
    async () => {
      calls++;
      throw Error("private transport diagnostic");
    },
  );
  await assert.rejects(
    client.request("/me/loads/x/complete", {
      method: "POST",
      body: assignmentCommand("a"),
    }),
    /may have reached/,
  );
  assert.equal(calls, 1);
});
test("only newest refresh can publish; blur invalidates even the last response", () => {
  const request = requestGeneration();
  const first = request.begin(),
    second = request.begin();
  assert.equal(request.current(first), false);
  assert.equal(request.current(second), true);
  request.invalidate();
  assert.equal(request.current(second), false);
  assert.equal(request.current(request.begin()), true);
});
test("upload retry cannot acquire a replacement generation or missing action token", () => {
  assert.deepEqual(assignmentCommand("old"), { actionToken: "old" });
  assert.throws(() => assignmentCommand(undefined), /Refresh/);
  assert.equal(uploadRetryMatches("old", "old"), true);
  for (const [saved, current] of [
    ["old", "new"],
    [undefined, "new"],
    [undefined, undefined],
  ])
    assert.equal(uploadRetryMatches(saved, current), false);
});
test("driver capture matches server capabilities and excludes office-generated invoices", () => {
  for (const type of ["BOL", "POD", "LUMPER_RECEIPT", "SCALE_TICKET"])
    assert.equal(canDriverCapture(type, "REJECTED", "COMPLETED"), true);
  for (const args of [
    ["CARRIER_INVOICE", "MISSING", "IN_PROGRESS"],
    ["BOL", "RECEIVED", "IN_PROGRESS"],
    ["POD", "MISSING", "CANCELLED"],
    ["POD", "MISSING", "ASSIGNED"],
  ])
    assert.equal(
      canDriverCapture(...(args as [string, string, string])),
      false,
    );
});
test("password recovery uses only configured HTTPS web origin without embedded credentials", () => {
  assert.equal(
    recoveryUrl("https://carrier.example.invalid"),
    "https://carrier.example.invalid/auth/forgot",
  );
  for (const value of [
    undefined,
    "",
    "http://localhost:3000",
    "javascript:alert(1)",
    "https://user:password@example.invalid",
    "https://example.invalid/?token=private",
    "https://example.invalid/path",
  ])
    assert.equal(recoveryUrl(value), null);
});
