import {
  IsEmail,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  ValidateIf,
} from 'class-validator';
import {
  EmailText,
  IsCalendarDate,
  OptionalText,
  Trim,
} from '../common/profile-validation';

export class CreateDriverDto {
  @Trim() @IsString() @IsNotEmpty() @MaxLength(100) firstName!: string;
  @Trim() @IsString() @IsNotEmpty() @MaxLength(100) lastName!: string;
  @IsOptional() @EmailText() @IsEmail() @MaxLength(254) email?: string | null;
  @IsOptional() @OptionalText() @IsString() @MaxLength(40) phone?:
    string | null;
  @IsOptional() @OptionalText() @IsString() @MaxLength(50) cdlNumber?:
    string | null;
  @IsOptional() @OptionalText() @IsString() @MaxLength(60) cdlState?:
    string | null;
  @IsOptional() @OptionalText() @IsCalendarDate() cdlExpirationDate?:
    string | null;
  @IsOptional() @OptionalText() @IsCalendarDate() hireDate?: string | null;
  @IsOptional() @OptionalText() @IsString() @MaxLength(5000) notes?:
    string | null;
}
export class UpdateDriverDto extends CreateDriverDto {
  @ValidateIf((_o: unknown, v: unknown) => v !== undefined)
  declare firstName: string;
  @ValidateIf((_o: unknown, v: unknown) => v !== undefined)
  declare lastName: string;
}
export class DriverStatusCommandDto {}
