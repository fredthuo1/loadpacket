export type InviteIdentityInput = {
  email: string;
  firstName: string;
  lastName: string;
  companyName: string;
};
export type CreatedIdentity = {
  id: string;
  email: string;
  operationId: string;
};
// Only the adapter knows provider APIs and the proof needed for compensation.
export abstract class DriverIdentityProvider {
  abstract invite(input: InviteIdentityInput): Promise<CreatedIdentity>;
  abstract resend(id: string, email: string): Promise<void>;
  abstract compensate(identity: CreatedIdentity): Promise<boolean>;
}
