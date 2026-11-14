import {
  IsEmail,
  IsIn,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';
export class ProvisionAccountDto {
  @IsString() @MinLength(1) @MaxLength(120) firstName!: string;
  @IsString() @MinLength(1) @MaxLength(120) lastName!: string;
  @IsString() @MinLength(1) @MaxLength(200) companyName!: string;
}
export class AccessCommandDto {
  @IsUUID('4') idempotencyKey!: string;
}
export class InviteStaffDto extends AccessCommandDto {
  @IsEmail() @MaxLength(254) email!: string;
  @IsIn(['BACK_OFFICE', 'DISPATCHER']) role!: 'BACK_OFFICE' | 'DISPATCHER';
}
export class ChangeStaffRoleDto extends AccessCommandDto {
  @IsIn(['OWNER', 'BACK_OFFICE', 'DISPATCHER']) role!:
    'OWNER' | 'BACK_OFFICE' | 'DISPATCHER';
}
export class StaffTokenDto {
  @Matches(/^[0-9a-f]{64}$/) token!: string;
}
export class AcceptStaffDto extends StaffTokenDto {
  @IsString() @MinLength(1) @MaxLength(120) firstName!: string;
  @IsString() @MinLength(1) @MaxLength(120) lastName!: string;
}
