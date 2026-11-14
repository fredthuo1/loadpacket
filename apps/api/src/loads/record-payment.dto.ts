import {
  IsDateString,
  IsOptional,
  IsUUID,
  Matches,
  ValidateIf,
  MaxLength,
} from 'class-validator';

export class RecordPaymentDto {
  @ValidateIf((_o: unknown, v: unknown) => v !== undefined)
  @IsUUID('4')
  invoiceId?: string;

  @Matches(/^\d{1,10}(\.\d{1,2})?$/)
  @MaxLength(13)
  amountPaid!: string;

  @IsUUID('4')
  idempotencyKey!: string;

  @IsOptional()
  @IsDateString()
  paidAt?: string;
}
