export type OfficeRole = "OWNER" | "BACK_OFFICE" | "DISPATCHER";
export type AccessMember = {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  role: OfficeRole;
  active: boolean;
};
export type StaffInvite = {
  id: string;
  email: string;
  role: "BACK_OFFICE" | "DISPATCHER";
  status: string;
  createdAt: string;
  expiresAt: string;
  acceptedAt: string | null;
  revokedAt: string | null;
};
export type StaffInviteResult = {
  invitation: StaffInvite;
  invitePath: string | null;
};
export type AccountStatus =
  | { linked: false; email: string }
  | { linked: true; active: boolean; role: string; organizationId: string };
