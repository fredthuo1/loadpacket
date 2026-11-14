// JSON read models shared by Nest and Next. No runtime package or dependencies.
export interface CompanyProfile {
  id: string;
  name: string;
  dbaName: string | null;
  mcNumber: string | null;
  usdotNumber: string | null;
  phone: string | null;
  email: string | null;
  addressLine1: string | null;
  addressLine2: string | null;
  city: string | null;
  state: string | null;
  postalCode: string | null;
  country: string;
  timezone: string;
  defaultPaymentTermsDays: number;
  updatedAt: string;
}
export interface DriverLoadSummary {
  id: string;
  loadNumber: string;
  status: string;
  assignmentStatus: string;
  assignedAt: string;
  origin: string | null;
  destination: string | null;
}
export interface DriverSummary {
  id: string;
  firstName: string;
  lastName: string;
  email: string | null;
  phone: string | null;
  status: 'ACTIVE' | 'INACTIVE';
  accountConnected: boolean;
  accountStatus: 'NOT_INVITED' | 'INVITE_PENDING' | 'CONNECTED' | 'INVITE_CANCELLED';
  invitationLastSentAt: string | null;
  currentLoad: DriverLoadSummary | null;
}
export interface DriverProfile extends DriverSummary {
  cdlNumber: string | null;
  cdlState: string | null;
  cdlExpirationDate: string | null;
  hireDate: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
  recentLoads: DriverLoadSummary[];
  totalLoadCount: number;
}
export type DriverInput = Pick<DriverProfile, 'firstName' | 'lastName' | 'email' | 'phone' | 'cdlNumber' | 'cdlState' | 'cdlExpirationDate' | 'hireDate' | 'notes'>;
