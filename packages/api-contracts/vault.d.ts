export interface VaultVersion {
  id: string;
  versionNumber: number;
  originalFileName: string;
  mimeType: string;
  sizeBytes: number;
  checksum: string;
  uploadedAt: string;
  uploadedBy: string | null;
  issuedAt: string | null;
  expiresAt: string | null;
}
export interface VaultDocument {
  id: string;
  context: 'COMPANY' | 'DRIVER' | 'LOAD';
  ownerId: string;
  ownerName: string;
  type: string;
  status: string;
  expiration: 'VALID' | 'EXPIRING_SOON' | 'EXPIRED' | 'NO_EXPIRATION';
  versions: VaultVersion[];
}
