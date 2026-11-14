import { Trim } from '../common/profile-validation';
import { Type } from 'class-transformer';

import {
  IsArray,
  ArrayMaxSize,
  MaxLength,
  IsDefined,
  IsEnum,
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  ValidateNested,
  IsBoolean,
  IsIn,
  IsInt,
  Min,
  Max,
} from 'class-validator';

import { DocumentType, RequirementLevel } from '../generated/prisma/enums';

const MONEY_PATTERN = /^\d{1,10}(\.\d{1,2})?$/;

export class LoadStopDto {
  @Trim()
  @MaxLength(500)
  @IsString()
  @IsNotEmpty()
  facilityName!: string;

  @Trim()
  @MaxLength(500)
  @IsString()
  @IsNotEmpty()
  address!: string;

  @IsOptional()
  @Trim()
  @MaxLength(500)
  @IsString()
  appointment?: string;

  @IsOptional()
  @Trim()
  @MaxLength(500)
  @IsString()
  referenceNumber?: string;
}

export class LoadRequirementDto {
  @IsEnum(DocumentType)
  documentType!: DocumentType;

  @IsEnum(RequirementLevel)
  requirement!: RequirementLevel;
}

export class CreateLoadDto {
  @IsOptional() @IsUUID('4') processingRunId?: string;
  @IsOptional() @IsBoolean() reviewConfirmed?: boolean;
  @IsOptional() @IsUUID('4') confirmationKey?: string;
  @IsOptional() @IsIn(['USD']) currency?: 'USD';
  @IsOptional() @IsInt() @Min(0) @Max(365) paymentTermsDays?: number;
  @IsUUID()
  documentId!: string;

  @Trim()
  @MaxLength(500)
  @IsString()
  @IsNotEmpty()
  loadNumber!: string;

  @Trim()
  @MaxLength(500)
  @IsString()
  @IsNotEmpty()
  brokerName!: string;

  @IsOptional()
  @Trim()
  @MaxLength(500)
  @IsString()
  brokerContact?: string;

  @IsOptional()
  @Trim()
  @MaxLength(500)
  @IsString()
  equipment?: string;

  @IsOptional()
  @Matches(MONEY_PATTERN, {
    message:
      'linehaul must be a valid monetary amount with up to 2 decimal places',
  })
  linehaul?: string;

  @IsOptional()
  @Matches(MONEY_PATTERN, {
    message:
      'fuelSurcharge must be a valid monetary amount with up to 2 decimal places',
  })
  fuelSurcharge?: string;

  @Matches(MONEY_PATTERN, {
    message:
      'totalRate must be a valid monetary amount with up to 2 decimal places',
  })
  totalRate!: string;

  @IsDefined({
    message: 'pickup is required',
  })
  @IsObject({
    message: 'pickup must be an object',
  })
  @ValidateNested()
  @Type(() => LoadStopDto)
  pickup!: LoadStopDto;

  @IsDefined({
    message: 'delivery is required',
  })
  @IsObject({
    message: 'delivery must be an object',
  })
  @ValidateNested()
  @Type(() => LoadStopDto)
  delivery!: LoadStopDto;

  @ArrayMaxSize(7)
  @IsArray({
    message: 'requirements must be an array',
  })
  @ValidateNested({
    each: true,
  })
  @Type(() => LoadRequirementDto)
  requirements!: LoadRequirementDto[];
}
