import { LoadCommandDto } from './load-management.dto';
import { IsUUID } from 'class-validator';

export class AssignDriverDto extends LoadCommandDto {
  @IsUUID()
  driverId!: string;
}
