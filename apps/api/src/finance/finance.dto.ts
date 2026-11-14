import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsIn,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

export class FinanceQuery {
  @IsOptional() @Matches(/^\d{4}-\d{2}-\d{2}$/) from?: string;
  @IsOptional() @Matches(/^\d{4}-\d{2}-\d{2}$/) to?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100000) page = 1;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100) pageSize = 25;
  @IsOptional()
  @IsIn(['INCOME', 'EXPENSE', 'PAYMENT', 'ADJUSTMENT', 'DRIVER_PAY'])
  type?: string;
  @IsOptional() @IsString() @MaxLength(100) category?: string;
  @IsOptional() @IsUUID('4') loadId?: string;
  @IsOptional() @IsUUID('4') driverId?: string;
  @IsOptional() @IsUUID('4') importBatchId?: string;
  @IsOptional() @IsIn(['MANUAL', 'IMPORT', 'LOADPACKET']) source?: string;
  @IsOptional() @IsString() @MaxLength(100) search?: string;
  @IsOptional() @IsIn(['date', 'amount']) sort: 'date' | 'amount' = 'date';
  @IsOptional() @IsIn(['asc', 'desc']) direction: 'asc' | 'desc' = 'desc';
}
export class CreateFinancialTransactionDto {
  @IsIn(['INCOME', 'EXPENSE', 'PAYMENT', 'ADJUSTMENT', 'DRIVER_PAY']) type!:
    'INCOME' | 'EXPENSE' | 'PAYMENT' | 'ADJUSTMENT' | 'DRIVER_PAY';
  @IsOptional() @IsIn(['INCOME', 'EXPENSE', 'PAYMENT']) effect?:
    'INCOME' | 'EXPENSE' | 'PAYMENT';
  @IsString() @MinLength(1) @MaxLength(100) category!: string;
  @Matches(/^-?\d{1,10}(\.\d{1,2})?$/) amount!: string;
  @Matches(/^\d{4}-\d{2}-\d{2}$/) transactionDate!: string;
  @IsString() @MinLength(1) @MaxLength(500) description!: string;
  @IsOptional() @IsString() @MaxLength(1000) memo?: string;
  @IsOptional() @IsString() @MaxLength(200) vendorName?: string;
  @IsOptional() @IsString() @MaxLength(200) brokerName?: string;
  @IsOptional() @IsUUID('4') loadId?: string;
  @IsOptional() @IsUUID('4') driverId?: string;
  @IsOptional() @IsUUID('4') documentId?: string;
  @IsOptional() @IsUUID('4') correctionOfId?: string;
  @IsUUID('4') idempotencyKey!: string;
}
export class ImportMappingDto {
  @IsObject() mapping!: Record<string, unknown>;
  @IsInt() @Min(0) revision!: number;
}
export class ConfirmImportDto {
  @IsInt() @Min(1) revision!: number;
  @IsBoolean() acceptWarnings!: boolean;
  @IsBoolean() skipInvalidRows!: boolean;
}
export class FinanceReasonDto {
  @IsString() @MinLength(5) @MaxLength(500) reason!: string;
}
