import { DriverActionDto } from './driver-action.dto';
import { IsISO8601, IsNumber, IsOptional, Max, Min } from 'class-validator';
export class StopEventDto extends DriverActionDto {
  @IsOptional()
  @IsNumber({ allowNaN: false, allowInfinity: false })
  @Min(-90)
  @Max(90)
  latitude?: number | null;
  @IsOptional()
  @IsNumber({ allowNaN: false, allowInfinity: false })
  @Min(-180)
  @Max(180)
  longitude?: number | null;
  @IsOptional()
  @IsNumber({ allowNaN: false, allowInfinity: false })
  @Min(0)
  accuracyMeters?: number | null;
  @IsOptional()
  @IsISO8601({ strict: true })
  capturedAt?: string | null;
}
