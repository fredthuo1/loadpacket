import { useState } from "react";
import { Text, TextInput, View } from "react-native";
import { router } from "expo-router";
import type { DriverLoadSummary } from "../../../../packages/api-contracts/driver";
import { useAuth } from "../auth/AuthProvider";
import { useSubscription } from "../subscriptions/SubscriptionProvider";
import { canUsePro, type SubscriptionState } from "../subscriptions/service";
import { findDriverLoads, type LoadScope } from "../lib/load-finder";
import { displayStatus, groupLoads } from "../lib/loads";
import { Button, Card, styles } from "./ui";

function LoadGroups({
  loads,
  loading,
}: {
  loads: DriverLoadSummary[];
  loading: boolean;
}) {
  return Object.entries(groupLoads(loads)).map(([label, entries]) => (
    <View key={label} style={styles.group}>
      <Text style={styles.heading}>{label}</Text>
      {!entries.length && !loading && (
        <Text style={[styles.muted, styles.empty]}>No loads in this group.</Text>
      )}
      {entries.map(({ load, assignment }) => (
        <Card key={assignment.id}>
          <Text style={styles.heading}>Load {load.loadNumber}</Text>
          <Text style={styles.label}>PICKUP</Text>
          <Text style={styles.text}>
            {load.pickup?.address ?? "Pickup pending"}
          </Text>
          <Text style={styles.muted}>{load.pickup?.appointmentText}</Text>
          <Text style={styles.label}>DELIVERY</Text>
          <Text style={styles.text}>
            {load.delivery?.address ?? "Delivery pending"}
          </Text>
          <Text style={styles.muted}>{load.delivery?.appointmentText}</Text>
          <Text style={styles.status}>{displayStatus(load.status)}</Text>
          <Button
            title="View Load"
            onPress={() =>
              router.push({
                pathname: "/(driver)/loads/[loadId]",
                params: { loadId: load.id },
              })
            }
          />
        </Card>
      ))}
    </View>
  ));
}

function Finder({
  loads,
  loading,
  state,
  userId,
}: {
  loads: DriverLoadSummary[];
  loading: boolean;
  state: SubscriptionState;
  userId: string;
}) {
  const [query, setQuery] = useState("");
  const [scope, setScope] = useState<LoadScope>("All");
  const visible = findDriverLoads(loads, state, userId, query, scope);
  return (
    <>
      <Card>
        <Text style={styles.label}>PRO · LOAD FINDER</Text>
        <Text style={styles.heading}>Find a load quickly</Text>
        <TextInput
          style={styles.input}
          value={query}
          onChangeText={setQuery}
          accessibilityLabel="Search loads"
          placeholder="Load, facility, city or reference"
          placeholderTextColor="#475569"
          autoCapitalize="none"
          autoCorrect={false}
          maxLength={120}
        />
        <View style={styles.row}>
          {(["All", "Active", "Completed"] as const).map((value) => (
            <Button
              key={value}
              title={scope === value ? `${value} · selected` : value}
              secondary={scope !== value}
              onPress={() => setScope(value)}
            />
          ))}
        </View>
        <Text accessibilityLiveRegion="polite" style={styles.muted}>
          {visible.length} of {loads.length} assignments
          {loading ? " · refreshing…" : ""}
        </Text>
        <Button
          secondary
          title="Clear Filters"
          onPress={() => {
            setQuery("");
            setScope("All");
          }}
        />
        {!visible.length && !loading && (
          <Text style={styles.text}>
            No matching loads. Try another search or clear filters.
          </Text>
        )}
      </Card>
      <LoadGroups loads={visible} loading={loading} />
    </>
  );
}

export function LoadBoard({
  loads,
  loading,
}: {
  loads: DriverLoadSummary[];
  loading: boolean;
}) {
  const state = useSubscription();
  const { applicationUser } = useAuth();
  const userId = applicationUser?.id ?? null;
  if (canUsePro(state, userId))
    return (
      <Finder
        key={userId}
        loads={loads}
        loading={loading}
        state={state}
        userId={userId!}
      />
    );
  return (
    <>
      <Card>
        <Text style={styles.heading}>Pro Load Finder</Text>
        <Text style={styles.muted}>
          {state.loading
            ? "Checking Pro access…"
            : state.error
              ? "Finder is locked until Pro can be verified. Your loads remain available below."
              : "Unlock search by load, facility, address or reference, plus Active and Completed filters."}
        </Text>
        <Button
          secondary
          title="View Pro"
          onPress={() => router.push("/(driver)/pro")}
        />
      </Card>
      <LoadGroups loads={loads} loading={loading} />
    </>
  );
}
