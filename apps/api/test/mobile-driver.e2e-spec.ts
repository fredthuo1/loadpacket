import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import { Test } from '@nestjs/testing';
import {
  UnauthorizedException,
  ValidationPipe,
  type INestApplication,
} from '@nestjs/common';
import { createApiClient, ApiError } from '../../mobile/src/api/client';
import { assignmentCommand } from '../../mobile/src/lib/request-state';
import type {
  DriverLoadDetail,
  DriverLoadSummary,
} from '../../../packages/api-contracts/driver';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/database/prisma.service';
import { TokenVerifier } from '../src/auth/token-verifier';
import { DocumentStorage } from '../src/documents/document-storage';
import { database, id, loadA, loadB, orgA } from './support/database-fixture';
jest.mock('pdf-parse', () => ({ PDFParse: jest.fn() }));
jest.mock('pdf-parse/worker', () => ({ CanvasFactory: class {} }));

describe('Mobile client against real driver HTTP routes (synthetic persistence)', () => {
  let app: INestApplication,
    store: ReturnType<typeof database>,
    client: ReturnType<typeof createApiClient>;
  let files: Map<string, Buffer>, denied: number;
  const base = `/me/loads/${loadA}`;
  const conflict = (e: unknown) => e instanceof ApiError && e.status === 409;
  beforeEach(async () => {
    store = database();
    files = new Map();
    denied = 0;
    store.tables.loadStop.push(
      ...['PICKUP', 'DELIVERY'].map((type, i) => ({
        id: id(810 + i),
        organizationId: orgA,
        loadId: loadA,
        sequence: i + 1,
        type,
        facilityName: 'Fictional stop',
        address: 'Fictional address',
        appointmentText: '8 AM',
        referenceNumber: 'REF',
        arrivedAt: null,
        departedAt: null,
      })),
    );
    const module = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(PrismaService)
      .useValue(store.db)
      .overrideProvider(TokenVerifier)
      .useValue({
        verify: (token: string) => {
          if (token !== 'synthetic-driver') throw new UnauthorizedException();
          return Promise.resolve({ sub: id(202) });
        },
      })
      .overrideProvider(DocumentStorage)
      .useValue({
        put: (key: string, bytes: Buffer) => {
          files.set(key, bytes);
          return Promise.resolve();
        },
        read: (key: string) => Promise.resolve(files.get(key)),
        removeUncommitted: (key: string) => {
          files.delete(key);
          return Promise.resolve();
        },
      })
      .compile();
    app = module.createNestApplication();
    app.useLogger(false);
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(
      new ValidationPipe({
        transform: true,
        whitelist: true,
        forbidNonWhitelisted: true,
      }),
    );
    await app.listen(0, '127.0.0.1');
    const port = ((app.getHttpServer() as Server).address() as AddressInfo)
      .port;
    client = createApiClient(`http://127.0.0.1:${port}/api/v1`, {
      identity: () => Promise.resolve(id(202)),
      token: () => Promise.resolve('synthetic-driver'),
      refresh: () => Promise.resolve(null),
      clear: async () => {},
    });
    client.onAccessDenied(() => denied++);
  });
  afterEach(async () => {
    await app.close();
  });
  const detail = () => client.request<DriverLoadDetail>(base);
  const command = (path: string, token: string | undefined) =>
    client.request(path, { method: 'POST', body: assignmentCommand(token) });
  const upload = (type: string, token: string | undefined) => {
    const multipart = new FormData();
    multipart.append('actionToken', assignmentCommand(token).actionToken);
    multipart.append(
      'file',
      new Blob(['%PDF-1.7 fictional ' + type], { type: 'application/pdf' }),
      type + '.pdf',
    );
    return client.request(`${base}/documents/${type}`, {
      method: 'POST',
      multipart,
    });
  };
  it('lists only assigned work and completes accept/start/stops/upload/delivery without Pro', async () => {
    const list = await client.request<{ loads: DriverLoadSummary[] }>(
      '/me/loads',
    );
    expect(list.loads.map((row) => row.load.id)).toEqual([loadA]);
    await expect(client.request(`/me/loads/${loadB}`)).rejects.toMatchObject({
      status: 404,
    });
    const initial = await detail();
    expect(initial.load.stops).toHaveLength(2);
    expect(JSON.stringify(initial)).not.toMatch(/totalRate|brokerName/);
    const token = initial.actionToken;
    await command(`${base}/accept`, token);
    await command(`${base}/accept`, token);
    await command(`${base}/start`, token);
    await command(`${base}/start`, token);
    await expect(command(`${base}/complete`, token)).rejects.toBeInstanceOf(
      ApiError,
    );
    for (const stop of [id(810), id(811)])
      for (const event of ['arrive', 'depart']) {
        await command(`${base}/stops/${stop}/${event}`, token);
        await command(`${base}/stops/${stop}/${event}`, token);
      }
    for (const type of ['BOL', 'POD']) {
      await upload(type, token);
      await expect(upload(type, token)).rejects.toMatchObject({ status: 409 });
    }
    expect(files.size).toBe(2);
    expect(store.tables.documentVersion).toHaveLength(2);
    await command(`${base}/complete`, token);
    await command(`${base}/complete`, token);
    expect((await detail()).assignment.status).toBe('COMPLETED');
    for (const type of [
      'DRIVER_ACCEPTED',
      'LOAD_STARTED',
      'LOAD_COMPLETED',
      'ARRIVED_PICKUP',
      'DEPARTED_PICKUP',
      'ARRIVED_DELIVERY',
      'DEPARTED_DELIVERY',
    ])
      expect(
        store.tables.loadEvent.filter((row) => row.type === type),
      ).toHaveLength(1);
  });
  it('same-driver reassignment rejects old tokens including uploads before any storage write', async () => {
    const old = (await detail()).actionToken;
    store.tables.loadAssignment[0].assignedAt = new Date();
    await expect(command(`${base}/accept`, old)).rejects.toMatchObject({
      status: 409,
    });
    // Explicit predicates preserve the HTTP contract and do not accept a generic failure.
    try {
      await command(`${base}/start`, old);
      throw Error('Expected stale rejection');
    } catch (e) {
      expect(conflict(e)).toBe(true);
    }
    await expect(upload('BOL', old)).rejects.toMatchObject({ status: 409 });
    expect(files.size).toBe(0);
    const fresh = (await detail()).actionToken;
    expect(fresh).not.toBe(old);
    await command(`${base}/accept`, fresh);
  });
  it('revoked user and driver mappings remove operational access and notify the mobile account boundary', async () => {
    await detail();
    store.tables.user[2].active = false;
    await expect(client.request('/me/loads')).rejects.toMatchObject({
      status: 403,
    });
    expect(denied).toBe(1);
    await expect(client.request('/me')).rejects.toMatchObject({ status: 403 });
    expect(denied).toBe(1);
    store.tables.user[2].active = true;
    store.tables.driver[0].status = 'INACTIVE';
    await expect(detail()).rejects.toMatchObject({ status: 403 });
  });
  it('other-driver reassignment and cancelled assignment deny old detail/actions', async () => {
    const token = (await detail()).actionToken;
    store.tables.loadAssignment[0].driverId = id(21);
    await expect(detail()).rejects.toMatchObject({ status: 404 });
    await expect(command(`${base}/accept`, token)).rejects.toMatchObject({
      status: 404,
    });
    store.tables.loadAssignment[0].driverId = id(20);
    store.tables.loadAssignment[0].status = 'CANCELLED';
    store.tables.load[0].status = 'CANCELLED';
    const list = await client.request<{ loads: DriverLoadSummary[] }>(
      '/me/loads',
    );
    expect(list.loads).toHaveLength(0);
    await expect(command(`${base}/accept`, token)).rejects.toBeInstanceOf(
      ApiError,
    );
  });
});
