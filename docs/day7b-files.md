# Day 7B file inventory

Only changes made for this phase/checkpoint are listed. This is not the entire dirty working tree. Existing unrelated edits/deletions, real environment files, old migrations and business rows were preserved. No dependencies, commits or pushes were added.

## API and schema

- [API example environment](<C:/Users/User/Documents/loadpacket/apps/api/.env.example>) — sanitized real values, added empty admin configuration.
- [Prisma schema](<C:/Users/User/Documents/loadpacket/apps/api/prisma/schema.prisma>)
- [Forward invitation migration](<C:/Users/User/Documents/loadpacket/apps/api/prisma/migrations/20260919140000_add_driver_invitation_flow/migration.sql>)
- [Identity provider interface](<C:/Users/User/Documents/loadpacket/apps/api/src/integrations/supabase/driver-identity-provider.ts>)
- [Admin module](<C:/Users/User/Documents/loadpacket/apps/api/src/integrations/supabase/supabase-admin.module.ts>)
- [Admin service](<C:/Users/User/Documents/loadpacket/apps/api/src/integrations/supabase/supabase-admin.service.ts>)
- [Admin tests](<C:/Users/User/Documents/loadpacket/apps/api/src/integrations/supabase/supabase-admin.service.spec.ts>)
- [Invitation controllers](<C:/Users/User/Documents/loadpacket/apps/api/src/drivers/driver-invitation.controller.ts>)
- [Invitation service](<C:/Users/User/Documents/loadpacket/apps/api/src/drivers/driver-invitation.service.ts>)
- [Driver management service](<C:/Users/User/Documents/loadpacket/apps/api/src/drivers/driver-management.service.ts>)
- [Drivers module](<C:/Users/User/Documents/loadpacket/apps/api/src/drivers/drivers.module.ts>)
- [Auth controller](<C:/Users/User/Documents/loadpacket/apps/api/src/auth/auth.controller.ts>)
- [Auth service](<C:/Users/User/Documents/loadpacket/apps/api/src/auth/auth.service.ts>)
- [Auth module](<C:/Users/User/Documents/loadpacket/apps/api/src/auth/auth.module.ts>)
- [Auth types](<C:/Users/User/Documents/loadpacket/apps/api/src/auth/auth.types.ts>)
- [Invitation guard](<C:/Users/User/Documents/loadpacket/apps/api/src/auth/invitation.guard.ts>)
- [Token verifier interface](<C:/Users/User/Documents/loadpacket/apps/api/src/auth/token-verifier.ts>)
- [Supabase token verifier](<C:/Users/User/Documents/loadpacket/apps/api/src/auth/supabase-token-verifier.ts>)
- [Verifier tests](<C:/Users/User/Documents/loadpacket/apps/api/src/auth/supabase-token-verifier.spec.ts>)
- [HTTP invitation tests](<C:/Users/User/Documents/loadpacket/apps/api/test/driver-invitations.e2e-spec.ts>)
- [Persistence fixture](<C:/Users/User/Documents/loadpacket/apps/api/test/support/database-fixture.ts>)
- [Shared account contract](<C:/Users/User/Documents/loadpacket/packages/api-contracts/company-drivers.d.ts>)

## Web

- [Session proxy](<C:/Users/User/Documents/loadpacket/apps/web/src/proxy.ts>)
- [Auth provider](<C:/Users/User/Documents/loadpacket/apps/web/src/components/auth-provider.tsx>)
- [Auth types](<C:/Users/User/Documents/loadpacket/apps/web/src/lib/auth/types.ts>)
- [Login](<C:/Users/User/Documents/loadpacket/apps/web/src/app/login/page.tsx>)
- [Confirmation handler](<C:/Users/User/Documents/loadpacket/apps/web/src/app/auth/confirm/route.ts>)
- [Invitation/password page](<C:/Users/User/Documents/loadpacket/apps/web/src/app/auth/invite/page.tsx>)
- [Driver account component](<C:/Users/User/Documents/loadpacket/apps/web/src/components/driver-account.tsx>)
- [Driver form](<C:/Users/User/Documents/loadpacket/apps/web/src/components/driver-form.tsx>)
- [Driver detail](<C:/Users/User/Documents/loadpacket/apps/web/src/app/drivers/[driverId]/page.tsx>)
- [Driver roster](<C:/Users/User/Documents/loadpacket/apps/web/src/app/drivers/page.tsx>)
- [Auth fixture](<C:/Users/User/Documents/loadpacket/apps/web/test/auth-fixture.mjs>)
- [Management fixture](<C:/Users/User/Documents/loadpacket/apps/web/test/management-fixture.mjs>)
- [Invitation browser tests](<C:/Users/User/Documents/loadpacket/apps/web/test/invitations.spec.ts>)

## Audit and continuation

- [Safe secret-audit script](<C:/Users/User/Documents/loadpacket/scripts/day7b-secret-audit.cjs>) — candidate findings still require classification.
- [Interim phase report](<C:/Users/User/Documents/loadpacket/docs/day7b-report.md>)
- [This inventory](<C:/Users/User/Documents/loadpacket/docs/day7b-files.md>)
- [Persistent production-foundation ledger](<C:/Users/User/Documents/loadpacket/docs/day7-production-foundation-progress.md>)

Prisma generated output was refreshed and remains ignored. Playwright traces/results are ignored artifacts using synthetic credentials only. The latest callback fix has not passed its rerun yet; see the ledger before resuming.
