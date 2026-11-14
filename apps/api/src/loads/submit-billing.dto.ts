import {
  IsEmail,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateIf,
} from 'class-validator';
import { Trim } from '../common/profile-validation';

export class SubmitBillingDto {
  @Trim()
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  recipientName!: string;

  @IsOptional()
  @Trim()
  @IsEmail()
  @MaxLength(320)
  recipientEmail?: string;

  @ValidateIf((_object: unknown, value: unknown) => value !== undefined)
  @IsInt()
  @Min(0)
  @Max(365)
  paymentTermsDays?: number;
}
