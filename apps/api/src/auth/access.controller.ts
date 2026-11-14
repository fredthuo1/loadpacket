import {
  Body,
  Controller,
  Get,
  Header,
  Headers,
  Param,
  ParseUUIDPipe,
  Post,
} from '@nestjs/common';
import { Public } from './public.decorator';
import { Roles } from './roles.decorator';
import { CurrentUser } from './current-user.decorator';
import type { AuthenticatedUser } from './auth.types';
import { AccessService } from './access.service';
import {
  AcceptStaffDto,
  AccessCommandDto,
  ChangeStaffRoleDto,
  InviteStaffDto,
  ProvisionAccountDto,
  StaffTokenDto,
} from './access.dto';

/** Bootstrap endpoints verify provider identity themselves, before membership exists. */
@Public()
@Controller('auth')
export class AccountAccessController {
  constructor(private readonly access: AccessService) {}
  @Get('account')
  @Header('Cache-Control', 'private, no-store')
  async account(@Headers('authorization') auth?: string) {
    return this.access.status(await this.access.identity(auth));
  }
  @Post('provision')
  async provision(
    @Headers('authorization') auth: string | undefined,
    @Body() dto: ProvisionAccountDto,
  ) {
    return this.access.provision(await this.access.identity(auth), dto);
  }
  @Post('staff/preview')
  @Header('Cache-Control', 'private, no-store')
  async preview(
    @Headers('authorization') auth: string | undefined,
    @Body() dto: StaffTokenDto,
  ) {
    return this.access.preview(await this.access.identity(auth), dto.token);
  }
  @Post('staff/accept')
  async accept(
    @Headers('authorization') auth: string | undefined,
    @Body() dto: AcceptStaffDto,
  ) {
    return this.access.accept(await this.access.identity(auth), dto);
  }
}
@Roles('OWNER')
@Controller('team')
export class TeamAccessController {
  constructor(private readonly access: AccessService) {}
  @Get()
  @Header('Cache-Control', 'private, no-store')
  list(@CurrentUser() user: AuthenticatedUser) {
    return this.access.team(user);
  }
  @Post('invitations')
  @Header('Cache-Control', 'private, no-store')
  invite(@CurrentUser() user: AuthenticatedUser, @Body() dto: InviteStaffDto) {
    return this.access.invite(user, dto);
  }
  @Post('invitations/:id/revoke')
  revoke(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Body() dto: AccessCommandDto,
  ) {
    return this.access.revoke(user, id, dto.idempotencyKey);
  }
  @Post('invitations/:id/reissue')
  @Header('Cache-Control', 'private, no-store')
  reissue(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Body() dto: AccessCommandDto,
  ) {
    return this.access.reissue(user, id, dto.idempotencyKey);
  }
  @Post('members/:id/role')
  role(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Body() dto: ChangeStaffRoleDto,
  ) {
    return this.access.change(user, id, dto);
  }
  @Post('members/:id/remove')
  remove(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Body() dto: AccessCommandDto,
  ) {
    return this.access.remove(user, id, dto.idempotencyKey);
  }
}
