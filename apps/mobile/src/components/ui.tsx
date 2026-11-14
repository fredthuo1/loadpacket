import type { PropsWithChildren } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type ScrollViewProps,
} from "react-native";
export const colors = {
  ink: "#113640",
  muted: "#475569",
  blue: "#16756D",
  background: "#F2F7F7",
  border: "#cbd5e1",
  error: "#b91c1c",
};
export const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: {
    width: "100%",
    maxWidth: 720,
    alignSelf: "center",
    padding: 20,
    gap: 16,
    paddingBottom: 48,
  },
  group: { gap: 12 },
  empty: {
    backgroundColor: "#fff",
    borderWidth: 1,
    borderStyle: "dashed",
    borderColor: colors.border,
    borderRadius: 12,
    padding: 16,
  },
  card: {
    backgroundColor: "#fff",
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 12,
    padding: 16,
    gap: 10,
  },
  title: { color: "#092731", fontSize: 26, lineHeight: 34, fontWeight: "700" },
  heading: {
    color: colors.ink,
    fontSize: 19,
    lineHeight: 26,
    fontWeight: "700",
  },
  status: {
    alignSelf: "flex-start",
    backgroundColor: "#e5f6f1",
    color: colors.blue,
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    fontSize: 13,
    lineHeight: 18,
    fontWeight: "700",
  },
  text: { color: colors.ink, fontSize: 16, lineHeight: 24 },
  muted: { color: colors.muted, fontSize: 15, lineHeight: 22 },
  label: {
    color: colors.blue,
    fontSize: 13,
    fontWeight: "700",
    letterSpacing: 1,
  },
  input: {
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: colors.border,
    color: colors.ink,
    padding: 14,
    borderRadius: 10,
    fontSize: 17,
    minHeight: 50,
  },
  button: {
    minHeight: 50,
    maxWidth: "100%",
    backgroundColor: colors.blue,
    borderColor: colors.blue,
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 16,
    paddingVertical: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  buttonText: {
    color: "#fff",
    fontWeight: "700",
    fontSize: 16,
    lineHeight: 22,
    textAlign: "center",
    flexShrink: 1,
  },
  row: {
    flexDirection: "row",
    gap: 12,
    flexWrap: "wrap",
    alignItems: "center",
  },
});
export function Screen({
  children,
  ...props
}: PropsWithChildren<ScrollViewProps>) {
  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
      {...props}
    >
      {children}
    </ScrollView>
  );
}
export function Card({ children }: PropsWithChildren) {
  return <View style={styles.card}>{children}</View>;
}
export function Button({
  title,
  onPress,
  disabled,
  secondary,
}: {
  title: string;
  onPress(): void;
  disabled?: boolean;
  secondary?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: !!disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        secondary && { backgroundColor: "#fff", borderColor: colors.border },
        disabled && { backgroundColor: "#f1f5f9", borderColor: colors.border },
        pressed && { opacity: 0.8 },
      ]}
    >
      <Text
        style={[
          styles.buttonText,
          (secondary || disabled) && { color: colors.muted },
        ]}
      >
        {title}
      </Text>
    </Pressable>
  );
}
export function ErrorMessage({ message }: { message: string | null }) {
  return message ? (
    <Text
      accessibilityRole="alert"
      style={[styles.text, { color: colors.error }]}
    >
      {message}
    </Text>
  ) : null;
}
export function Loading() {
  return (
    <View
      style={[
        styles.screen,
        { justifyContent: "center", alignItems: "center" },
      ]}
    >
      <ActivityIndicator
        size="large"
        color={colors.blue}
        accessibilityLabel="Loading"
      />
    </View>
  );
}
