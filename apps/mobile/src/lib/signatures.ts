import type {
  CaptureSignature,
  SignatureEvidence,
  SignatureRole,
} from "../../../../packages/api-contracts/signatures";
export function signatureRoles(type: string): SignatureRole[] {
  return type === "BOL"
    ? ["SHIPPER", "DRIVER"]
    : type === "POD"
      ? ["RECEIVER", "DRIVER"]
      : [];
}
export const signerRoleLabel = (role: SignatureRole) =>
  role === "RECEIVER"
    ? "Receiver / Consignee"
    : role === "SHIPPER"
      ? "Shipper"
      : "Driver";
export function canAddSignature(item: {
  documentType: string;
  documentId?: string | null;
  documentVersionId?: string | null;
  status: string;
}) {
  return (
    signatureRoles(item.documentType).length > 0 &&
    !!item.documentId &&
    !!item.documentVersionId &&
    ["RECEIVED", "ACCEPTED"].includes(item.status)
  );
}
// Request identifiers deduplicate retries; they are not credentials or access grants.
export const signatureRequestKey = () =>
  `${Date.now()}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`;
export function createSignatureSession(
  type: "BOL" | "POD",
  versionId: string,
  send: (body: CaptureSignature) => Promise<SignatureEvidence>,
  key = signatureRequestKey(),
) {
  let state = {
    name: "",
    role: signatureRoles(type)[0],
    image: "",
    saving: false,
    saved: null as SignatureEvidence | null,
    error: null as string | null,
    attempted: false,
    cancelled: false,
  };
  const listeners = new Set<() => void>();
  const publish = (next: Partial<typeof state>) => {
    state = { ...state, ...next };
    listeners.forEach((fn) => fn());
  };
  return {
    snapshot: () => state,
    subscribe: (fn: () => void) => {
      listeners.add(fn);
      return () => {
        listeners.delete(fn);
      };
    },
    edit: (next: Partial<Pick<typeof state, "name" | "role" | "image">>) => {
      if (!state.saving && !state.saved && !state.attempted && !state.cancelled)
        publish({ ...next, error: null });
    },
    clear: () => {
      if (!state.saving && !state.attempted)
        publish({ image: "", error: null });
    },
    cancel: () => {
      if (!state.saving) publish({ cancelled: true });
    },
    async save() {
      if (state.saving || state.saved || state.cancelled) return;
      if (
        !state.name.trim() ||
        state.name.trim().length > 120 ||
        !signatureRoles(type).includes(state.role) ||
        !/^data:image\/png;base64,/.test(state.image)
      ) {
        publish({ error: "Enter a signer name and draw a signature." });
        return;
      }
      if (state.image.length > 90000) {
        publish({
          error: "Signature is too large. Clear and draw a smaller signature.",
        });
        return;
      }
      publish({ saving: true, attempted: true, error: null });
      try {
        const saved = await send({
          documentVersionId: versionId,
          signerName: state.name.trim(),
          signerRole: state.role,
          image: state.image,
          idempotencyKey: key,
        });
        publish({ saved });
      } catch {
        publish({
          error:
            "Signature was not confirmed. Check your connection and retry the same signature. Cancel to return to the load.",
        });
      } finally {
        publish({ saving: false });
      }
    },
  };
}
