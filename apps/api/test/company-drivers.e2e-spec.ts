import type { Server } from 'node:http';
import { Test } from '@nestjs/testing';
import { UnauthorizedException, ValidationPipe } from '@nestjs/common';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
jest.mock('pdf-parse', () => ({ PDFParse: jest.fn() }));
jest.mock('pdf-parse/worker', () => ({ CanvasFactory: class {} }));
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/database/prisma.service';
import { TokenVerifier } from '../src/auth/token-verifier';
import { PrismaExceptionFilter } from '../src/common/filters/prisma-exception.filter';
import {
  database,
  id,
  orgA,
  orgB,
  driverA,
  driverB,
  foreignDriver,
  loadA,
  now,
} from './support/database-fixture';
import type {
  CompanyProfile,
  DriverProfile,
  DriverSummary,
} from '../../../packages/api-contracts/company-drivers';

describe('Day 7A company and driver administration HTTP', () => {
  let app: INestApplication;
  let store: ReturnType<typeof database>;
  const tokens = [
    'owner-a',
    'owner-b',
    'driver-a',
    'driver-b',
    'dispatcher',
    'back-office',
  ];
  beforeEach(async () => {
    store = database();
    const module = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(PrismaService)
      .useValue(store.db)
      .overrideProvider(TokenVerifier)
      .useValue({
        verify: (token: string) => {
          const index = tokens.indexOf(token);
          if (index < 0) throw new UnauthorizedException();
          return Promise.resolve({ sub: id(200 + index) });
        },
      })
      .compile();
    app = module.createNestApplication();
    app.useLogger(false);
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        transform: true,
        forbidNonWhitelisted: true,
      }),
    );
    app.useGlobalFilters(new PrismaExceptionFilter());
    await app.init();
  });
  afterEach(async () => {
    await app.close();
  });
  const api = (
    method: 'get' | 'post' | 'patch',
    path: string,
    token = 'owner-a',
    body?: object,
  ) =>
    request(app.getHttpServer() as Server)
      [method](`/api/v1${path}`)
      .auth(token, { type: 'bearer' })
      .send(body);

  it.each(['owner-a', 'dispatcher', 'back-office'])(
    '%s reads only their own company',
    async (token) => {
      const result = await api('get', '/company', token).expect(200);
      expect((result.body as CompanyProfile).id).toBe(orgA);
      const other = await api('get', '/company', 'owner-b').expect(200);
      expect((other.body as CompanyProfile).id).toBe(orgB);
    },
  );
  it('owner patches only supplied fields and never creates another company', async () => {
    await api('patch', '/company', 'owner-a', {
      name: ' Updated Carrier ',
      defaultPaymentTermsDays: 0,
    }).expect(200);
    const company = store.tables.organization[0];
    expect(company.name).toBe('Updated Carrier');
    expect(company.timezone).toBe('America/Chicago');
    expect(company.defaultPaymentTermsDays).toBe(0);
    expect(store.tables.organization).toHaveLength(2);
    expect(store.tables.organization[1].name).toBe('Carrier B');
  });
  it.each(['dispatcher', 'back-office', 'driver-a'])(
    '%s cannot edit company',
    async (token) => {
      await api('patch', '/company', token, { name: 'Forbidden' }).expect(403);
    },
  );
  it('driver cannot read company administration', async () => {
    await api('get', '/company', 'driver-a').expect(403);
  });
  it.each([
    { name: '' },
    { name: '   ' },
    { name: null },
    { defaultPaymentTermsDays: -1 },
    { defaultPaymentTermsDays: 366 },
    { defaultPaymentTermsDays: 1.5 },
    { defaultPaymentTermsDays: '30' },
    { defaultPaymentTermsDays: null },
    { email: 'bad' },
    { timezone: ' ' },
    { timezone: null },
    { phone: 123 },
    { organizationId: orgB },
    { extra: 'unexpected' },
  ])('rejects invalid company input %j', async (body) => {
    await api('patch', '/company', 'owner-a', body).expect(400);
  });
  it('supports clearing optional company fields', async () => {
    await api('patch', '/company', 'owner-a', {
      email: ' OWNER@EXAMPLE.COM ',
      phone: '123',
    }).expect(200);
    const result = await api('patch', '/company', 'owner-a', {
      phone: '',
    }).expect(200);
    expect((result.body as CompanyProfile).phone).toBeNull();
    expect((result.body as CompanyProfile).email).toBe('owner@example.com');
  });
  it('roster contains same-tenant inactive history and no other tenant', async () => {
    store.tables.driver[1].status = 'INACTIVE';
    const result = await api('get', '/drivers').expect(200);
    expect((result.body as DriverSummary[]).map((d) => d.id).sort()).toEqual(
      [driverA, driverB].sort(),
    );
    expect((result.body as DriverSummary[])[0].accountConnected).toBe(true);
  });
  it.each(['get', 'patch', 'deactivate', 'activate'])(
    'foreign driver %s returns 404',
    async (method) => {
      await api(
        method === 'get' ? 'get' : method === 'patch' ? 'patch' : 'post',
        `/drivers/${foreignDriver}${['activate', 'deactivate'].includes(method) ? `/${method}` : ''}`,
        'owner-a',
        method === 'patch' ? { firstName: 'Changed' } : {},
      ).expect(404);
    },
  );
  it.each(['driver-a', 'back-office'])(
    '%s cannot read or administer roster',
    async (token) => {
      await api('get', '/drivers', token).expect(403);
      await api('post', '/drivers', token, {
        firstName: 'New',
        lastName: 'Driver',
      }).expect(403);
      await api('patch', `/drivers/${driverA}`, token, {
        firstName: 'No',
      }).expect(403);
      await api('post', `/drivers/${driverA}/deactivate`, token, {}).expect(
        403,
      );
    },
  );
  it.each(['owner-a', 'dispatcher'])(
    '%s creates an active unconnected tenant-owned driver',
    async (token) => {
      const result = await api('post', '/drivers', token, {
        firstName: ' D7A ',
        lastName: 'Test Driver',
        email: ' TEST@EXAMPLE.COM ',
        cdlExpirationDate: '2028-02-29',
        hireDate: '2026-09-19',
      }).expect(201);
      const profile = result.body as DriverProfile;
      expect(profile.firstName).toBe('D7A');
      expect(profile.accountConnected).toBe(false);
      expect(profile.status).toBe('ACTIVE');
      expect(profile.email).toBe('test@example.com');
      expect(profile.cdlExpirationDate).toBe('2028-02-29');
      expect(profile.recentLoads).toEqual([]);
      expect(
        store.tables.driver.find((d) => d.id === profile.id)?.organizationId,
      ).toBe(orgA);
      expect(store.tables.user).toHaveLength(8);
    },
  );
  it.each([
    { lastName: 'Only' },
    { firstName: 'Only' },
    { firstName: ' ', lastName: 'Name' },
    { firstName: null, lastName: 'Name' },
    { firstName: 'A', lastName: 'B', email: 'bad' },
    { firstName: 'A', lastName: 'B', cdlExpirationDate: '2026-02-30' },
    { firstName: 'A', lastName: 'B', hireDate: 'tomorrow' },
    { firstName: 'A', lastName: 'B', hireDate: '2026-01-01T00:00:00Z' },
    { firstName: 'A', lastName: 'B', organizationId: orgB },
    { firstName: 'A', lastName: 'B', userId: id(102) },
    { firstName: 'A', lastName: 'B', status: 'INACTIVE' },
  ])('rejects invalid driver creation %j', async (body) => {
    await api('post', '/drivers', 'owner-a', body).expect(400);
  });
  it.each([
    { userId: id(102) },
    { organizationId: orgB },
    { status: 'INACTIVE' },
    { firstName: null },
    { lastName: ' ' },
    { phone: 123 },
    { notes: 'x'.repeat(5001) },
  ])('rejects unsafe profile update %#', async (body) => {
    await api('patch', `/drivers/${driverA}`, 'owner-a', body).expect(400);
  });
  it('updates driver metadata without changing mapping or unspecified profile data', async () => {
    const mapping = store.tables.driver[0].userId;
    const result = await api('patch', `/drivers/${driverA}`, 'dispatcher', {
      cdlState: 'IL',
      notes: 'Updated',
      hireDate: '2020-01-01',
    }).expect(200);
    expect((result.body as DriverProfile).firstName).toBe('Marcus');
    expect(store.tables.driver[0].userId).toBe(mapping);
    expect(store.tables.driver[0].organizationId).toBe(orgA);
    await api('patch', `/drivers/${driverA}`, 'owner-a', {
      hireDate: null,
      notes: '',
    }).expect(200);
    expect(store.tables.driver[0].hireDate).toBeNull();
    expect(store.tables.driver[0].notes).toBeNull();
  });
  it('case-insensitive email uniqueness is tenant scoped for create/update/reactivation', async () => {
    store.tables.driver[0].email = 'Existing@Example.com';
    await api('post', '/drivers', 'owner-a', {
      firstName: 'A',
      lastName: 'B',
      email: 'EXISTING@example.COM',
    }).expect(409);
    await api('patch', `/drivers/${driverB}`, 'owner-a', {
      email: 'existing@example.com',
    }).expect(409);
    store.tables.driver[1].status = 'INACTIVE';
    store.tables.driver[1].email = 'existing@example.com';
    await api('post', `/drivers/${driverB}/activate`).expect(409);
    await api('post', '/drivers', 'owner-b', {
      firstName: 'A',
      lastName: 'B',
      email: 'existing@example.com',
    }).expect(201);
  });
  it.each(['ASSIGNED', 'ACCEPTED', 'IN_PROGRESS'])(
    'blocks deactivation with %s assignment',
    async (status) => {
      store.tables.loadAssignment[0].status = status;
      const result = await api('post', `/drivers/${driverA}/deactivate`).expect(
        409,
      );
      expect((result.body as { message: string }).message).toContain('AUTH-0');
      expect(store.tables.driver[0].status).toBe('ACTIVE');
    },
  );
  it('completed/cancelled history survives deactivation and reactivation is idempotent', async () => {
    store.tables.loadAssignment[0].status = 'COMPLETED';
    const history = structuredClone(store.tables.loadAssignment);
    const result = await api('post', `/drivers/${driverA}/deactivate`).expect(
      200,
    );
    expect((result.body as DriverProfile).recentLoads).toHaveLength(1);
    expect((result.body as DriverProfile).currentLoad).toBeNull();
    expect((result.body as DriverProfile).accountConnected).toBe(true);
    await api('get', `/drivers/${driverA}`).expect(200);
    await api('post', `/drivers/${driverA}/deactivate`).expect(200);
    await api('post', `/drivers/${driverA}/activate`).expect(200);
    const before = store.writes.length;
    await api('post', `/drivers/${driverA}/activate`).expect(200);
    expect(store.writes).toHaveLength(before);
    expect(store.tables.loadAssignment).toEqual(history);
  });
  it('cancelled assignments do not block deactivation', async () => {
    store.tables.loadAssignment[0].status = 'CANCELLED';
    await api('post', `/drivers/${driverA}/deactivate`).expect(200);
  });
  it('direct API assignment rejects an inactive driver and accepts an active one with an audit event', async () => {
    const state = await api('get', `/loads/${loadA}/management`).expect(200);
    const command = {
      expectedToken: (state.body as { token: string }).token,
      idempotencyKey: id(999),
      reason: 'Test assignment',
    };
    store.tables.driver[1].status = 'INACTIVE';
    await api('post', `/loads/${loadA}/assign-driver`, 'owner-a', {
      driverId: driverB,
      ...command,
    }).expect(409);
    store.tables.driver[1].status = 'ACTIVE';
    await api('post', `/loads/${loadA}/assign-driver`, 'owner-a', {
      driverId: driverB,
      ...command,
    }).expect(201);
    expect(store.tables.loadAssignment[0].driverId).toBe(driverB);
    expect(
      store.tables.loadEvent.some(
        (e) => e.type === 'DRIVER_ASSIGNED' && e.actorId === id(100),
      ),
    ).toBe(true);
    expect(store.db.$queryRaw).toHaveBeenCalled();
  });
  it('detail caps recent loads at ten and keeps active assignment separate', async () => {
    for (let i = 0; i < 12; i++) {
      const loadId = id(500 + i);
      store.tables.load.push({ ...store.tables.load[0], id: loadId });
      store.tables.loadAssignment.push({
        id: id(600 + i),
        organizationId: orgA,
        driverId: driverA,
        loadId,
        status: 'COMPLETED',
        assignedAt: new Date(now.getTime() + 1000 + i),
      });
    }
    const result = await api('get', `/drivers/${driverA}`).expect(200);
    const profile = result.body as DriverProfile;
    expect(profile.recentLoads).toHaveLength(10);
    expect(profile.totalLoadCount).toBe(13);
    expect(profile.currentLoad?.id).toBe(loadA);
  });
});
