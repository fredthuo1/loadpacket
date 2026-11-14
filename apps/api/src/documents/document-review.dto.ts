import {
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
} from 'class-validator';
import { Trim } from '../common/profile-validation';
export class AcceptDocumentDto {
  @IsUUID('4') versionId!: string;
}
export class RejectDocumentDto extends AcceptDocumentDto {
  @Trim() @IsString() @MinLength(1) @MaxLength(1000) reason!: string;
}
export class WaiveDocumentDto {
  @IsOptional() @IsUUID('4') versionId?: string;
  @Trim() @IsString() @MinLength(1) @MaxLength(1000) reason!: string;
}
