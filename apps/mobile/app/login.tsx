import { useRef, useState } from "react";
import {
  KeyboardAvoidingView,
  Linking,
  Platform,
  Text,
  TextInput,
} from "react-native";
import { recoveryUrl } from "../src/auth/recovery";
import { SafeAreaView } from "react-native-safe-area-context";
import { Redirect } from "expo-router";
import { useAuth } from "../src/auth/AuthProvider";
import { authConfigured } from "../src/auth/supabase";
import {
  Button,
  Card,
  ErrorMessage,
  Loading,
  Screen,
  styles,
} from "../src/components/ui";
export default function Login() {
  const auth = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [passwordVisible, setPasswordVisible] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);
  async function submit() {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setError(null);
    try {
      await auth.signIn(email, password);
      setPassword("");
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Sign-in failed. Please try again.",
      );
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  if (auth.loading) return <Loading />;
  if (auth.session) return <Redirect href="/(driver)" />;
  return (
    <SafeAreaView style={styles.screen}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <Screen>
          <Text style={styles.title}>LoadPacket Driver</Text>
          <Card>
            <Text style={styles.heading}>Driver Login</Text>
            <Text style={styles.text}>Email</Text>
            <TextInput
              accessibilityLabel="Email"
              style={styles.input}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="email-address"
              autoComplete="email"
              value={email}
              onChangeText={setEmail}
              editable={!busy}
            />
            <Text style={styles.text}>Password</Text>
            <TextInput
              accessibilityLabel="Password"
              style={styles.input}
              secureTextEntry={!passwordVisible}
              autoCapitalize="none"
              autoComplete="current-password"
              value={password}
              onChangeText={setPassword}
              editable={!busy}
              returnKeyType="go"
              onSubmitEditing={() => {
                if (email && password) void submit();
              }}
            />
            <Button
              title={passwordVisible ? "Hide password" : "Show password"}
              secondary
              disabled={busy}
              onPress={() => setPasswordVisible(!passwordVisible)}
            />
            <ErrorMessage message={error ?? auth.error} />
            <Button
              title={busy ? "Signing in…" : "Sign In"}
              onPress={() => void submit()}
              disabled={busy || !email.trim() || !password || !authConfigured}
            />
          </Card>
          <Button
            title="Forgot password?"
            secondary
            disabled={busy}
            onPress={() => {
              const url = recoveryUrl(process.env.EXPO_PUBLIC_WEB_URL);
              if (!url) {
                setError(
                  "Open your carrier’s LoadPacket web sign-in page and choose Forgot password, or contact your carrier for the recovery link.",
                );
                return;
              }
              void Linking.openURL(url).catch(() =>
                setError(
                  "Could not open recovery. Use your carrier’s LoadPacket web sign-in page.",
                ),
              );
            }}
          />
          <Text style={styles.muted}>
            Drivers receive accounts from their carrier. Complete your
            invitation and set your password using the email link before signing
            in here.
          </Text>
          {!authConfigured && (
            <ErrorMessage
              message={
                __DEV__
                  ? "Set EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY in apps/mobile/.env, then restart Expo."
                  : "Sign-in is temporarily unavailable. Contact your carrier."
              }
            />
          )}
        </Screen>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
