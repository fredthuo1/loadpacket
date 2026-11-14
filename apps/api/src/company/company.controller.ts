import { Body, Controller, Get, Patch } from '@nestjs/common';
import { CurrentUser } from '../auth/current-user.decorator';
import type { AuthenticatedUser } from '../auth/auth.types';
import { Roles } from '../auth/roles.decorator';
import { UserRole } from '../generated/prisma/enums';
import { CompanyService } from './company.service';
import { UpdateCompanyDto } from './update-company.dto';

@Controller('company')
@Roles(UserRole.OWNER, UserRole.DISPATCHER, UserRole.BACK_OFFICE)
export class CompanyController {
  constructor(private readonly company: CompanyService) {}
  @Get() get(@CurrentUser() user: AuthenticatedUser) {
    return this.company.get(user);
  }
  @Patch()
  @Roles(UserRole.OWNER)
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: UpdateCompanyDto,
  ) {
    return this.company.update(user, dto);
  }
}
