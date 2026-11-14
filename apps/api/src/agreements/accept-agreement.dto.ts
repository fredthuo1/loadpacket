import {
  IsEmail,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';
import { Trim } from '../common/profile-validation';
export class AcceptAgreementDto {
  @Trim() @IsString() @MinLength(2) @MaxLength(200) acceptedByName!: string;
  @IsOptional() @Trim() @IsString() @MaxLength(200) acceptedByTitle?: string;
  @IsOptional() @Trim() @IsEmail() @MaxLength(320) acceptedByEmail?: string;
}
