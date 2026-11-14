import { useEffect, useState } from "react";
import { Text } from "react-native";
import type { SignatureEvidence } from "../../../../packages/api-contracts/signatures";
import { api } from "../auth/supabase";
import { canAddSignature, signerRoleLabel } from "../lib/signatures";
import { Button, ErrorMessage, styles } from "./ui";
import { SignatureMode } from "./signature-mode";
export function SignatureEvidencePanel({
  requirement,
  loadNumber,
  disabled,
}: {
  requirement: {
    documentType: string;
    documentId?: string | null;
    documentVersionId?: string | null;
    status: string;
  };
  loadNumber: string;
  disabled: boolean;
}) {
  const [items, setItems] = useState<SignatureEvidence[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [revision, setRevision] = useState(0);
  const documentId = requirement.documentId;
  const refresh = () => {
    setLoading(true);
    setError(null);
    setRevision((value) => value + 1);
  };
  useEffect(() => {
    if (!documentId) return;
    let active = true;
    void api
      .request<{ signatures: SignatureEvidence[] }>(
        `/documents/${documentId}/signatures`,
      )
      .then((result) => {
        if (active) {
          setItems(result.signatures);
          setError(null);
          setLoading(false);
        }
      })
      .catch(() => {
        if (active) {
          setError(
            "Signature evidence could not be loaded. Your normal load workflow remains available.",
          );
          setLoading(false);
        }
      });
    return () => {
      active = false;
    };
  }, [documentId, revision]);
  const current = items.filter(
    (item) => item.documentVersionId === requirement.documentVersionId,
  );
  return (
    <>
      <Text style={styles.heading}>Signature evidence · optional</Text>
      {loading ? (
        <Text style={styles.muted}>Loading signature evidence…</Text>
      ) : (
        !error &&
        !current.length && (
          <Text style={styles.muted}>
            No signature captured for this version.
          </Text>
        )
      )}
      <ErrorMessage message={error} />
      {error && (
        <Button title="Retry Signature Status" secondary onPress={refresh} />
      )}
      {current.map((item) => (
        <Text key={item.id} style={styles.text}>
          Signature captured · {item.signerName}
          {"\n"}
          {signerRoleLabel(item.signerRole)} ·{" "}
          {new Date(item.signedAt).toLocaleString()}
        </Text>
      ))}
      {canAddSignature(requirement) && (
        <Button
          title="Add Signature"
          secondary
          disabled={disabled}
          onPress={() => setOpen(true)}
        />
      )}
      {open && documentId && requirement.documentVersionId && (
        <SignatureMode
          documentId={documentId}
          versionId={requirement.documentVersionId}
          type={requirement.documentType as "BOL" | "POD"}
          loadNumber={loadNumber}
          close={() => setOpen(false)}
          captured={(item) => {
            setItems((previous) => [
              ...previous.filter((row) => row.id !== item.id),
              item,
            ]);
            setLoading(false);
            setError(null);
            setOpen(false);
            void refresh();
          }}
        />
      )}
    </>
  );
}
