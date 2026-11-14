import { Type } from 'class-transformer';
import {
  IsInt,
  IsObject,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import { Trim } from '../common/profile-validation';

export class LoadCommandDto {
  @IsUUID('4') idempotencyKey!: string;
  @Matches(/^[a-f0-9]{64}$/) expectedToken!: string;
  @Trim() @IsString() @MinLength(3) @MaxLength(1000) reason!: string;
}
export class CorrectStopDto {
  @ValidateIf((_, v) => v !== undefined)
  @Trim()
  @IsString()
  @MinLength(1)
  @MaxLength(500)
  facilityName?: string;
  @ValidateIf((_, v) => v !== undefined)
  @Trim()
  @IsString()
  @MinLength(1)
  @MaxLength(500)
  address?: string;
  @ValidateIf((_, v) => v !== undefined)
  @Trim()
  @IsString()
  @MaxLength(500)
  appointmentText?: string;
  @ValidateIf((_, v) => v !== undefined)
  @Trim()
  @IsString()
  @MaxLength(500)
  referenceNumber?: string;
}
export class CorrectLoadDto extends LoadCommandDto {
  @ValidateIf((_, v) => v !== undefined)
  @Trim()
  @IsString()
  @MaxLength(500)
  brokerContact?: string;
  @ValidateIf((_, v) => v !== undefined)
  @Trim()
  @IsString()
  @MaxLength(500)
  equipment?: string;
  @ValidateIf((_, v) => v !== undefined)
  @Matches(/^\d{1,10}(\.\d{1,2})?$/)
  linehaul?: string;
  @ValidateIf((_, v) => v !== undefined)
  @Matches(/^\d{1,10}(\.\d{1,2})?$/)
  fuelSurcharge?: string;
  @ValidateIf((_, v) => v !== undefined)
  @Matches(/^\d{1,10}(\.\d{1,2})?$/)
  totalRate?: string;
  @ValidateIf((_, v) => v !== undefined)
  @IsInt()
  @Min(0)
  @Max(365)
  paymentTermsDays?: number;
  @ValidateIf((_, v) => v !== undefined)
  @IsObject()
  @ValidateNested()
  @Type(() => CorrectStopDto)
  pickup?: CorrectStopDto;
  @ValidateIf((_, v) => v !== undefined)
  @IsObject()
  @ValidateNested()
  @Type(() => CorrectStopDto)
  delivery?: CorrectStopDto;
}
