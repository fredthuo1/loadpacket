import {
  Body,
  Controller,
  Get,
  Header,
  Headers,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  StreamableFile,
} from '@nestjs/common';
import { IsString, Matches } from 'class-validator';
import { CurrentUser } from '../auth/current-user.decorator';
import { Roles } from '../auth/roles.decorator';
import { Public } from '../auth/public.decorator';
import type { AuthenticatedUser } from '../auth/auth.types';
import { EmptyCommandDto } from '../common/empty-command.dto';
import { CreateBrokerAccessDto } from './external.dto';
import { ExternalService } from './external.service';
export class BrokerDownloadDto {
  @IsString() @Matches(/^\d{13}\.[A-Za-z0-9_-]{43}$/) handle!: string;
}
@Controller('loads/:loadId/broker-access')
@Roles('OWNER')
export class BrokerAccessController {
  constructor(private readonly service: ExternalService) {}
  @Get() list(
    @CurrentUser() user: AuthenticatedUser,
    @Param('loadId', new ParseUUIDPipe({ version: '4' })) loadId: string,
  ) {
    return this.service.list(user, loadId);
  }
  @Post() create(
    @CurrentUser() user: AuthenticatedUser,
    @Param('loadId', new ParseUUIDPipe({ version: '4' })) loadId: string,
    @Body() body: CreateBrokerAccessDto,
  ) {
    return this.service.create(user, loadId, body);
  }
  @Post(':accessId/revoke') @HttpCode(200) revoke(
    @CurrentUser() user: AuthenticatedUser,
    @Param('loadId', new ParseUUIDPipe({ version: '4' })) loadId: string,
    @Param('accessId', new ParseUUIDPipe({ version: '4' })) accessId: string,
    @Body() _body: EmptyCommandDto,
  ) {
    void _body;
    return this.service.revoke(user, loadId, accessId);
  }
}
@Controller('external/transactions')
@Public()
export class ExternalController {
  constructor(private readonly service: ExternalService) {}
  @Get()
  @Header('Cache-Control', 'private, no-store')
  @Header('Referrer-Policy', 'no-referrer')
  @Header('X-Robots-Tag', 'noindex, nofollow')
  view(@Headers('x-broker-token') token: string | undefined) {
    return this.service.view(token);
  }
  @Post('download')
  @HttpCode(200)
  @Header('Cache-Control', 'private, no-store')
  @Header('Referrer-Policy', 'no-referrer')
  @Header('X-Content-Type-Options', 'nosniff')
  async download(
    @Headers('x-broker-token') token: string | undefined,
    @Body() body: BrokerDownloadDto,
  ) {
    const file = await this.service.download(token, body.handle);
    return new StreamableFile(file.bytes, {
      type: file.mimeType,
      disposition: `attachment; filename="${file.name}"`,
      length: file.bytes.length,
    });
  }
}
