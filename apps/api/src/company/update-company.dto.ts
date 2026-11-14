import {
  IsEmail,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Length,
  Max,
  MaxLength,
  Min,
  ValidateIf,
} from 'class-validator';
import { EmailText, OptionalText, Trim } from '../common/profile-validation';

export class UpdateCompanyDto {
  @ValidateIf((_o: unknown, v: unknown) => v !== undefined)
  @Trim()
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  name?: string;
  @IsOptional() @OptionalText() @IsString() @MaxLength(200) dbaName?:
    string | null;
  @IsOptional() @OptionalText() @IsString() @MaxLength(30) mcNumber?:
    string | null;
  @IsOptional() @OptionalText() @IsString() @MaxLength(30) usdotNumber?:
    string | null;
  @IsOptional() @OptionalText() @IsString() @MaxLength(40) phone?:
    string | null;
  @IsOptional() @EmailText() @IsEmail() @MaxLength(254) email?: string | null;
  @IsOptional() @OptionalText() @IsString() @MaxLength(200) addressLine1?:
    string | null;
  @IsOptional() @OptionalText() @IsString() @MaxLength(200) addressLine2?:
    string | null;
  @IsOptional() @OptionalText() @IsString() @MaxLength(100) city?:
    string | null;
  @IsOptional() @OptionalText() @IsString() @MaxLength(100) state?:
    string | null;
  @IsOptional() @OptionalText() @IsString() @MaxLength(20) postalCode?:
    string | null;
  @ValidateIf((_o: unknown, v: unknown) => v !== undefined)
  @Trim()
  @IsString()
  @Length(2, 60)
  country?: string;
  @ValidateIf((_o: unknown, v: unknown) => v !== undefined)
  @Trim()
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  timezone?: string;
  @ValidateIf((_o: unknown, v: unknown) => v !== undefined)
  @IsInt()
  @Min(0)
  @Max(365)
  defaultPaymentTermsDays?: number;
}
