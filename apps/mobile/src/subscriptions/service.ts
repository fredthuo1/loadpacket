export interface CustomerInfo {
  entitlements: {
    active: Record<
      string,
      { expirationDate?: string | null; isActive?: boolean }
    >;
  };
}
export interface Package {
  identifier: string;
  product: {
    title: string;
    description: string;
    priceString: string;
    subscriptionPeriod?: string | null;
  };
}
export interface Offerings {
  current: { availablePackages: Package[] } | null;
}
export interface PurchaseAdapter {
  identify(userId: string): Promise<CustomerInfo>;
  logOut(): Promise<void>;
  getOfferings(): Promise<Offerings>;
  getCustomerInfo(): Promise<CustomerInfo>;
  purchasePackage(item: Package): Promise<void>;
  restorePurchases(): Promise<void>;
  listen(listener: (info: CustomerInfo) => void): () => void;
}
export interface SubscriptionState {
  userId: string | null;
  customerInfo: CustomerInfo | null;
  offerings: Offerings | null;
  isPro: boolean;
  loading: boolean;
  error: string | null;
  expiresAt: number | null;
}
const empty: SubscriptionState = {
  userId: null,
  customerInfo: null,
  offerings: null,
  isPro: false,
  loading: false,
  error: null,
  expiresAt: null,
};
export function canUsePro(state: SubscriptionState, userId: string | null) {
  return (
    !!userId &&
    state.userId === userId &&
    !state.loading &&
    !state.error &&
    state.isPro &&
    (state.expiresAt === null || state.expiresAt > Date.now())
  );
}

// Auth may render the new account before the provider's identity effect runs.
export function subscriptionForUser(
  state: SubscriptionState,
  userId: string | null,
): SubscriptionState {
  if (!userId || state.userId !== userId)
    return { ...empty, loading: !!userId };
  return { ...state, isPro: canUsePro(state, userId) };
}
export function createSubscriptionService(
  adapter: PurchaseAdapter,
  entitlement: string,
) {
  let state = { ...empty };
  let user: string | null = null;
  let readyUser: string | null = null;
  let generation = 0;
  let queue: Promise<unknown> = Promise.resolve();
  let expiryTimer: ReturnType<typeof setTimeout> | null = null;
  const listeners = new Set<(state: SubscriptionState) => void>();
  const publish = (next: Partial<SubscriptionState>) => {
    state = { ...state, ...next };
    if (expiryTimer) clearTimeout(expiryTimer);
    expiryTimer = null;
    if (state.isPro && state.expiresAt !== null) {
      const remaining = state.expiresAt - Date.now();
      if (remaining <= 0) state = { ...state, isPro: false };
      else
        expiryTimer = setTimeout(
          () => publish({}),
          Math.min(remaining, 2_147_483_647),
        );
    }
    listeners.forEach((listener) => listener(state));
  };
  const information = (customerInfo: CustomerInfo) => {
    const grant = customerInfo.entitlements.active[entitlement];
    const expiresAt =
      grant?.expirationDate == null ? null : Date.parse(grant.expirationDate);
    return {
      customerInfo,
      expiresAt,
      isPro:
        !!grant &&
        grant.isActive !== false &&
        (expiresAt === null ||
          (Number.isFinite(expiresAt) && expiresAt > Date.now())),
    };
  };
  const serial = <T>(operation: () => Promise<T>) => {
    const pending = queue.then(operation);
    queue = pending.catch(() => undefined);
    return pending;
  };
  const failure =
    "Could not verify Pro with the store. Check your connection and refresh status. Your load work is still available.";
  let unsubscribe: (() => void) | null = null;
  async function setUser(next: string | null) {
    if (user === next && readyUser === next && !state.error) return;
    user = next;
    readyUser = null;
    const revision = ++generation;
    publish({ ...empty, userId: next, loading: !!next });
    await serial(async () => {
      try {
        if (generation !== revision) return;
        if (!next) {
          await adapter.logOut();
          return;
        }
        unsubscribe ??= adapter.listen(() => {
          // Do not trust callback identity; serialized refresh reads the current customer.
          if (user && readyUser === user && !state.loading)
            void operate("refresh").catch(() => undefined);
        });
        const info = await adapter.identify(next);
        if (generation !== revision) return;
        readyUser = next;
        publish(information(info));
        const offerings = await adapter.getOfferings();
        if (generation === revision) publish({ offerings });
      } catch {
        if (generation === revision)
          publish({ customerInfo: null, isPro: false, error: failure });
      } finally {
        if (generation === revision) publish({ loading: false });
      }
    });
  }
  async function operate(
    kind: "purchase" | "restore" | "refresh",
    item?: Package,
    expectedUser: string | null = user,
  ): Promise<"cancelled" | "pro" | "none"> {
    const revision = generation;
    const owner = user;
    if (
      !owner ||
      owner !== expectedUser ||
      readyUser !== owner ||
      state.loading
    )
      throw new Error("Purchases are not ready. Please retry.");
    publish({ loading: true, error: null });
    return serial(async () => {
      try {
        if (revision !== generation)
          throw new Error("Your account changed. Please try again.");
        if (kind === "purchase") {
          if (
            !item ||
            !state.offerings?.current?.availablePackages.includes(item)
          )
            throw new Error("Choose an available store package.");
          await adapter.purchasePackage(item);
        }
        if (kind === "restore") await adapter.restorePurchases();
        const info = await adapter.getCustomerInfo();
        const offerings =
          kind === "refresh" ? await adapter.getOfferings() : state.offerings;
        if (revision !== generation)
          throw new Error("Your account changed. Please try again.");
        publish({ ...information(info), offerings });
        return state.isPro ? "pro" : "none";
      } catch (error) {
        if (
          error &&
          typeof error === "object" &&
          "userCancelled" in error &&
          error.userCancelled
        )
          return "cancelled";
        if (revision === generation)
          publish({ customerInfo: null, isPro: false, error: failure });
        throw new Error(failure);
      } finally {
        if (revision === generation) publish({ loading: false });
      }
    });
  }
  return {
    setUser,
    snapshot: () => state,
    subscribe: (listener: (state: SubscriptionState) => void) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    purchasePackage: (item: Package, expectedUser: string | null = user) =>
      operate("purchase", item, expectedUser),
    restorePurchases: (expectedUser: string | null = user) =>
      operate("restore", undefined, expectedUser),
    refreshCustomerInfo: (expectedUser: string | null = user) =>
      operate("refresh", undefined, expectedUser),
    dispose: () => {
      unsubscribe?.();
      unsubscribe = null;
      listeners.clear();
      generation++;
      user = null;
      readyUser = null;
      if (expiryTimer) clearTimeout(expiryTimer);
      expiryTimer = null;
      state = { ...empty };
    },
  };
}
