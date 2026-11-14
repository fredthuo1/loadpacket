import { Redirect, Stack } from "expo-router";
import { Text } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useAuth } from "../../src/auth/AuthProvider";
import { driverAccess } from "../../src/auth/access";
import {
  Button,
  ErrorMessage,
  Loading,
  Screen,
  styles,
} from "../../src/components/ui";
export default function DriverLayout() {
  const auth = useAuth();
  if (auth.loading) return <Loading />;
  if (!auth.session) return <Redirect href="/login" />;
  const access = driverAccess(auth.applicationUser);
  if (auth.error || access !== "driver")
    return (
      <SafeAreaView style={styles.screen}>
        <Screen>
          <Text style={styles.title}>LoadPacket Driver</Text>
          <ErrorMessage message={auth.error} />
          <Text style={styles.text}>
            {access === "role"
              ? "This mobile release is currently available for Drivers."
              : "Complete your carrier invitation using the email link. If you have already completed it, contact your carrier to check your Driver account."}
          </Text>
          {auth.error && <Button title="Retry" onPress={auth.retry} />}
          <Button
            title="Sign Out"
            onPress={() => void auth.signOut()}
            secondary
          />
        </Screen>
      </SafeAreaView>
    );
  return (
    <Stack key={auth.applicationUser?.id}>
      <Stack.Screen name="index" options={{ title: "LoadPacket Driver" }} />
      <Stack.Screen name="loads/[loadId]" options={{ title: "Load Detail" }} />
      <Stack.Screen name="account" options={{ title: "Account" }} />
      <Stack.Screen name="pro" options={{ title: "LoadPacket Pro" }} />
    </Stack>
  );
}
