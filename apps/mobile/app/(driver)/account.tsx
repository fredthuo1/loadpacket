import { Text } from "react-native";
import { router } from "expo-router";
import { useAuth } from "../../src/auth/AuthProvider";
import { Button, Card, Screen, styles } from "../../src/components/ui";
import { useSubscription } from "../../src/subscriptions/SubscriptionProvider";
export default function Account() {
  const { applicationUser: user, signOut } = useAuth();
  const { isPro, loading, error } = useSubscription();
  return (
    <Screen>
      <Text style={styles.title}>Account</Text>
      <Card>
        <Text style={styles.heading}>
          {user?.firstName} {user?.lastName}
        </Text>
        <Text style={styles.text}>{user?.email}</Text>
        <Text style={styles.muted}>Driver</Text>
      </Card>
      <Card>
        <Text style={styles.heading}>LoadPacket Pro</Text>
        <Text style={styles.text}>
          {loading
            ? "Checking Pro status…"
            : isPro
              ? "Pro Load Finder is active."
              : error
                ? "Pro status unavailable. Finder is locked."
                : "Free · Unlock Pro Load Finder."}
        </Text>
        <Text style={styles.muted}>
          Load execution and paperwork capture are always available through your
          carrier.
        </Text>
        <Button title="View Pro" onPress={() => router.push("/(driver)/pro")} />
      </Card>
      <Button title="Sign Out" secondary onPress={() => void signOut()} />
    </Screen>
  );
}
