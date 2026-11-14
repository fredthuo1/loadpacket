import { useRef, useState } from "react";
import { Text } from "react-native";
import { router } from "expo-router";
import { useAuth } from "../../src/auth/AuthProvider";
import {
  Button,
  Card,
  ErrorMessage,
  Screen,
  styles,
} from "../../src/components/ui";
import { useSubscription } from "../../src/subscriptions/SubscriptionProvider";
import { purchaseUnavailable } from "../../src/subscriptions/native";
export default function Pro() {
  const pro = useSubscription();
  const { applicationUser } = useAuth();
  const [selection, setSelection] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const lock = useRef(false);
  const packages = pro.offerings?.current?.availablePackages ?? [];
  const selected =
    packages.find((item) => item.identifier === selection) ?? packages[0];
  async function transact(restore: boolean) {
    if (lock.current || (!restore && !selected)) return;
    lock.current = true;
    setNotice(null);
    try {
      const result = restore
        ? await pro.restorePurchases()
        : await pro.purchasePackage(selected!);
      setNotice(
        result === "cancelled"
          ? "Purchase cancelled."
          : result === "pro"
            ? restore
              ? "Restore completed. Your current access is shown above."
              : "Purchase completed. Your current access is shown above."
            : restore
              ? "No active Pro entitlement was found for this store account."
              : "Purchase received. Pro is not active yet. Refresh your status or contact support.",
      );
    } catch {
      /* The shared service displays the controlled purchase error. */
    } finally {
      lock.current = false;
    }
  }
  return (
    <Screen>
      <Text style={styles.title}>LoadPacket Pro</Text>
      <Text style={styles.label}>
        {pro.loading
          ? "CHECKING STATUS"
          : pro.isPro
            ? "PRO"
            : pro.error
              ? "STATUS UNAVAILABLE · FINDER LOCKED"
              : "FREE"}
      </Text>
      <Text style={styles.heading}>Find the right load in seconds</Text>
      <Text style={styles.text}>
        Pro Load Finder searches your assigned loads by load number, facility,
        address or reference. Filter Active or Completed work without scrolling
        through every assignment.
      </Text>
      <Text style={styles.muted}>
        Pro belongs to your individual LoadPacket account.
      </Text>
      <Text style={styles.muted}>
        Your carrier’s load actions and document capture stay available
        regardless of subscription.
      </Text>
      {pro.isPro && (
        <Card>
          <Text style={styles.heading}>Pro is active</Text>
          <Text style={styles.text}>Load Finder is unlocked in My Loads.</Text>
          <Button
            title="Open Load Finder"
            onPress={() => router.replace("/(driver)")}
          />
        </Card>
      )}
      <ErrorMessage message={pro.error} />
      {__DEV__ && purchaseUnavailable && (
        <Text style={styles.muted}>{purchaseUnavailable}</Text>
      )}
      {notice && (
        <Text accessibilityRole="alert" style={styles.text}>
          {notice}
        </Text>
      )}
      {pro.loading && (
        <Text style={styles.muted}>Connecting to the store…</Text>
      )}
      {!pro.loading && !packages.length && (
        <Text style={styles.muted}>
          {__DEV__
            ? "No packages available. Check the RevenueCat current Offering, store products, SDK key, and entitlement configuration."
            : "Subscriptions are currently unavailable. Please try again later."}
        </Text>
      )}
      {!pro.isPro &&
        packages.map((item) => (
          <Card key={item.identifier}>
            <Text style={styles.heading}>{item.product.title}</Text>
            <Text style={styles.text}>{item.product.description}</Text>
            <Text style={styles.heading}>{item.product.priceString}</Text>
            {item.product.subscriptionPeriod && (
              <Text style={styles.muted}>
                Billing period: {item.product.subscriptionPeriod}
              </Text>
            )}
            <Button
              title={
                selected?.identifier === item.identifier ? "Selected" : "Select"
              }
              secondary
              onPress={() => setSelection(item.identifier)}
              disabled={pro.loading}
            />
          </Card>
        ))}
      {!pro.isPro && (
        <Button
          title={
            selected ? `Continue · ${selected.product.priceString}` : "Continue"
          }
          onPress={() => void transact(false)}
          disabled={
            pro.loading || !!pro.error || !pro.customerInfo || !selected
          }
        />
      )}
      <Button
        title="Restore Purchases"
        secondary
        onPress={() => void transact(true)}
        disabled={pro.loading || !pro.customerInfo}
      />
      <Button
        title="Refresh Status"
        secondary
        disabled={pro.loading}
        onPress={() => {
          if (applicationUser) {
            if (pro.customerInfo)
              void pro.refreshCustomerInfo().catch(() => undefined);
            else void pro.retry(applicationUser.id);
          }
        }}
      />
    </Screen>
  );
}
