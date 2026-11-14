import { Trim } from '../common/profile-validation';
import { Type } from 'class-transformer';

import {
  IsArray,
  ArrayMaxSize,
  MaxLength,
  IsDefined,
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
  Matches,
  ValidateNested,
} from 'class-validator';

import { LoadRequirementDto, LoadStopDto } from './create-load.dto';

const MONEY_PATTERN = /^\d{1,10}(\.\d{1,2})?$/;

export class CreateManualLoadDto {
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

  @IsDefined()
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
