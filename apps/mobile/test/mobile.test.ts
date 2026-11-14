import { test } from "node:test";
import "./signature.test";
import "./readiness.test";
import assert from "node:assert/strict";
import { createApiClient, type TokenSource } from "../src/api/client";
import { driverAccess } from "../src/auth/access";
import { observeSession } from "../src/auth/session";
import { groupLoads } from "../src/lib/loads";
import { validateFile } from "../src/lib/files";
import { captureLocation } from "../src/lib/location";
import {
  createSubscriptionService,
  type PurchaseAdapter,
  type CustomerInfo,
  canUsePro,
  subscriptionForUser,
} from "../src/subscriptions/service";
import { findDriverLoads } from "../src/lib/load-finder";
import { purchaseConfigurationIssue } from "../src/subscriptions/config";
import type {
  ApplicationUser,
  DriverLoadSummary,
} from "../../../packages/api-contracts/driver";

const user: ApplicationUser = {
  id: "app-user",
  organizationId: "org",
  email: "driver@example.test",
  firstName: "Test",
  lastName: "Driver",
  role: "DRIVER",
  driver: { id: "driver", name: "Test Driver" },
};
test("secure session restoration restores once and unsubscribes cleanly", async () => {
  const values: (string | null)[] = [];
  let removed = false;
  const stop = observeSession(
    {
      read: async () => "stored-session",
      subscribe: () => () => {
        removed = true;
      },
    },
    (value) => values.push(value),
    () => assert.fail("Unexpected failure"),
  );
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.deepEqual(values, ["stored-session"]);
  stop();
  assert.equal(removed, true);
});
test("stale restored session cannot resurrect an account after sign-out", async () => {
  const values: (string | null)[] = [];
  let resolveRead: ((value: string) => void) | undefined;
  let emit: ((value: string | null) => void) | undefined;
  const stop = observeSession<string>(
    {
      read: () =>
        new Promise((resolve) => {
          resolveRead = resolve;
        }),
      subscribe: (next) => {
        emit = next;
        return () => {};
      },
    },
    (value) => values.push(value),
    () => assert.fail("Unexpected failure"),
  );
  emit!(null);
  resolveRead!("stale-session");
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.deepEqual(values, [null]);
  stop();
});
function auth(): TokenSource & { refreshes: number; clears: number } {
  return {
    refreshes: 0,
    clears: 0,
    identity: async () => "app-user",
    token: async () => "old",
    refresh: async function () {
      this.refreshes++;
      return "new";
    },
    clear: async function () {
      this.clears++;
    },
  };
}
test("driver access comes from /me, including pending and unlinked accounts", () => {
  assert.equal(driverAccess(user), "driver");
  for (const role of ["OWNER", "DISPATCHER", "BACK_OFFICE"])
    assert.equal(driverAccess({ ...user, role }), "role");
  assert.equal(
    driverAccess({ ...user, onboardingRequired: true }),
    "onboarding",
  );
  assert.equal(driverAccess({ ...user, driver: null }), "onboarding");
});
test("expired requests refresh once, preserve method/body, then succeed", async () => {
  const tokens = auth();
  const requests: RequestInit[] = [];
  const client = createApiClient(
    "https://api.example.test/api/v1/",
    tokens,
    async (_url, options) => {
      requests.push(options!);
      return new Response(JSON.stringify({ ok: true }), {
        status: requests.length === 1 ? 401 : 200,
      });
    },
  );
  assert.deepEqual(
    await client.request("/me/loads/id/start", { method: "POST", body: {} }),
    { ok: true },
  );
  assert.equal(tokens.refreshes, 1);
  assert.equal(tokens.clears, 0);
  assert.equal(requests[1].method, "POST");
  assert.equal(requests[1].body, "{}");
  assert.equal(
    (requests[1].headers as Record<string, string>).Authorization,
    "Bearer new",
  );
});
test("a second 401 clears local session and cannot loop", async () => {
  const tokens = auth();
  let calls = 0;
  const client = createApiClient(
    "https://api.example.test",
    tokens,
    async () => {
      calls++;
      return new Response("{}", { status: 401 });
    },
  );
  await assert.rejects(client.request("/me"), /session expired/);
  assert.equal(calls, 2);
  assert.equal(tokens.refreshes, 1);
  assert.equal(tokens.clears, 1);
});
test("simultaneous unauthorized requests share one refresh", async () => {
  const tokens = auth();
  tokens.refresh = async () => {
    tokens.refreshes++;
    await new Promise((resolve) => setTimeout(resolve, 10));
    return "new";
  };
  const client = createApiClient(
    "https://api.example.test",
    tokens,
    async (_url, init) =>
      new Response("{}", {
        status:
          (init?.headers as Record<string, string>).Authorization ===
          "Bearer new"
            ? 200
            : 401,
      }),
  );
  await Promise.all([client.request("/one"), client.request("/two")]);
  assert.equal(tokens.refreshes, 1);
});
test("account switch never replays an old mutation under a new identity", async () => {
  const tokens = auth();
  let identity = "first";
  let calls = 0;
  tokens.identity = async () => identity;
  const client = createApiClient(
    "https://api.example.test",
    tokens,
    async () => {
      calls++;
      identity = "second";
      return new Response("{}", { status: 401 });
    },
  );
  await assert.rejects(
    client.request("/start", { method: "POST", body: {} }),
    /account changed/,
  );
  assert.equal(calls, 1);
  assert.equal(tokens.refreshes, 0);
  assert.equal(tokens.clears, 0);
});
test("network errors and workflow blockers are controlled; multipart boundaries belong to fetch", async () => {
  const tokens = auth();
  await assert.rejects(
    createApiClient("https://api.example.test", tokens, async () => {
      throw new Error("raw diagnostic");
    }).request("/me"),
    /Check your connection/,
  );
  await assert.rejects(
    createApiClient(
      "https://api.example.test",
      tokens,
      async () =>
        new Response(JSON.stringify({ message: "POD is required." }), {
          status: 409,
        }),
    ).request("/complete"),
    /POD is required/,
  );
  const form = new FormData();
  form.append("file", new Blob(["pdf"]), "test.pdf");
  await createApiClient(
    "https://api.example.test",
    tokens,
    async (_url, init) => {
      assert.equal(init?.body, form);
      assert.equal(
        (init?.headers as Record<string, string>)["Content-Type"],
        undefined,
      );
      return new Response("{}");
    },
  ).request("/upload", { method: "POST", multipart: form });
});
test("load grouping uses actual assignment states and excludes cancelled", () => {
  const loads = [
    "ASSIGNED",
    "ACCEPTED",
    "IN_PROGRESS",
    "COMPLETED",
    "CANCELLED",
  ].map((status) => ({ assignment: { status } })) as DriverLoadSummary[];
  const groups = groupLoads(loads);
  assert.equal(groups.Current.length, 1);
  assert.equal(groups.Upcoming.length, 2);
  assert.equal(groups.Completed.length, 1);
});
test("capture MIME, size, empty and unavailable size reject before upload", () => {
  const file = {
    uri: "file://test",
    name: "test.pdf",
    type: "application/pdf",
    size: 100,
  };
  assert.equal(validateFile(file), file);
  for (const invalid of [
    { ...file, size: 10 * 1024 * 1024 + 1 },
    { ...file, type: "image/heic" },
    { ...file, size: 0 },
    { ...file, size: undefined },
  ])
    assert.throws(() => validateFile(invalid));
});
test("location denial, timeout, and provider failure produce manual fallback without pretending coordinates", async () => {
  let captured = false;
  const denied = await captureLocation({
    requestPermission: async () => false,
    current: async () => {
      captured = true;
      return { latitude: 1, longitude: 2 };
    },
  });
  assert.equal(denied.location, null);
  assert.equal(captured, false);
  assert.equal(
    (
      await captureLocation(
        {
          requestPermission: async () => true,
          current: () => new Promise(() => {}),
        },
        5,
      )
    ).location,
    null,
  );
  assert.equal(
    (
      await captureLocation({
        requestPermission: async () => true,
        current: async () => {
          throw new Error();
        },
      })
    ).location,
    null,
  );
  assert.deepEqual(
    (
      await captureLocation({
        requestPermission: async () => true,
        current: async () => ({ latitude: 1, longitude: 2, accuracyMeters: 3 }),
      })
    ).location,
    { latitude: 1, longitude: 2, accuracyMeters: 3 },
  );
});
const free: CustomerInfo = { entitlements: { active: {} } };
const pro: CustomerInfo = { entitlements: { active: { pro: {} } } };
function purchases() {
  let info = free;
  let cancel = false;
  const identities: (string | null)[] = [];
  const item = {
    identifier: "monthly-from-offering",
    product: {
      title: "Pro",
      description: "Store description",
      priceString: "€9,99",
    },
  };
  const adapter: PurchaseAdapter = {
    identify: async (id) => {
      identities.push(id);
      info = free;
      return info;
    },
    logOut: async () => {
      identities.push(null);
      info = free;
    },
    getOfferings: async () => ({ current: { availablePackages: [item] } }),
    getCustomerInfo: async () => info,
    purchasePackage: async () => {
      if (cancel) throw { userCancelled: true };
      info = pro;
    },
    restorePurchases: async () => {
      info = pro;
    },
    listen: () => () => {},
  };
  return {
    adapter,
    item,
    identities,
    cancel: () => {
      cancel = true;
    },
  };
}
test("RevenueCat identifies stable app user, shows store prices, purchases, recognizes entitlement and clears logout", async () => {
  const mock = purchases();
  const service = createSubscriptionService(mock.adapter, "pro");
  await service.setUser(user.id);
  assert.deepEqual(mock.identities, ["app-user"]);
  assert.equal(
    service.snapshot().offerings?.current?.availablePackages[0].product
      .priceString,
    "€9,99",
  );
  assert.equal(await service.purchasePackage(mock.item), "pro");
  assert.equal(service.snapshot().isPro, true);
  await service.setUser(null);
  assert.equal(service.snapshot().isPro, false);
  assert.equal(service.snapshot().customerInfo, null);
  assert.deepEqual(mock.identities, ["app-user", null]);
  service.dispose();
});
test("RevenueCat cancellation is normal; restore refreshes entitlement", async () => {
  const mock = purchases();
  mock.cancel();
  const service = createSubscriptionService(mock.adapter, "pro");
  await service.setUser("driver");
  assert.equal(await service.purchasePackage(mock.item), "cancelled");
  assert.equal(service.snapshot().error, null);
  assert.equal(await service.restorePurchases(), "pro");
  service.dispose();
});
test("RevenueCat stale identity result cannot grant another account Pro", async () => {
  const mock = purchases();
  let finish: ((value: CustomerInfo) => void) | undefined;
  mock.adapter.identify = async (id) =>
    id === "first"
      ? new Promise((resolve) => {
          finish = resolve;
        })
      : free;
  const service = createSubscriptionService(mock.adapter, "pro");
  const first = service.setUser("first");
  await new Promise((resolve) => setTimeout(resolve, 0));
  const second = service.setUser("second");
  finish!(pro);
  await Promise.all([first, second]);
  assert.equal(service.snapshot().isPro, false);
  assert.equal(service.snapshot().loading, false);
  service.dispose();
});

test("late successful API responses cannot cross an account switch", async () => {
  const tokens = auth();
  let identity = "first";
  tokens.identity = async () => identity;
  const client = createApiClient(
    "https://api.example.test",
    tokens,
    async () => {
      identity = "second";
      return new Response(JSON.stringify({ privateLoad: "first-account" }));
    },
  );
  await assert.rejects(client.request("/me/loads"), /account changed/);
});

test("late RevenueCat listener payloads are revalidated against current customer", async () => {
  const mock = purchases();
  let callback: ((info: CustomerInfo) => void) | undefined;
  let removed = false;
  mock.adapter.listen = (listener) => {
    callback = listener;
    return () => {
      removed = true;
    };
  };
  const service = createSubscriptionService(mock.adapter, "pro");
  await service.setUser("current-user");
  callback!(pro);
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(service.snapshot().isPro, false);
  service.dispose();
  assert.equal(removed, true);
});

const finderLoads: DriverLoadSummary[] = [
  ["DEMO-100", "IN_PROGRESS", "Dallas", "PU-101"],
  ["DEMO-200", "COMPLETED", "Austin", "PU-202"],
  ["DEMO-300", "ASSIGNED", "Dallas", "PU-303"],
].map(([loadNumber, status, city, reference]) => ({
  assignment: {
    id: loadNumber,
    status: status as DriverLoadSummary["assignment"]["status"],
    assignedAt: "2026-09-27",
    acceptedAt: null,
    completedAt: null,
  },
  load: {
    id: loadNumber,
    loadNumber,
    status,
    equipment: null,
    pickup: {
      facilityName: "Fictional Warehouse",
      address: `${city}, TX`,
      appointmentText: null,
      referenceNumber: reference,
    },
    delivery: null,
    paperwork: {
      required: { captured: 0, total: 2 },
      optional: { captured: 0, total: 0 },
    },
  },
}));

test("free Driver keeps every assignment and operational access; purchase immediately unlocks Finder", async () => {
  const mock = purchases();
  const service = createSubscriptionService(mock.adapter, "pro");
  await service.setUser(user.id);
  assert.equal(canUsePro(service.snapshot(), user.id), false);
  assert.equal(
    findDriverLoads(
      finderLoads,
      service.snapshot(),
      user.id,
      "no match",
      "Completed",
    ),
    finderLoads,
  );
  assert.equal(driverAccess(user), "driver");
  assert.equal(groupLoads(finderLoads).Current.length, 1);
  assert.equal(groupLoads(finderLoads).Upcoming.length, 1);
  assert.equal(groupLoads(finderLoads).Completed.length, 1);
  // Operational requests use authentication, independent of subscription state.
  const requests: string[] = [];
  const client = createApiClient(
    "https://api.example.test",
    auth(),
    async (url) => {
      requests.push(String(url));
      return new Response("{}");
    },
  );
  for (const action of ["accept", "start", "complete"])
    await client.request(`/me/loads/demo/${action}`, {
      method: "POST",
      body: {},
    });
  const form = new FormData();
  form.append("file", new Blob(["fictional"]), "demo.pdf");
  for (const type of ["BOL", "POD"])
    await client.request(`/me/loads/demo/documents/${type}`, {
      method: "POST",
      multipart: form,
    });
  assert.equal(requests.length, 5);
  await service.purchasePackage(mock.item);
  assert.equal(canUsePro(service.snapshot(), user.id), true);
  assert.deepEqual(
    findDriverLoads(
      finderLoads,
      service.snapshot(),
      user.id,
      "  dAlLas warehouse ",
      "Active",
    ).map((row) => row.load.id),
    ["DEMO-100", "DEMO-300"],
  );
  assert.deepEqual(
    findDriverLoads(
      finderLoads,
      service.snapshot(),
      user.id,
      "pu-202",
      "Completed",
    ).map((row) => row.load.id),
    ["DEMO-200"],
  );
  assert.equal(
    findDriverLoads(finderLoads, service.snapshot(), user.id, "nothing", "All")
      .length,
    0,
  );
  assert.deepEqual(
    findDriverLoads(finderLoads, service.snapshot(), user.id, "", "All"),
    finderLoads,
  );
  service.dispose();
});

test("loading and auth-render mismatch cannot expose Pro or keep filtered work hidden", async () => {
  const mock = purchases();
  const service = createSubscriptionService(mock.adapter, "pro");
  await service.setUser("A");
  await service.purchasePackage(mock.item);
  const old = service.snapshot();
  assert.equal(subscriptionForUser(old, "B").isPro, false);
  assert.equal(subscriptionForUser(old, "B").customerInfo, null);
  assert.equal(subscriptionForUser(old, "B").loading, true);
  assert.equal(subscriptionForUser(old, null).offerings, null);
  const refreshing = service.refreshCustomerInfo();
  assert.equal(service.snapshot().loading, true);
  assert.equal(canUsePro(service.snapshot(), "A"), false);
  assert.equal(
    findDriverLoads(
      finderLoads,
      service.snapshot(),
      "A",
      "nothing",
      "Completed",
    ),
    finderLoads,
  );
  await refreshing;
  assert.equal(canUsePro(service.snapshot(), "A"), true);
  await assert.rejects(service.purchasePackage(mock.item, "B"), /not ready/);
  service.dispose();
});

test("cancel and purchase failure leave free capability locked with safe error text", async () => {
  const mock = purchases();
  const service = createSubscriptionService(mock.adapter, "pro");
  await service.setUser("A");
  mock.cancel();
  assert.equal(await service.purchasePackage(mock.item), "cancelled");
  assert.equal(canUsePro(service.snapshot(), "A"), false);
  assert.equal(service.snapshot().error, null);
  mock.adapter.purchasePackage = async () => {
    throw new Error("raw provider sensitive detail");
  };
  await assert.rejects(
    service.purchasePackage(mock.item),
    /Could not verify Pro/,
  );
  assert.equal(canUsePro(service.snapshot(), "A"), false);
  assert.doesNotMatch(service.snapshot().error!, /sensitive/);
  service.dispose();
});

test("restore unlocks; provider refresh failure locks; retry and revocation update actual Finder", async () => {
  const mock = purchases();
  const service = createSubscriptionService(mock.adapter, "pro");
  await service.setUser("A");
  assert.equal(await service.restorePurchases(), "pro");
  assert.equal(canUsePro(service.snapshot(), "A"), true);
  mock.adapter.getCustomerInfo = async () => {
    throw new Error("offline");
  };
  await assert.rejects(service.refreshCustomerInfo(), /Could not verify Pro/);
  assert.equal(canUsePro(service.snapshot(), "A"), false);
  assert.equal(
    findDriverLoads(finderLoads, service.snapshot(), "A", "none", "Completed"),
    finderLoads,
  );
  mock.adapter.getCustomerInfo = async () => pro;
  await service.refreshCustomerInfo();
  assert.equal(canUsePro(service.snapshot(), "A"), true);
  mock.adapter.getCustomerInfo = async () => free;
  assert.equal(await service.refreshCustomerInfo(), "none");
  assert.equal(canUsePro(service.snapshot(), "A"), false);
  service.dispose();
});

test("restart re-identifies user and reads entitlement without an app-owned boolean", async () => {
  const mock = purchases();
  mock.adapter.identify = async () => pro;
  const first = createSubscriptionService(mock.adapter, "pro");
  await first.setUser("A");
  assert.equal(canUsePro(first.snapshot(), "A"), true);
  first.dispose();
  const restarted = createSubscriptionService(mock.adapter, "pro");
  assert.equal(canUsePro(restarted.snapshot(), "A"), false);
  await restarted.setUser("A");
  assert.equal(canUsePro(restarted.snapshot(), "A"), true);
  restarted.dispose();
});

test("expiration timer relocks an open Finder and malformed/expired grants fail closed", async (context) => {
  const now = Date.parse("2026-09-27T12:00:00Z");
  context.mock.timers.enable({ apis: ["Date", "setTimeout"], now });
  const mock = purchases();
  mock.adapter.identify = async () => ({
    entitlements: {
      active: { pro: { expirationDate: new Date(now + 1000).toISOString() } },
    },
  });
  const service = createSubscriptionService(mock.adapter, "pro");
  await service.setUser("A");
  assert.equal(canUsePro(service.snapshot(), "A"), true);
  context.mock.timers.tick(1001);
  assert.equal(service.snapshot().isPro, false);
  for (const expirationDate of ["invalid", new Date(now - 1).toISOString()]) {
    mock.adapter.getCustomerInfo = async () => ({
      entitlements: { active: { pro: { expirationDate } } },
    });
    assert.equal(await service.refreshCustomerInfo(), "none");
    assert.equal(canUsePro(service.snapshot(), "A"), false);
  }
  service.dispose();
});

test("purchase finishing after account switch cannot grant Pro to the new Driver", async () => {
  const mock = purchases();
  let complete: (() => void) | undefined;
  mock.adapter.purchasePackage = () =>
    new Promise<void>((resolve) => {
      complete = resolve;
    });
  mock.adapter.getCustomerInfo = async () => pro;
  const service = createSubscriptionService(mock.adapter, "pro");
  await service.setUser("A");
  const pending = service.purchasePackage(mock.item);
  const rejected = assert.rejects(pending, /Could not verify Pro/);
  await new Promise((resolve) => setTimeout(resolve, 0));
  const switching = service.setUser("B");
  assert.equal(canUsePro(service.snapshot(), "B"), false);
  complete!();
  await Promise.all([rejected, switching]);
  assert.equal(service.snapshot().userId, "B");
  assert.equal(canUsePro(service.snapshot(), "B"), false);
  service.dispose();
});

test("offering/identity/restore failures never unlock Pro and disposal clears state", async () => {
  for (const operation of [
    "identify",
    "getOfferings",
    "restorePurchases",
  ] as const) {
    const mock = purchases();
    mock.adapter.identify = async () => pro;
    mock.adapter[operation] = async () => {
      throw new Error("provider failure");
    };
    const service = createSubscriptionService(mock.adapter, "pro");
    await service.setUser("A");
    if (operation === "restorePurchases")
      await assert.rejects(service.restorePurchases());
    assert.equal(canUsePro(service.snapshot(), "A"), false);
    assert.ok(service.snapshot().error);
    service.dispose();
    assert.equal(service.snapshot().userId, null);
    assert.equal(service.snapshot().isPro, false);
  }
});

test("SDK key diagnostics reject secret/wrong-platform/test keys without echoing values", () => {
  assert.equal(
    purchaseConfigurationIssue("ios", "appl_public-placeholder", false),
    null,
  );
  assert.equal(
    purchaseConfigurationIssue("android", "goog_public-placeholder", false),
    null,
  );
  for (const key of [
    undefined,
    "sk_secret-placeholder",
    "goog_wrong-platform",
    "test_store-placeholder",
  ])
    assert.ok(purchaseConfigurationIssue("ios", key, false));
  assert.doesNotMatch(
    purchaseConfigurationIssue("ios", "sk_secret-placeholder", false)!,
    /sk_secret-placeholder/,
  );
  assert.ok(purchaseConfigurationIssue("ios", "appl_public-placeholder", true));
  assert.ok(
    purchaseConfigurationIssue("web", "appl_public-placeholder", false),
  );
});

test("Test Store SDK keys are accepted for development native iOS and Android", () => {
  for (const platform of ["ios", "android"])
    assert.equal(
      purchaseConfigurationIssue(platform, "test_store-placeholder", false, true),
      null,
    );
});

test("Production SDK validation accepts platform keys and rejects Test Store", () => {
  for (const platform of ["ios", "android"]) {
    const key =
      platform === "ios" ? "appl_public-placeholder" : "goog_public-placeholder";
    assert.equal(purchaseConfigurationIssue(platform, key, false, false), null);
    assert.ok(
      purchaseConfigurationIssue(platform, "test_store-placeholder", false, false),
    );
    assert.ok(
      purchaseConfigurationIssue(platform, "test_store-placeholder", false),
    );
  }
});

test("Test Store permission never bypasses native platform, Expo Go or key guards", () => {
  for (const allowTestStore of [false, true]) {
    for (const platform of ["ios", "android"]) {
      for (const key of [
        undefined,
        "",
        "sk_secret-placeholder",
        "invalid-placeholder",
        platform === "ios" ? "goog_wrong-platform" : "appl_wrong-platform",
      ]) {
        const issue = purchaseConfigurationIssue(
          platform,
          key,
          false,
          allowTestStore,
        );
        assert.ok(issue);
        if (key) assert.equal(issue.includes(key), false);
      }
      assert.ok(
        purchaseConfigurationIssue(
          platform,
          "test_store-placeholder",
          true,
          allowTestStore,
        ),
      );
    }
    for (const platform of ["web", "windows"])
      assert.ok(
        purchaseConfigurationIssue(
          platform,
          "test_store-placeholder",
          false,
          allowTestStore,
        ),
      );
  }
});
