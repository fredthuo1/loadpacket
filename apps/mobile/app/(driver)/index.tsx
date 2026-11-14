import { useCallback, useRef, useState } from "react";
import { requestGeneration } from "../../src/lib/request-state";
import { RefreshControl, Text } from "react-native";
import { router, useFocusEffect } from "expo-router";
import type {
  DriverLoadSummary,
  DriverAssignmentHistory,
} from "../../../../packages/api-contracts/driver";
import { api } from "../../src/auth/supabase";
import { Button, ErrorMessage, Screen, styles } from "../../src/components/ui";
import { LoadBoard } from "../../src/components/load-board";
export default function MyLoads() {
  const generation = useRef(requestGeneration()).current;
  const [history, setHistory] = useState<DriverAssignmentHistory[]>([]);
  const [loads, setLoads] = useState<DriverLoadSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const refresh = useCallback(async () => {
    const revision = generation.begin();
    setLoading(true);
    setError(null);
    try {
      const result = await api.request<{
        loads: DriverLoadSummary[];
        history?: DriverAssignmentHistory[];
      }>("/me/loads");
      if (!generation.current(revision)) return;
      setLoads(result.loads);
      setHistory(result.history ?? []);
    } catch (e) {
      if (!generation.current(revision)) return;
      setLoads([]);
      setHistory([]);
      setError(e instanceof Error ? e.message : "Could not load assignments.");
    } finally {
      if (generation.current(revision)) setLoading(false);
    }
  }, [generation]);
  useFocusEffect(
    useCallback(() => {
      void refresh();
      return () => generation.invalidate();
    }, [refresh, generation]),
  );
  return (
    <Screen
      refreshControl={
        <RefreshControl refreshing={loading} onRefresh={() => void refresh()} />
      }
    >
      <Text style={styles.title}>My Loads</Text>
      <Button
        title="Account"
        secondary
        onPress={() => router.push("/(driver)/account")}
      />
      <ErrorMessage message={error} />
      {error && <Button title="Retry" onPress={() => void refresh()} />}
      {loading && !loads.length && (
        <Text style={styles.muted}>Loading assignments…</Text>
      )}
      <LoadBoard loads={loads} loading={loading} />
      {!!history.length && <Text style={styles.title}>Assignment history</Text>}
      {history.map((item) => (
        <Text key={item.id} style={styles.muted}>
          {item.loadNumber} · {item.outcome.toLowerCase()}
          {item.acceptedAt
            ? ` · Accepted ${new Date(item.acceptedAt).toLocaleDateString()}`
            : ""}
        </Text>
      ))}
    </Screen>
  );
}
