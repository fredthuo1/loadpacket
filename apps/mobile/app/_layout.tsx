import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { AuthProvider } from "../src/auth/AuthProvider";
import { SubscriptionProvider } from "../src/subscriptions/SubscriptionProvider";
export default function RootLayout() {
  return (
    <AuthProvider>
      <SubscriptionProvider>
        <StatusBar style="dark" />
        <Stack
          screenOptions={{
            headerTintColor: "#092731",
            headerStyle: { backgroundColor: "#fff" },
          }}
        >
          <Stack.Screen name="index" options={{ headerShown: false }} />
          <Stack.Screen name="login" options={{ headerShown: false }} />
          <Stack.Screen name="(driver)" options={{ headerShown: false }} />
        </Stack>
      </SubscriptionProvider>
    </AuthProvider>
  );
}
