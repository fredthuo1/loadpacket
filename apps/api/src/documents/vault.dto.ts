import {
  IsEnum,
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';
import {
  CompanyDocumentType,
  DriverDocumentType,
} from '../generated/prisma/enums';
import {
  IsCalendarDate,
  OptionalText,
  Trim,
} from '../common/profile-validation';
export class VersionUploadDto {
  @IsUUID('4') uploadKey!: string;
  @IsOptional() @OptionalText() @IsCalendarDate() issuedAt?: string | null;
  @IsOptional() @OptionalText() @IsCalendarDate() expiresAt?: string | null;
}
export class CompanyDocumentUploadDto extends VersionUploadDto {
  @IsEnum(CompanyDocumentType) type!: CompanyDocumentType;
}
export class DriverDocumentUploadDto extends VersionUploadDto {
  @IsEnum(DriverDocumentType) type!: DriverDocumentType;
}
export class VaultQueryDto {
  @IsOptional() @IsIn(['COMPANY', 'DRIVER', 'LOAD']) context?:
    'COMPANY' | 'DRIVER' | 'LOAD';
  @IsOptional() @Trim() @IsString() @MaxLength(100) search?: string;
  @IsOptional() @Trim() @IsString() @MaxLength(60) type?: string;
  @IsOptional()
  @IsIn(['UPLOADED', 'TEXT_EXTRACTED', 'REVIEW_REQUIRED', 'CONFIRMED'])
  status?: string;
  @IsOptional()
  @IsIn(['VALID', 'EXPIRING_SOON', 'EXPIRED', 'NO_EXPIRATION'])
  expiration?: string;
}
