import { Module } from '@nestjs/common';
import { InvitationGuard } from './invitation.guard';
import { APP_GUARD } from '@nestjs/core';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { AuthGuard } from './auth.guard';
import { RolesGuard } from './roles.guard';
import { TokenVerifier } from './token-verifier';
import { SupabaseTokenVerifier } from './supabase-token-verifier';
import { AccessService } from './access.service';
import {
  AccountAccessController,
  TeamAccessController,
} from './access.controller';
import {
  AccountIdentityProvider,
  SupabaseAccountIdentityProvider,
} from './account-identity-provider';

@Module({
  controllers: [AuthController, AccountAccessController, TeamAccessController],
  providers: [
    AuthService,
    AccessService,
    {
      provide: AccountIdentityProvider,
      useClass: SupabaseAccountIdentityProvider,
    },
    { provide: TokenVerifier, useClass: SupabaseTokenVerifier },
    { provide: APP_GUARD, useClass: AuthGuard },
    { provide: APP_GUARD, useClass: InvitationGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
  ],
})
export class AuthModule {}
