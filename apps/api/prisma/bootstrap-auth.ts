import type { PrismaClient } from '../src/generated/prisma/client';
import { UserRole } from '../src/generated/prisma/enums';

export async function bootstrapAuth(
  prisma: PrismaClient,
  organizationId: string,
  driverId: string,
) {
  for (const role of [UserRole.OWNER, UserRole.DRIVER]) {
    const authUserId = process.env[`DEV_${role}_AUTH_USER_ID`]?.trim();
    if (!authUserId) {
      console.log(
        `${role} auth-user mapping skipped: optional bootstrap identifier is absent.`,
      );
      continue;
    }
    if (
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
        authUserId,
      )
    ) {
      throw new Error(`DEV_${role}_AUTH_USER_ID must be a UUID.`);
    }
    await prisma.$transaction(async (tx) => {
      const existing = await tx.user.findUnique({ where: { authUserId } });
      if (
        existing &&
        (existing.organizationId !== organizationId || existing.role !== role)
      ) {
        throw new Error(
          'Bootstrap refuses to move an existing user between organizations or roles.',
        );
      }
      const user = await tx.user.upsert({
        where: { authUserId },
        update: {},
        create: {
          authUserId,
          organizationId,
          role,
          firstName: role === UserRole.OWNER ? 'Demo' : 'Marcus',
          lastName: role === UserRole.OWNER ? 'Owner' : 'Reed',
          email: (
            process.env[`DEV_${role}_EMAIL`] ||
            (role === UserRole.OWNER
              ? 'owner@loadpacket.example'
              : 'marcus@loadpacket.example')
          )
            .trim()
            .toLowerCase(),
        },
      });
      if (role === UserRole.DRIVER) {
        const driver = await tx.driver.findFirst({
          where: { id: driverId, organizationId },
        });
        if (!driver || (driver.userId && driver.userId !== user.id))
          throw new Error(
            'Bootstrap refuses to replace another driver user mapping.',
          );
        await tx.driver.update({
          where: { id: driverId, organizationId },
          data: { userId: user.id },
        });
      }
    });
    console.log(`${role} auth-user mapping ready.`);
  }
}
