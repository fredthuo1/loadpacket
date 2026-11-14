import { driverActionToken } from '../src/loads/load-action-token';
import type { Server } from 'node:http';
import { Test } from '@nestjs/testing';
import {
  UnauthorizedException,
  ValidationPipe,
  type INestApplication,
} from '@nestjs/common';
import request from 'supertest';
jest.mock('pdf-parse', () => ({ PDFParse: jest.fn() }));
jest.mock('pdf-parse/worker', () => ({ CanvasFactory: class {} }));
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/database/prisma.service';
import { TokenVerifier } from '../src/auth/token-verifier';
import {
  database,
  id,
  loadA,
  loadB,
  orgA,
  orgB,
  otherDriverLoad,
} from './support/database-fixture';

describe('Driver stop events through authenticated HTTP', () => {
  let app: INestApplication;
  let actionToken: string;
  let store: ReturnType<typeof database>;
  const stopIds = [id(810), id(811), id(812)];
  beforeEach(async () => {
    store = database();
    store.tables.load[0].status = 'IN_TRANSIT';
    store.tables.loadAssignment[0].status = 'IN_PROGRESS';
    store.tables.loadStop.push(
      ...stopIds.map((stopId, i) => ({
        id: stopId,
        organizationId: orgA,
        loadId: loadA,
        sequence: (i + 1) * 10,
        type: i === 0 ? 'PICKUP' : 'DELIVERY',
        facilityName: `Stop ${i}`,
        address: 'Test address',
        appointmentText: null,
        referenceNumber: null,
        arrivedAt: null,
        departedAt: null,
      })),
    );
    store.tables.loadStop.push({
      id: id(819),
      organizationId: orgB,
      loadId: loadB,
      sequence: 1,
      type: 'PICKUP',
      address: 'Foreign',
      arrivedAt: null,
      departedAt: null,
    });
    const tokens = [
      'owner',
      'foreign-owner',
      'driver',
      'other-driver',
      'dispatcher',
      'back-office',
      'inactive',
      'unlinked',
    ];
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
    await app.init();
    actionToken = await driverActionToken(
      app.get(PrismaService),
      orgA,
      loadA,
      id(20),
    );
  });
  afterEach(async () => {
    await app.close();
  });
  const post = (
    stop = stopIds[0],
    action = 'arrive',
    body: Record<string, unknown> = {},
    token = 'driver',
    load = loadA,
  ) =>
    request(app.getHttpServer() as Server)
      .post(`/api/v1/me/loads/${load}/stops/${stop}/${action}`)
      .auth(token, { type: 'bearer' })
      .send({ actionToken, ...body });
  it('records ordered multi-stop evidence once, preserves first location on retry, and leaves load status unchanged', async () => {
    const location = {
      latitude: 38.123,
      longitude: -90.123,
      accuracyMeters: 12.4,
      capturedAt: '2026-09-20T12:00:00Z',
    };
    await post(stopIds[1]).expect(409);
    await post(stopIds[0], 'depart').expect(409);
    const first = await post(stopIds[0], 'arrive', location).expect(200);
    const retry = await post(stopIds[0], 'arrive', {
      latitude: 0,
      longitude: 0,
    }).expect(200);
    expect(retry.body).toMatchObject({
      duplicate: true,
      stop: {
        arrivedAt: (first.body as { stop: { arrivedAt: string } }).stop
          .arrivedAt,
      },
    });
    expect(store.tables.loadEvent).toHaveLength(1);
    expect(store.tables.loadEvent[0]).toMatchObject({
      actorType: 'DRIVER',
      actorId: id(102),
      type: 'ARRIVED_PICKUP',
      organizationId: orgA,
      metadata: { ...location, locationAvailable: true },
    });
    for (const stop of stopIds) {
      await post(stop).expect(200);
      await post(stop, 'depart').expect(200);
      await post(stop, 'depart').expect(200);
    }
    expect(store.tables.loadEvent).toHaveLength(6);
    expect(store.tables.load[0].status).toBe('IN_TRANSIT');
    expect(store.tables.loadEvent[1].metadata).toMatchObject({
      locationAvailable: false,
      latitude: null,
      longitude: null,
    });
    const autopilot = await request(app.getHttpServer() as Server)
      .get(`/api/v1/me/loads/${loadA}/autopilot`)
      .auth('driver', { type: 'bearer' })
      .expect(200);
    expect(autopilot.body).toMatchObject({ stopAction: null });
    expect(JSON.stringify(autopilot.body)).not.toMatch(
      /latitude|longitude|totalRate|brokerName/,
    );
  });
  it('projects server-provided allowed stop action and next recommendation', async () => {
    const get = (path: string) =>
      request(app.getHttpServer() as Server)
        .get(`/api/v1/me/loads/${loadA}${path}`)
        .auth('driver', { type: 'bearer' });
    let detail = await get('').expect(200);
    expect(
      (
        detail.body as { load: { stops: { allowedAction: string | null }[] } }
      ).load.stops.map((s) => s.allowedAction),
    ).toEqual(['arrive', null, null]);
    await post().expect(200);
    detail = await get('').expect(200);
    expect(
      (
        detail.body as { load: { stops: { allowedAction: string | null }[] } }
      ).load.stops.map((s) => s.allowedAction),
    ).toEqual(['depart', null, null]);
    const next = await get('/autopilot').expect(200);
    expect(next.body).toMatchObject({
      stopAction: { stopId: stopIds[0], action: 'depart' },
    });
  });
  it.each(['invalid', 'owner', 'dispatcher', 'back-office', 'unlinked'])(
    'rejects unauthorized identity %s',
    async (token) => {
      await post(stopIds[0], 'arrive', {}, token).expect(
        token === 'invalid' ? 401 : 403,
      );
      expect(store.writes).toHaveLength(0);
    },
  );
  it('blocks wrong driver, tenant, load and stop with no writes', async () => {
    await post(stopIds[0], 'arrive', {}, 'other-driver').expect(404);
    await post(id(819), 'arrive', {}, 'driver', loadB).expect(404);
    await post(stopIds[0], 'arrive', {}, 'driver', otherDriverLoad).expect(404);
    await post(id(819)).expect(404);
    await post(id(999)).expect(404);
    expect(store.writes).toHaveLength(0);
  });
  it.each([
    { latitude: 91, longitude: 0 },
    { latitude: 0, longitude: -181 },
    { latitude: '38', longitude: -90 },
    { latitude: 0 },
    { longitude: 0 },
    { latitude: null, longitude: 2 },
    { latitude: 1, longitude: 2, accuracyMeters: -1 },
    { latitude: 1, longitude: 2, capturedAt: 'yesterday' },
    { accuracyMeters: 3 },
    { organizationId: orgB },
    { driverId: id(20) },
    { role: 'DRIVER' },
    { eventActor: 'DRIVER' },
  ])('validates location and rejects client identity %j', async (body) => {
    await post(stopIds[0], 'arrive', body).expect(400);
    expect(store.writes).toHaveLength(0);
  });
  it('accepts explicit null location as manual evidence', async () => {
    await post(stopIds[0], 'arrive', {
      latitude: null,
      longitude: null,
      accuracyMeters: null,
      capturedAt: null,
    }).expect(200);
    expect(store.tables.loadEvent[0].metadata).toMatchObject({
      locationAvailable: false,
    });
  });
  it('requires active transit, but retains idempotent retries after completion', async () => {
    store.tables.load[0].status = 'BOOKED';
    await post().expect(409);
    store.tables.load[0].status = 'IN_TRANSIT';
    await post().expect(200);
    store.tables.load[0].status = 'DELIVERED';
    store.tables.loadAssignment[0].status = 'COMPLETED';
    await post().expect(200);
    await post(stopIds[0], 'depart').expect(409);
    expect(store.tables.loadEvent).toHaveLength(1);
  });
  it('rejects cancelled assignments and a driver deactivated after authentication', async () => {
    store.tables.loadAssignment[0].status = 'CANCELLED';
    await post().expect(404);
    store.tables.loadAssignment[0].status = 'IN_PROGRESS';
    store.tables.driver[0].status = 'INACTIVE';
    await post().expect(403);
  });
});
