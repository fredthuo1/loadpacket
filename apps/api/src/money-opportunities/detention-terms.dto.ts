import {
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
export class DetentionTermsDto {
  @IsInt() @Min(0) @Max(10080) freeMinutes!: number;
  @IsOptional()
  @IsString()
  @Matches(/^\d{1,7}(\.\d{1,2})?$/)
  hourlyRate?: string;
  @IsOptional() @IsInt() @Min(1) @Max(10080) minimumBillableMinutes?: number;
  @IsOptional() @IsInt() @Min(1) @Max(1440) roundingIncrementMinutes?: number;
  @IsOptional()
  @IsString()
  @Matches(/^\d{1,10}(\.\d{1,2})?$/)
  maximumAmount?: string;
  @IsString() @MaxLength(1000) @Matches(/\S/) basis!: string;
}
