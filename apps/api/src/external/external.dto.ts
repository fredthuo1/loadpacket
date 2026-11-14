import { ArrayUnique, IsArray, IsIn, IsOptional } from 'class-validator';
export const BROKER_PERMISSIONS = [
  'VIEW_LOAD_SUMMARY',
  'VIEW_ROUTE',
  'VIEW_AGREEMENT',
  'VIEW_DOCUMENT_STATUS',
  'VIEW_SHARED_DOCUMENTS',
  'VIEW_DELIVERY_STATUS',
] as const;
export const BROKER_DOCUMENTS = [
  'RATE_CONFIRMATION',
  'BOL',
  'POD',
  'CARRIER_INVOICE',
] as const;
export class CreateBrokerAccessDto {
  @IsOptional() @IsIn([1, 7, 30]) expiresInDays?: number;
  @IsArray()
  @ArrayUnique()
  @IsIn(BROKER_PERMISSIONS, { each: true })
  permissions!: (typeof BROKER_PERMISSIONS)[number][];
  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsIn(BROKER_DOCUMENTS, { each: true })
  documentTypes?: (typeof BROKER_DOCUMENTS)[number][];
}
