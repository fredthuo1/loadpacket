import { IsOptional, Matches } from 'class-validator';
export class DriverActionDto {
  // Optional at parsing only: service rejects absent tokens with an actionable 409.
  @IsOptional() @Matches(/^[a-f0-9]{64}$/) actionToken?: string;
}
