import { Module } from '@nestjs/common';
import { DriverIdentityProvider } from './driver-identity-provider';
import { SupabaseAdminService } from './supabase-admin.service';
@Module({
  providers: [
    { provide: DriverIdentityProvider, useClass: SupabaseAdminService },
  ],
  exports: [DriverIdentityProvider],
})
export class SupabaseAdminModule {}
