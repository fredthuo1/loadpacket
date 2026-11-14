import { Transform } from 'class-transformer';
import {
  IsIn,
  IsString,
  IsUUID,
  Length,
  Matches,
  MaxLength,
} from 'class-validator';
export class CaptureSignatureDto {
  @IsUUID('4') documentVersionId!: string;
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @Length(1, 120)
  signerName!: string;
  @IsIn(['DRIVER', 'SHIPPER', 'RECEIVER']) signerRole!:
    'DRIVER' | 'SHIPPER' | 'RECEIVER';
  @IsString() @MaxLength(90000) image!: string;
  @Matches(/^[a-zA-Z0-9-]{16,80}$/) idempotencyKey!: string;
}
