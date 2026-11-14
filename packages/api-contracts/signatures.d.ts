export type SignatureRole = "DRIVER" | "SHIPPER" | "RECEIVER";
export interface SignatureEvidence {
  id: string;
  documentId: string;
  documentVersionId: string;
  versionNumber: number;
  signerName: string;
  signerRole: SignatureRole;
  signedAt: string;
}
export interface CaptureSignature {
  documentVersionId: string;
  signerName: string;
  signerRole: SignatureRole;
  image: string;
  idempotencyKey: string;
}
