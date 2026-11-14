import 'reflect-metadata';
import assert from 'node:assert/strict';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import type { Server } from 'node:http';
import { Test } from '@nestjs/testing';
import {
  UnauthorizedException,
  ValidationPipe,
  type INestApplication,
} from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/database/prisma.service';
import { TokenVerifier } from '../src/auth/token-verifier';
import {
  AccountIdentityProvider,
  type VerifiedAccount,
} from '../src/auth/account-identity-provider';
import { PrismaExceptionFilter } from '../src/common/filters/prisma-exception.filter';
import { invitationHash } from '../src/auth/access.service';
import type { StaffInviteResult } from '../../../packages/api-contracts/access';

async function main() {
  const db = new PrismaService();
  const groups: string[] = [];
  let requests = 0;
  let app: INestApplication | undefined;
  let success = false;
  const pass = (name: string) => {
    groups.push(name);
    console.log('PASS ' + name);
  };
  const identities = new Map<string, VerifiedAccount>();
  const identity = () => {
    const id = randomUUID();
    identities.set(id, { id, email: `${id}@example.invalid` });
    return id;
  };
  const verified = (token: string) => {
    const value = identities.get(token);
    if (!value) throw new UnauthorizedException();
    return value;
  };
  try {
    await db.$connect();
    const [target] = await db.$queryRaw<
      { db: string; host: string; port: number; dir: string }[]
    >`SELECT current_database() db,host(inet_server_addr()) host,inet_server_port() port,current_setting('data_directory') dir`;
    assert.equal(target.db, 'loadpacket_finance_verified_test');
    assert.equal(target.host, '127.0.0.1');
    assert.equal(target.port, 55439);
    assert.equal(
      target.dir.replaceAll('\\', '/').toLowerCase(),
      resolve('../finance-postgres').replaceAll('\\', '/').toLowerCase(),
    );
    const migrations = await db.$queryRaw<
      {
        migration_name: string;
        checksum: string;
        finished_at: Date;
        rolled_back_at: Date | null;
      }[]
    >`SELECT migration_name,checksum,finished_at,rolled_back_at FROM _prisma_migrations`;
    assert.equal(migrations.length, 21);
    for (const m of migrations) {
      assert(m.finished_at && !m.rolled_back_at);
      assert.equal(
        createHash('sha256')
          .update(
            await readFile(
              resolve(
                '../../apps/api/prisma/migrations',
                m.migration_name,
                'migration.sql',
              ),
            ),
          )
          .digest('hex'),
        m.checksum,
      );
    }
    pass('Exact isolated database identity and 21 migration checksums');
    let builder = Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(PrismaService)
      .useValue(db);
    if (process.env.ACCESS_BROWSER_FIXTURE !== '1') {
      builder = builder
        .overrideProvider(TokenVerifier)
        .useValue({
          verify: (token: string) =>
            Promise.resolve({ sub: verified(token).id }),
        })
        .overrideProvider(AccountIdentityProvider)
        .useValue({
          verifiedAccount: (token: string) => Promise.resolve(verified(token)),
        });
    }
    const module = await builder.compile();
    app = module.createNestApplication();
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        transform: true,
        forbidNonWhitelisted: true,
      }),
    );
    app.useGlobalFilters(new PrismaExceptionFilter());
    app.enableCors({ origin: 'http://127.0.0.1:3100', credentials: true });
    await app.init();
    if (process.env.ACCESS_BROWSER_FIXTURE === '1') {
      await app.listen(3105, '127.0.0.1');
      console.log('B2 real database API ready');
      await new Promise<void>((done) => {
        process.once('SIGTERM', done);
        process.once('SIGINT', done);
      });
      success = true;
      return;
    }
    const server = app.getHttpServer() as Server;
    async function call(
      method: 'get' | 'post' | 'patch',
      path: string,
      token: string,
      body: object | undefined,
      expected: number,
    ) {
      let req = request(server)
        [method]('/api/v1' + path)
        .set('Authorization', `Bearer ${token}`);
      if (body) req = req.send(body);
      const response = await req;
      requests++;
      assert.equal(
        response.status,
        expected,
        `${method} ${path}: ${response.status} ${JSON.stringify(response.body)}`,
      );
      return response.body as Record<string, unknown>;
    }
    const command = () => ({ idempotencyKey: randomUUID() });
    const provision = (token: string) =>
      call(
        'post',
        '/auth/provision',
        token,
        {
          firstName: 'Fictional',
          lastName: 'Owner',
          companyName: 'Fictional B2 Carrier',
        },
        201,
      );
    const owner = identity(),
      foreign = identity();
    const countBefore = await db.organization.count();
    const outcomes = await Promise.all([
      provision(owner),
      provision(owner),
      provision(owner),
    ]);
    assert.equal(new Set(outcomes.map((x) => x.organizationId)).size, 1);
    assert.equal(await db.organization.count(), countBefore + 1);
    assert.equal(
      (await provision(owner)).organizationId,
      outcomes[0].organizationId,
    );
    const organizationId = outcomes[0].organizationId as string;
    const ownerMember = await db.user.findUniqueOrThrow({
      where: { authUserId: owner },
    });
    assert.equal(ownerMember.role, 'OWNER');
    await provision(foreign);
    await call(
      'post',
      '/auth/provision',
      identity(),
      {
        firstName: 'No',
        lastName: 'Spoof',
        companyName: 'Denied',
        organizationId,
        role: 'OWNER',
      },
      400,
    );
    await call('get', '/auth/account', 'invalid', undefined, 401);
    const unlinked = await call('get', '/me', identity(), undefined, 403);
    assert.equal(unlinked.code, 'ACCOUNT_SETUP_REQUIRED');
    pass(
      'Atomic provisioning, concurrent/lost-response retries, identity and body spoofing',
    );
    await call(
      'patch',
      '/company',
      owner,
      { name: 'Fictional B2 Updated', defaultPaymentTermsDays: 14 },
      200,
    );
    assert.equal(
      (await call('get', '/company', owner, undefined, 200)).name,
      'Fictional B2 Updated',
    );
    await call(
      'patch',
      '/company',
      foreign,
      { organizationId, name: 'Spoof' },
      400,
    );
    assert.equal(
      (
        await db.organization.findUniqueOrThrow({
          where: { id: organizationId },
        })
      ).name,
      'Fictional B2 Updated',
    );
    pass('Existing Company setup and cross-tenant input rejection');
    async function invite(token: string, role = 'BACK_OFFICE', actor = owner) {
      return (await call(
        'post',
        '/team/invitations',
        actor,
        { ...command(), email: verified(token).email, role },
        201,
      )) as unknown as StaffInviteResult;
    }
    const tokenOf = (i: StaffInviteResult) =>
      new URLSearchParams(i.invitePath!.split('#')[1]).get('token')!;
    async function accept(token: string, i: StaffInviteResult, expected = 201) {
      return call(
        'post',
        '/auth/staff/accept',
        token,
        { token: tokenOf(i), firstName: 'Fictional', lastName: 'Staff' },
        expected,
      );
    }
    const office = identity(),
      dispatch = identity();
    const key = command();
    const dto = { ...key, email: verified(office).email, role: 'BACK_OFFICE' };
    const invitation = (await call(
      'post',
      '/team/invitations',
      owner,
      dto,
      201,
    )) as unknown as StaffInviteResult;
    const duplicate = await call('post', '/team/invitations', owner, dto, 201);
    assert.equal(duplicate.invitePath, null);
    await call(
      'post',
      '/team/invitations',
      owner,
      { ...dto, role: 'DISPATCHER' },
      409,
    );
    await call(
      'post',
      '/team/invitations',
      owner,
      { ...dto, ...command() },
      409,
    );
    await call(
      'post',
      '/team/invitations',
      owner,
      { ...dto, ...command(), role: 'OWNER' },
      400,
    );
    await call(
      'post',
      '/team/invitations',
      owner,
      { ...dto, ...command(), organizationId },
      400,
    );
    const di = await invite(dispatch, 'DISPATCHER');
    const row = await db.staffInvitation.findUniqueOrThrow({
      where: { id: invitation.invitation.id },
    });
    assert.equal(row.organizationId, organizationId);
    assert.equal(row.tokenHash, invitationHash(tokenOf(invitation)));
    await call(
      'post',
      '/auth/staff/preview',
      foreign,
      { token: tokenOf(invitation) },
      404,
    );
    await call(
      'post',
      `/team/invitations/${row.id}/revoke`,
      foreign,
      command(),
      404,
    );
    await call(
      'post',
      '/auth/staff/accept',
      office,
      {
        token: tokenOf(invitation),
        firstName: 'Test',
        lastName: 'Staff',
        role: 'OWNER',
        organizationId,
      },
      400,
    );
    await call('post', '/auth/staff/preview', office, { token: 'bad' }, 400);
    await call(
      'post',
      '/auth/staff/preview',
      office,
      { token: randomBytes(32).toString('hex') },
      404,
    );
    const foreignInvite = await invite(foreign);
    await accept(foreign, foreignInvite, 403);
    const foreignTeam = await call('get', '/team', foreign, undefined, 200);
    assert(!JSON.stringify(foreignTeam).includes(row.id));
    pass(
      'Office invitations, scoped idempotency, hashing, role/tenant/token tamper protection',
    );
    const joined = await Promise.all([
      accept(office, invitation),
      accept(office, invitation),
      accept(office, invitation),
    ]);
    assert(
      joined.every(
        (x) => x.organizationId === organizationId && x.role === 'BACK_OFFICE',
      ),
    );
    await accept(dispatch, di);
    await accept(office, invitation);
    assert.equal(await db.user.count({ where: { authUserId: office } }), 1);
    await call('get', '/team', office, undefined, 403);
    await call('patch', '/company', office, { name: 'Forbidden' }, 403);
    await call('get', '/finance/settlements', office, undefined, 200);
    await call('get', '/finance/settlements', dispatch, undefined, 403);
    await call(
      'post',
      '/team/invitations',
      dispatch,
      { ...command(), email: 'denied@example.invalid', role: 'BACK_OFFICE' },
      403,
    );
    pass(
      'Concurrent single acceptance, real membership guards and B1d finance roles',
    );
    const officeMember = await db.user.findUniqueOrThrow({
      where: { authUserId: office },
    });
    await call(
      'post',
      `/team/members/${officeMember.id}/role`,
      foreign,
      { ...command(), role: 'OWNER' },
      404,
    );
    await call(
      'post',
      `/team/members/${officeMember.id}/remove`,
      foreign,
      command(),
      404,
    );
    await call(
      'post',
      `/team/members/${officeMember.id}/role`,
      owner,
      { ...command(), role: 'DISPATCHER' },
      201,
    );
    assert.equal(
      (await call('get', '/me', office, undefined, 200)).role,
      'DISPATCHER',
    );
    await call('get', '/finance/settlements', office, undefined, 403);
    const removeKey = command();
    await call(
      'post',
      `/team/members/${officeMember.id}/remove`,
      owner,
      removeKey,
      201,
    );
    await call(
      'post',
      `/team/members/${officeMember.id}/remove`,
      owner,
      removeKey,
      201,
    );
    await call('get', '/me', office, undefined, 403);
    await accept(office, invitation, 403);
    const restore = await invite(office);
    await accept(office, restore);
    assert.equal(
      (await db.user.findUniqueOrThrow({ where: { authUserId: office } })).id,
      officeMember.id,
    );
    pass(
      'Role refresh, tenant-safe soft removal, replay and explicit re-invitation',
    );
    const expiredUser = identity(),
      expiredToken = randomBytes(32).toString('hex');
    await db.staffInvitation.create({
      data: {
        organizationId,
        invitedById: ownerMember.id,
        email: verified(expiredUser).email,
        role: 'BACK_OFFICE',
        tokenHash: invitationHash(expiredToken),
        createdAt: new Date(Date.now() - 8 * 86400000),
        expiresAt: new Date(Date.now() - 86400000),
      },
    });
    await call(
      'post',
      '/auth/staff/accept',
      expiredUser,
      { token: expiredToken, firstName: 'Expired', lastName: 'Staff' },
      409,
    );
    const revokedUser = identity(),
      revoked = await invite(revokedUser);
    await call(
      'post',
      `/team/invitations/${revoked.invitation.id}/revoke`,
      owner,
      command(),
      201,
    );
    await accept(revokedUser, revoked, 409);
    const reissued = (await call(
      'post',
      `/team/invitations/${revoked.invitation.id}/reissue`,
      owner,
      command(),
      201,
    )) as unknown as StaffInviteResult;
    assert.notEqual(tokenOf(reissued), tokenOf(revoked));
    await accept(revokedUser, reissued);
    pass('Expired/revoked rejection and fresh reissued link');
    for (let n = 0; n < 3; n++) {
      const who = identity(),
        i = await invite(who);
      const responses = await Promise.all([
        request(server)
          .post('/api/v1/auth/staff/accept')
          .set('Authorization', `Bearer ${who}`)
          .send({ token: tokenOf(i), firstName: 'Race', lastName: 'Staff' }),
        request(server)
          .post(`/api/v1/team/invitations/${i.invitation.id}/revoke`)
          .set('Authorization', `Bearer ${owner}`)
          .send(command()),
      ]);
      requests += 2;
      assert.deepEqual(responses.map((r) => r.status).sort(), [201, 409]);
      const final = await db.staffInvitation.findUniqueOrThrow({
        where: { id: i.invitation.id },
      });
      assert.equal(
        await db.user.count({ where: { authUserId: who } }),
        final.status === 'ACCEPTED' ? 1 : 0,
      );
    }
    pass('Revoke versus accept: three races with one authoritative outcome');
    await call(
      'post',
      `/team/members/${ownerMember.id}/remove`,
      owner,
      command(),
      409,
    );
    await call(
      'post',
      `/team/members/${ownerMember.id}/role`,
      owner,
      { ...command(), role: 'BACK_OFFICE' },
      409,
    );
    await assert.rejects(
      db.user.update({
        where: { id: ownerMember.id },
        data: { active: false },
      }),
    );
    await assert.rejects(db.user.delete({ where: { id: ownerMember.id } }));
    await assert.rejects(
      db.user.update({
        where: { id: officeMember.id },
        data: {
          organizationId: (
            await db.user.findUniqueOrThrow({ where: { authUserId: foreign } })
          ).organizationId,
        },
      }),
    );
    pass(
      'Sole Owner service and independent database guards; immutable tenant',
    );
    await call(
      'post',
      `/team/members/${officeMember.id}/role`,
      owner,
      { ...command(), role: 'OWNER' },
      201,
    );
    const race = await Promise.all([
      request(server)
        .post(`/api/v1/team/members/${officeMember.id}/remove`)
        .set('Authorization', `Bearer ${owner}`)
        .send(command()),
      request(server)
        .post(`/api/v1/team/members/${ownerMember.id}/remove`)
        .set('Authorization', `Bearer ${office}`)
        .send(command()),
    ]);
    requests += 2;
    assert.equal(race.filter((r) => r.status === 201).length, 1);
    assert(race.every((r) => [201, 403, 409].includes(r.status)));
    assert.equal(
      await db.user.count({
        where: { organizationId, active: true, role: 'OWNER' },
      }),
      1,
    );
    pass('Two Owners concurrently removing each other retain one Owner');
    const directOwner = identity();
    await provision(directOwner);
    const first = await db.user.findUniqueOrThrow({
      where: { authUserId: directOwner },
    });
    const second = await db.user.create({
      data: {
        organizationId: first.organizationId,
        authUserId: randomUUID(),
        email: `${randomUUID()}@example.invalid`,
        firstName: 'DB',
        lastName: 'Race',
        role: 'OWNER',
      },
    });
    const direct = await Promise.allSettled(
      [first.id, second.id].map((id) =>
        db.user.update({ where: { id }, data: { role: 'DISPATCHER' } }),
      ),
    );
    assert.equal(direct.filter((r) => r.status === 'fulfilled').length, 1);
    assert.equal(
      await db.user.count({
        where: {
          organizationId: first.organizationId,
          active: true,
          role: 'OWNER',
        },
      }),
      1,
    );
    pass('Independent database concurrent Owner downgrades retain one Owner');
    const audits = await db.financialAuditEvent.findMany({
      where: { organizationId, recordType: 'ACCESS_ADMIN' },
    });
    assert(audits.length > 10);
    assert(!JSON.stringify(audits).includes(tokenOf(invitation)));
    await assert.rejects(
      db.financialAuditEvent.update({
        where: { id: audits[0].id },
        data: { summary: 'tamper' },
      }),
    );
    await assert.rejects(
      db.staffInvitation.update({
        where: { id: row.id },
        data: { role: 'DISPATCHER' },
      }),
    );
    await assert.rejects(db.staffInvitation.delete({ where: { id: row.id } }));
    pass(
      'Persisted access audit and invitation history immutable; no plaintext tokens',
    );
    success = true;
  } finally {
    if (app) await app.close();
    await db.$disconnect();
    if (process.env.ACCESS_BROWSER_FIXTURE !== '1')
      await writeFile(
        'results.json',
        JSON.stringify({ success, groups, httpRequests: requests }, null, 2),
      );
  }
}
void main().catch((error: unknown) => {
  console.error(
    error instanceof Error ? error.message : 'Access acceptance failed',
  );
  process.exitCode = 1;
});
