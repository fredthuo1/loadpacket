import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  ArrayUnique,
  IsArray,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';

export class SettlementQuery {
  @IsUUID('4') driverId!: string;
  @Matches(/^\d{4}-\d{2}-\d{2}$/) periodStart!: string;
  @Matches(/^\d{4}-\d{2}-\d{2}$/) periodEnd!: string;
}
export class SettlementCommand {
  @IsUUID('4') idempotencyKey!: string;
  @IsInt() @Min(1) revision!: number;
}
export class SettlementItemDto {
  @IsIn(['PER_LOAD', 'FLAT', 'BONUS', 'DEDUCTION', 'ADJUSTMENT']) kind!:
    'PER_LOAD' | 'FLAT' | 'BONUS' | 'DEDUCTION' | 'ADJUSTMENT';
  @IsOptional() @IsUUID('4') loadId?: string;
  @Matches(/^-?\d{1,10}(\.\d{1,2})?$/) amount!: string;
  @IsString() @MinLength(1) @MaxLength(500) description!: string;
}
export class PrepareSettlementDto extends SettlementQuery {
  @IsUUID('4') idempotencyKey!: string;
  @IsIn(['USD']) currency!: 'USD';
  @IsOptional() @IsUUID('4') originalSettlementId?: string;
  @IsArray()
  @ArrayMaxSize(100)
  @ArrayUnique()
  @IsUUID('4', { each: true })
  loadIds!: string[];
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(200)
  @ValidateNested({ each: true })
  @Type(() => SettlementItemDto)
  items!: SettlementItemDto[];
}
export class EditSettlementDto extends SettlementCommand {
  @IsArray()
  @ArrayMaxSize(100)
  @ArrayUnique()
  @IsUUID('4', { each: true })
  loadIds!: string[];
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(200)
  @ValidateNested({ each: true })
  @Type(() => SettlementItemDto)
  items!: SettlementItemDto[];
}
export class CancelSettlementDto extends SettlementCommand {
  @IsString() @MinLength(3) @MaxLength(1000) reason!: string;
}
export class SettlementPaymentDto extends SettlementCommand {
  @Matches(/^\d{1,10}(\.\d{1,2})?$/) amount!: string;
  @IsIn(['USD']) currency!: 'USD';
  @Matches(/^\d{4}-\d{2}-\d{2}$/) paymentDate!: string;
  @IsIn(['CASH', 'CHECK', 'ACH', 'WIRE', 'OTHER']) method!:
    'CASH' | 'CHECK' | 'ACH' | 'WIRE' | 'OTHER';
  @IsOptional() @IsString() @MaxLength(200) reference?: string;
}
