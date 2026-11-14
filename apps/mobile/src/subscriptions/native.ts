import Constants, { ExecutionEnvironment } from "expo-constants";
import { Platform } from "react-native";
import Purchases, { type PurchasesPackage } from "react-native-purchases";
import type { PurchaseAdapter } from "./service";
import { purchaseConfigurationIssue } from "./config";
const key =
  Platform.OS === "ios"
    ? process.env.EXPO_PUBLIC_REVENUECAT_IOS_API_KEY
    : process.env.EXPO_PUBLIC_REVENUECAT_ANDROID_API_KEY;
export const purchaseUnavailable = purchaseConfigurationIssue(
  Platform.OS,
  key,
  Constants.executionEnvironment === ExecutionEnvironment.StoreClient,
  __DEV__,
);
let configured = false;
const currentCustomer = async () => {
  // This bounded online capability fails closed on provider errors; no app-owned Pro cache.
  await Purchases.invalidateCustomerInfoCache();
  return Purchases.getCustomerInfo();
};
export const nativePurchases: PurchaseAdapter = {
  identify: async (userId) => {
    if (purchaseUnavailable)
      throw new Error(
        __DEV__
          ? purchaseUnavailable
          : "Purchases are temporarily unavailable.",
      );
    if (!configured) {
      Purchases.configure({ apiKey: key!, appUserID: userId });
      configured = true;
      return currentCustomer();
    }
    await Purchases.logIn(userId);
    return currentCustomer();
  },
  logOut: async () => {
    if (configured && !(await Purchases.isAnonymous()))
      await Purchases.logOut();
  },
  getOfferings: () => Purchases.getOfferings(),
  getCustomerInfo: currentCustomer,
  purchasePackage: async (item) => {
    await Purchases.purchasePackage(item as PurchasesPackage);
  },
  restorePurchases: async () => {
    await Purchases.restorePurchases();
  },
  listen: (listener) => {
    if (purchaseUnavailable) return () => {};
    Purchases.addCustomerInfoUpdateListener(listener);
    return () => Purchases.removeCustomerInfoUpdateListener(listener);
  },
};
