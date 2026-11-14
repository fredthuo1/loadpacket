import { useCallback, useRef, useState } from "react";
import { Alert, Linking, RefreshControl, Text } from "react-native";
import { useFocusEffect, useLocalSearchParams } from "expo-router";
import type {
  DriverAutopilot,
  DriverDocumentType,
  DriverLoadDetail,
  DriverStop,
} from "../../../../../packages/api-contracts/driver";
import { api } from "../../../src/auth/supabase";
import {
  Button,
  Card,
  ErrorMessage,
  Screen,
  styles,
} from "../../../src/components/ui";
import { displayStatus, documentLabels } from "../../../src/lib/loads";
import { pickDocument } from "../../../src/lib/capture";
import { uploadForm, type UploadFile } from "../../../src/lib/files";
import { foregroundLocation } from "../../../src/lib/native-location";
import { SignatureEvidencePanel } from "../../../src/components/signature-evidence";
import {
  requestGeneration,
  assignmentCommand,
  uploadRetryMatches,
  canDriverCapture,
} from "../../../src/lib/request-state";

function confirm(
  title: string,
  message: string,
  action: string,
): Promise<boolean> {
  return new Promise((resolve) =>
    Alert.alert(
      title,
      message,
      [
        { text: "Cancel", style: "cancel", onPress: () => resolve(false) },
        { text: action, onPress: () => resolve(true) },
      ],
      { cancelable: true, onDismiss: () => resolve(false) },
    ),
  );
}
export default function LoadDetail() {
  const { loadId } = useLocalSearchParams<{ loadId: string }>();
  return <LoadDetailScreen key={loadId} loadId={loadId} />;
}
function LoadDetailScreen({ loadId }: { loadId: string }) {
  const generation = useRef(requestGeneration()).current;
  const base = `/me/loads/${encodeURIComponent(loadId)}`;
  const [detail, setDetail] = useState<DriverLoadDetail | null>(null);
  const [autopilot, setAutopilot] = useState<DriverAutopilot | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [retryUpload, setRetryUpload] = useState<{
    type: DriverDocumentType;
    file: UploadFile;
    actionToken: string | undefined;
  } | null>(null);
  const refresh = useCallback(async () => {
    const revision = generation.begin();
    setLoading(true);
    try {
      const [next, actions] = await Promise.all([
        api.request<DriverLoadDetail>(base),
        api.request<DriverAutopilot>(`${base}/autopilot`),
      ]);
      if (!generation.current(revision)) return;
      setRetryUpload((pending) =>
        pending && !uploadRetryMatches(pending.actionToken, next.actionToken)
          ? null
          : pending,
      );
      setDetail(next);
      setAutopilot(actions);
    } catch (e) {
      if (!generation.current(revision)) return;
      setAutopilot(null);
      setDetail(null);
      throw e;
    } finally {
      if (generation.current(revision)) setLoading(false);
    }
  }, [base, generation]);
  const reload = useCallback(() => {
    setError(null);
    void refresh().catch((e: unknown) =>
      setError(e instanceof Error ? e.message : "Could not refresh this load."),
    );
  }, [refresh]);
  useFocusEffect(
    useCallback(() => {
      reload();
      return () => generation.invalidate();
    }, [reload, generation]),
  );
  async function run(operation: () => Promise<void>) {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      await operation();
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "The action failed. Please try again.",
      );
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  function action(name: "accept" | "start" | "complete") {
    void run(async () => {
      if (
        name === "complete" &&
        !(await confirm(
          "Complete delivery?",
          "This marks this delivery complete and sends your paperwork for review.",
          "Complete Delivery",
        ))
      )
        return;
      await api.request(`${base}/${name}`, {
        method: "POST",
        body: assignmentCommand(detail?.actionToken),
      });
      setNotice(
        name === "complete"
          ? "Delivery complete. Your paperwork has been sent for review."
          : name === "accept"
            ? "Load accepted."
            : "Load started.",
      );
      await refresh();
    });
  }
  async function upload(
    type: DriverDocumentType,
    file: UploadFile,
    actionToken: string | undefined,
  ) {
    assignmentCommand(actionToken);
    if (!uploadRetryMatches(actionToken, detail?.actionToken))
      throw new Error(
        "The assignment changed. Refresh and choose the document again.",
      );
    setRetryUpload({ type, file, actionToken });
    const multipart = uploadForm(file);
    multipart.append("actionToken", actionToken ?? "");
    await api.request(`${base}/documents/${type}`, {
      method: "POST",
      multipart,
    });
    setRetryUpload(null);
    setNotice(
      "Paperwork received and sent for review. Uploading does not mean it has been approved.",
    );
    await refresh();
  }
  function capture(
    type: DriverDocumentType,
    source: "camera" | "photo" | "file",
  ) {
    void run(async () => {
      const file = await pickDocument(source);
      if (file) await upload(type, file, detail?.actionToken);
    });
  }
  function stopEvent(stop: DriverStop) {
    void run(async () => {
      if (!stop.allowedAction) return;
      if (
        !(await confirm(
          "Record stop event",
          "LoadPacket uses your location when you record arrival or departure to verify the load event. It does not track you in the background.",
          "Continue",
        ))
      )
        return;
      const captured = await foregroundLocation();
      if (
        !(await confirm(
          stop.allowedAction === "arrive"
            ? "Record arrival?"
            : "Record departure?",
          captured.location
            ? "Your current location will be attached to this event."
            : `${captured.reason} You can record this event without location.`,
          captured.location ? "Record Event" : "Record Without Location",
        ))
      )
        return;
      await api.request(`${base}/stops/${stop.id}/${stop.allowedAction}`, {
        method: "POST",
        body: {
          ...captured.location,
          ...assignmentCommand(detail?.actionToken),
        },
      });
      setNotice(
        stop.allowedAction === "arrive"
          ? "Arrival recorded."
          : "Departure recorded.",
      );
      await refresh();
    });
  }
  const disabled = busy || loading || !autopilot || !detail?.actionToken;
  const next = autopilot?.stopAction ?? autopilot?.driverAction;
  return (
    <Screen
      refreshControl={
        <RefreshControl refreshing={loading} onRefresh={reload} />
      }
    >
      <Text style={styles.title}>
        {detail ? `Load ${detail.load.loadNumber}` : "Load Detail"}
      </Text>
      <ErrorMessage message={error} />
      {loading && !detail && (
        <Text accessibilityRole="alert" style={styles.muted}>
          Loading load details…
        </Text>
      )}
      {error && (
        <Button title="Refresh Load" onPress={reload} disabled={busy} />
      )}
      {notice && (
        <Text accessibilityRole="alert" style={styles.text}>
          {notice}
        </Text>
      )}
      {busy && (
        <Text accessibilityRole="alert" style={styles.muted}>
          Working… Please keep the app open.
        </Text>
      )}
      {detail && (
        <>
          <Text style={styles.status}>{displayStatus(detail.load.status)}</Text>
          {next && (
            <Card>
              <Text style={styles.label}>NEXT ACTION</Text>
              <Text style={styles.heading}>{next.label}</Text>
              <Text style={styles.text}>{next.reason}</Text>
            </Card>
          )}
          {autopilot?.driverAction.type === "ACCEPT_LOAD" && (
            <Button
              title="Accept Load"
              disabled={disabled}
              onPress={() => action("accept")}
            />
          )}
          {autopilot?.driverAction.type === "START_LOAD" && (
            <Button
              title="Start Load"
              disabled={disabled}
              onPress={() => action("start")}
            />
          )}
          {(detail.load.stops ?? []).map((stop) => (
            <Card key={stop.id}>
              <Text style={styles.heading}>
                {stop.sequence}. {displayStatus(stop.type)}
              </Text>
              <Text style={styles.text}>{stop.facilityName}</Text>
              <Text style={styles.text}>{stop.address}</Text>
              {stop.appointmentText && (
                <Text style={styles.muted}>{stop.appointmentText}</Text>
              )}
              {stop.referenceNumber && (
                <Text style={styles.muted}>
                  Reference: {stop.referenceNumber}
                </Text>
              )}
              <Button
                secondary
                title="Open Address in Maps"
                onPress={() =>
                  void Linking.openURL(
                    `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(stop.address)}`,
                  ).catch(() => setError("Could not open maps."))
                }
              />
              {stop.arrivedAt && (
                <Text style={styles.text}>
                  Arrived: {new Date(stop.arrivedAt).toLocaleString()}
                </Text>
              )}
              {stop.departedAt && (
                <Text style={styles.text}>
                  Departed: {new Date(stop.departedAt).toLocaleString()}
                </Text>
              )}
              {stop.allowedAction && (
                <Button
                  title={`${stop.allowedAction === "arrive" ? "Arrived at" : "Departed"} ${displayStatus(stop.type)}`}
                  disabled={disabled}
                  onPress={() => stopEvent(stop)}
                />
              )}
            </Card>
          ))}
          <Card>
            <Text style={styles.heading}>Equipment</Text>
            <Text style={styles.text}>
              {detail.load.equipment ?? "Not specified"}
            </Text>
          </Card>
          <Text style={styles.heading}>Documents</Text>
          {detail.load.requirements
            .filter((requirement) => requirement.requirement !== "NOT_REQUIRED")
            .map((requirement) => (
              <Card key={requirement.id}>
                <Text style={styles.heading}>
                  {documentLabels[requirement.documentType]}
                </Text>
                <Text style={styles.label}>
                  {displayStatus(requirement.status)}
                </Text>
                {requirement.reviewReason && (
                  <Text style={styles.text}>{requirement.reviewReason}</Text>
                )}
                {canDriverCapture(
                  requirement.documentType,
                  requirement.status,
                  detail.assignment.status,
                ) && (
                  <>
                    {requirement.status === "REJECTED" && (
                      <Text style={styles.muted}>
                        Upload a corrected version. Previous evidence stays in
                        the load history.
                      </Text>
                    )}
                    <Button
                      title="Take Photo"
                      disabled={disabled}
                      onPress={() =>
                        capture(requirement.documentType, "camera")
                      }
                    />
                    <Button
                      title="Choose Photo"
                      secondary
                      disabled={disabled}
                      onPress={() => capture(requirement.documentType, "photo")}
                    />
                    <Button
                      title="Choose PDF / File"
                      secondary
                      disabled={disabled}
                      onPress={() => capture(requirement.documentType, "file")}
                    />
                  </>
                )}
                {requirement.status === "RECEIVED" && (
                  <Text style={styles.muted}>
                    Received. Awaiting office review.
                  </Text>
                )}
                {["BOL", "POD"].includes(requirement.documentType) &&
                  requirement.documentId &&
                  requirement.documentVersionId && (
                    <SignatureEvidencePanel
                      key={requirement.documentVersionId}
                      requirement={requirement}
                      loadNumber={detail.load.loadNumber}
                      disabled={busy || loading}
                    />
                  )}
              </Card>
            ))}
          {retryUpload && (
            <Button
              title={`Retry ${documentLabels[retryUpload.type]} Upload`}
              disabled={disabled}
              onPress={() =>
                void run(() =>
                  upload(
                    retryUpload.type,
                    retryUpload.file,
                    retryUpload.actionToken,
                  ),
                )
              }
            />
          )}
          {autopilot?.deliveryGuard.applicable && (
            <Card>
              <Text style={styles.heading}>Before you leave</Text>
              <Text style={styles.text}>{autopilot.deliveryGuard.message}</Text>
              {autopilot.deliveryGuard.blockers.map((blocker, index) => (
                <Text key={`${blocker.type}-${index}`} style={styles.text}>
                  • {blocker.message}
                </Text>
              ))}
              {autopilot.stopAction && (
                <Text style={styles.muted}>
                  Record the next stop action shown above before completing
                  delivery.
                </Text>
              )}
              <Button
                title="Complete Delivery"
                disabled={
                  disabled ||
                  !autopilot.deliveryGuard.canLeave ||
                  !!autopilot.stopAction
                }
                onPress={() => action("complete")}
              />
            </Card>
          )}
        </>
      )}
    </Screen>
  );
}
