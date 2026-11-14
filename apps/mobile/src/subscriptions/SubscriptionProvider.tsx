import {
  createContext,
  useContext,
  useEffect,
  useState,
  useSyncExternalStore,
  type PropsWithChildren,
} from "react";
import { AppState } from "react-native";
import { useAuth } from "../auth/AuthProvider";
import {
  createSubscriptionService,
  subscriptionForUser,
  type Package,
} from "./service";
import { nativePurchases } from "./native";
const Context = createContext<ReturnType<
  typeof createSubscriptionService
> | null>(null);
export function SubscriptionProvider({ children }: PropsWithChildren) {
  const { applicationUser } = useAuth();
  const [service] = useState(() =>
    createSubscriptionService(
      nativePurchases,
      process.env.EXPO_PUBLIC_REVENUECAT_ENTITLEMENT_ID || "pro",
    ),
  );
  useEffect(() => {
    void service.setUser(applicationUser?.id ?? null);
  }, [service, applicationUser?.id]);
  useEffect(() => () => service.dispose(), [service]);
  useEffect(() => {
    const id = applicationUser?.id;
    if (!id) return;
    const refresh = () => {
      if (service.snapshot().loading) return;
      if (service.snapshot().customerInfo)
        void service.refreshCustomerInfo(id).catch(() => undefined);
      else void service.setUser(id);
    };
    const listener = AppState.addEventListener("change", (state) => {
      if (state === "active") refresh();
    });
    // Detect revocation while the app remains open; no background polling.
    const interval = setInterval(() => {
      if (AppState.currentState === "active") refresh();
    }, 60_000);
    return () => {
      listener.remove();
      clearInterval(interval);
    };
  }, [service, applicationUser?.id]);
  return <Context.Provider value={service}>{children}</Context.Provider>;
}
export function useSubscription() {
  const { applicationUser } = useAuth();
  const userId = applicationUser?.id ?? null;
  const service = useContext(Context);
  if (!service) throw new Error("SubscriptionProvider missing");
  const state = useSyncExternalStore(
    service.subscribe,
    service.snapshot,
    service.snapshot,
  );
  return {
    ...subscriptionForUser(state, userId),
    purchasePackage: (item: Package) => service.purchasePackage(item, userId),
    restorePurchases: () => service.restorePurchases(userId),
    refreshCustomerInfo: () => service.refreshCustomerInfo(userId),
    retry: (id: string) => service.setUser(id),
  };
}
