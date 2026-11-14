import {
  ArrayMaxSize,
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsInt,
  IsUUID,
  Matches,
  Max,
  Min,
  ValidateIf,
} from 'class-validator';

export class GenerateInvoiceDto {
  @ValidateIf((_o: unknown, v: unknown) => v !== undefined)
  @IsUUID('4')
  idempotencyKey?: string;

  @ValidateIf((_o: unknown, v: unknown) => v !== undefined)
  @Matches(/^[a-f0-9]{64}$/)
  expectedToken?: string;

  @ValidateIf((_o: unknown, v: unknown) => v !== undefined)
  @IsArray()
  @ArrayUnique()
  @ArrayMaxSize(100)
  @IsUUID('4', { each: true })
  chargeIds?: string[];

  @ValidateIf((_o: unknown, v: unknown) => v !== undefined)
  @IsBoolean()
  supplemental?: boolean;
  @ValidateIf((_object: unknown, value: unknown) => value !== undefined)
  @IsInt()
  @Min(0)
  @Max(365)
  paymentTermsDays?: number;
}
