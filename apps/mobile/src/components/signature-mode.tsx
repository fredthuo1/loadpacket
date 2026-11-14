import { useRef, useState, useSyncExternalStore } from "react";
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import SignatureCanvas, {
  type SignatureViewRef,
} from "react-native-signature-canvas";
import type { SignatureEvidence } from "../../../../packages/api-contracts/signatures";
import { api } from "../auth/supabase";
import {
  createSignatureSession,
  signatureRoles,
  signerRoleLabel,
} from "../lib/signatures";
import { Button, ErrorMessage, styles } from "./ui";

export function SignatureMode({
  documentId,
  versionId,
  type,
  loadNumber,
  close,
  captured,
}: {
  documentId: string;
  versionId: string;
  type: "BOL" | "POD";
  loadNumber: string;
  close(): void;
  captured(item: SignatureEvidence): void;
}) {
  const [session] = useState(() =>
    createSignatureSession(type, versionId, (body) =>
      api.request(`/documents/${documentId}/signatures`, {
        method: "POST",
        body,
      }),
    ),
  );
  const state = useSyncExternalStore(
    session.subscribe,
    session.snapshot,
    session.snapshot,
  );
  const pad = useRef<SignatureViewRef>(null);
  const exporting = useRef(false);
  const [reading, setReading] = useState(false);
  const [padError, setPadError] = useState<string | null>(null);
  const [drawing, setDrawing] = useState(false);
  const busy = reading || state.saving;
  const save = async () => {
    await session.save();
    const result = session.snapshot().saved;
    if (result) captured(result);
  };
  const cancel = () => {
    if (!busy) {
      session.cancel();
      close();
    }
  };
  return (
    <Modal
      visible
      presentationStyle="fullScreen"
      animationType="slide"
      onRequestClose={cancel}
    >
      <SafeAreaView style={styles.screen} accessibilityViewIsModal>
        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === "ios" ? "padding" : undefined}
        >
          <ScrollView
            contentContainerStyle={styles.content}
            keyboardShouldPersistTaps="handled"
            scrollEnabled={!drawing}
          >
            <Text style={styles.heading}>
              LoadPacket ·{" "}
              {type === "BOL" ? "Bill of Lading" : "Proof of Delivery"}
            </Text>
            <Text style={styles.text}>Load {loadNumber}</Text>
            <Text style={styles.muted}>
              Optional signature evidence. Signer identity is not independently
              verified.
            </Text>
            <Text style={styles.text}>Signer name</Text>
            <TextInput
              accessibilityLabel="Signer name"
              style={styles.input}
              maxLength={120}
              value={state.name}
              editable={!busy && !state.attempted}
              onChangeText={(name) => session.edit({ name })}
            />
            <Text style={styles.text}>Signer role</Text>
            <View style={styles.row}>
              {signatureRoles(type).map((role) => (
                <Button
                  key={role}
                  title={`${signerRoleLabel(role)}${state.role === role ? " · selected" : ""}`}
                  secondary={state.role !== role}
                  disabled={busy || state.attempted}
                  onPress={() => session.edit({ role })}
                />
              ))}
            </View>
            <Text style={styles.text}>Please sign below</Text>
            <View
              style={{
                height: 240,
                borderWidth: 1,
                borderColor: "#cbd5e1",
                borderRadius: 10,
                overflow: "hidden",
              }}
              pointerEvents={busy || state.attempted ? "none" : "auto"}
              accessibilityLabel="Signature pad: draw your signature"
            >
              <SignatureCanvas
                ref={pad}
                imageType="image/png"
                backgroundColor="#ffffff"
                penColor="#111111"
                autoClear={false}
                webStyle=".m-signature-pad--footer { display: none; } .m-signature-pad { box-shadow: none; border: none; } body,html { margin: 0; }"
                onBegin={() => setDrawing(true)}
                onEnd={() => setDrawing(false)}
                onError={() => {
                  exporting.current = false;
                  setReading(false);
                  setPadError("Signature pad unavailable. Cancel and retry.");
                }}
                onEmpty={() => {
                  exporting.current = false;
                  setReading(false);
                  setPadError("Draw a signature before saving.");
                }}
                onOK={(image) => {
                  if (!exporting.current) return;
                  exporting.current = false;
                  setReading(false);
                  session.edit({ image });
                  void save();
                }}
                webviewProps={{
                  cacheEnabled: false,
                  incognito: true,
                  allowFileAccess: false,
                  allowUniversalAccessFromFileURLs: false,
                  setSupportMultipleWindows: false,
                  onShouldStartLoadWithRequest: (request) =>
                    request.url === "about:blank" ||
                    request.url.startsWith("data:text/html"),
                }}
              />
            </View>
            <ErrorMessage message={padError ?? state.error} />
            {state.attempted && state.error && (
              <Text style={styles.muted}>
                Your original name and drawing are retained for a safe retry.
                Reopen this form to capture separate evidence.
              </Text>
            )}
            {busy && (
              <Text accessibilityRole="alert" style={styles.text}>
                Saving signature…
              </Text>
            )}
            <Button
              title="Clear Signature"
              secondary
              disabled={busy || state.attempted}
              onPress={() => {
                session.clear();
                pad.current?.clearSignature();
                setPadError(null);
              }}
            />
            <Button title="Cancel" secondary disabled={busy} onPress={cancel} />
            <Button
              title={
                state.attempted ? "Retry Save Signature" : "Save Signature"
              }
              disabled={busy || !state.name.trim()}
              onPress={() => {
                if (exporting.current || state.saving) return;
                setPadError(null);
                if (state.attempted) {
                  void save();
                  return;
                }
                exporting.current = true;
                setReading(true);
                pad.current?.readSignature();
              }}
            />
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </Modal>
  );
}
