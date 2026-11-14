import type { Server } from 'node:http';
import { randomUUID } from 'node:crypto';
import { Test } from '@nestjs/testing';
import {
  UnauthorizedException,
  ValidationPipe,
  type INestApplication,
} from '@nestjs/common';
import request from 'supertest';
import { PDFDocument } from 'pdf-lib';
jest.mock('pdf-parse', () => ({ PDFParse: jest.fn() }));
jest.mock('pdf-parse/worker', () => ({ CanvasFactory: class {} }));
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/database/prisma.service';
import { TokenVerifier } from '../src/auth/token-verifier';
import { DriverIdentityProvider } from '../src/integrations/supabase/driver-identity-provider';
import { DocumentStorage } from '../src/documents/document-storage';
import { database, id } from './support/database-fixture';

describe('Day 7 complete customer workflow through HTTP', () => {
  let app: INestApplication;
  const authId = id(990);
  beforeAll(async () => {
    const store = database();
    const files = new Map<string, Buffer>();
    const module = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(PrismaService)
      .useValue(store.db)
      .overrideProvider(TokenVerifier)
      .useValue({
        verify: (token: string) => {
          if (token === 'owner') return Promise.resolve({ sub: id(200) });
          if (token === 'invited')
            return Promise.resolve({
              sub: authId,
              passwordAuthenticatedAt: Math.floor(Date.now() / 1000),
            });
          throw new UnauthorizedException();
        },
      })
      .overrideProvider(DriverIdentityProvider)
      .useValue({
        invite: () =>
          Promise.resolve({
            id: authId,
            email: 'production-test@example.com',
            operationId: 'test-only',
          }),
        resend: () => Promise.resolve(),
        compensate: () => Promise.resolve(true),
      })
      .overrideProvider(DocumentStorage)
      .useValue({
        put: (key: string, bytes: Buffer) => {
          if (files.has(key)) throw new Error('Immutable file');
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
        whitelist: true,
        transform: true,
        forbidNonWhitelisted: true,
      }),
    );
    await app.init();
  });
  afterAll(async () => {
    await app.close();
  });
  const api = (
    method: 'get' | 'post' | 'patch',
    path: string,
    token = 'owner',
  ) =>
    request(app.getHttpServer() as Server)
      [method](`/api/v1${path}`)
      .auth(token, { type: 'bearer' });
  it('configures company, creates and invites a driver, delivers a fresh load, reviews evidence, bills and settles without fixture edits', async () => {
    await api('get', '/me').expect(200);
    await api('patch', '/company')
      .send({ name: 'D7 Production Test Carrier' })
      .expect(200);
    const driver = await api('post', '/drivers')
      .send({
        firstName: 'D7 Production',
        lastName: 'Test Driver',
        email: 'production-test@example.com',
      })
      .expect(201);
    const driverId = (driver.body as { id: string }).id;
    await api('post', `/drivers/${driverId}/invite`).send({}).expect(200);
    await api('get', '/me/loads', 'invited').expect(403);
    // Identity provider/password verification is mocked here; browser tests cover password UI and callback.
    await api('post', '/me/complete-invitation', 'invited')
      .send({})
      .expect(200);
    await api('get', '/me', 'invited').expect(200);
    const created = await api('post', '/loads/manual')
      .send({
        loadNumber: 'D7-GOLDEN',
        brokerName: 'Test Broker',
        totalRate: '3250.00',
        pickup: { facilityName: 'Origin', address: 'Chicago, IL' },
        delivery: { facilityName: 'Destination', address: 'Dallas, TX' },
        requirements: ['BOL', 'POD', 'CARRIER_INVOICE'].map((documentType) => ({
          documentType,
          requirement: 'REQUIRED',
        })),
      })
      .expect(201);
    const loadId = (created.body as { load: { id: string } }).load.id;
    const management = await api('get', `/loads/${loadId}/management`).expect(
      200,
    );
    await api('post', `/loads/${loadId}/assign-driver`)
      .send({
        driverId,
        expectedToken: (management.body as { token: string }).token,
        idempotencyKey: '00000000-0000-4000-8000-000000000999',
        reason: 'Workflow test assignment',
      })
      .expect(201);
    const own = await api('get', `/me/loads/${loadId}`, 'invited').expect(200);
    const actionToken = (own.body as { actionToken: string }).actionToken;
    expect(JSON.stringify(own.body)).toContain('D7-GOLDEN');
    await api('post', `/me/loads/${loadId}/accept`, 'invited')
      .send({ actionToken })
      .expect(200);
    await api('post', `/me/loads/${loadId}/start`, 'invited')
      .send({ actionToken })
      .expect(200);
    const stops = (own.body as { load: { stops: { id: string }[] } }).load
      .stops;
    for (const stop of stops) {
      await api(
        'post',
        `/me/loads/${loadId}/stops/${stop.id}/arrive`,
        'invited',
      )
        .send({ actionToken })
        .expect(200);
      await api(
        'post',
        `/me/loads/${loadId}/stops/${stop.id}/depart`,
        'invited',
      )
        .send({ actionToken })
        .expect(200);
    }
    await api('post', `/money-opportunities/loads/${loadId}/scan`)
      .send({})
      .expect(201);
    const pdf = await PDFDocument.create();
    pdf.addPage();
    const bytes = Buffer.from(await pdf.save());
    for (const type of ['BOL', 'POD'])
      await api('post', `/me/loads/${loadId}/documents/${type}`, 'invited')
        .field('actionToken', actionToken)
        .attach('file', bytes, {
          filename: `${type}.pdf`,
          contentType: 'application/pdf',
        })
        .expect(201);
    await api('post', `/me/loads/${loadId}/complete`, 'invited')
      .send({ actionToken })
      .expect(200);
    const review = await api(
      'get',
      `/back-office/loads/${loadId}/requirements`,
    ).expect(200);
    for (const requirement of (
      review.body as {
        requirements: Array<{
          id: string;
          documentType: string;
          versionId: string;
        }>;
      }
    ).requirements)
      if (requirement.documentType !== 'CARRIER_INVOICE')
        await api(
          'post',
          `/back-office/loads/${loadId}/requirements/${requirement.id}/accept`,
        )
          .send({ versionId: requirement.versionId })
          .expect(200);
    await api('post', `/back-office/loads/${loadId}/carrier-invoice`)
      .send({})
      .expect(201);
    const ready = await api('get', `/owner/loads/${loadId}`).expect(200);
    expect(ready.body).toMatchObject({ load: { status: 'PAYMENT_READY' } });
    await api('get', `/back-office/loads/${loadId}/billing-packet`).expect(200);
    await api('post', `/back-office/loads/${loadId}/submit-billing`)
      .send({ recipientName: 'Test Broker', paymentTermsDays: 30 })
      .expect(200);
    const paymentPath = `/back-office/accounts-receivable/loads/${loadId}/mark-paid`;
    await api('post', paymentPath)
      .send({ amountPaid: '1000.00', idempotencyKey: randomUUID() })
      .expect(200);
    const partial = await api('get', '/back-office/accounts-receivable').expect(
      200,
    );
    expect(
      (partial.body as { invoices: Array<{ id: string }> }).invoices.find(
        (invoice) => invoice.id === loadId,
      ),
    ).toMatchObject({
      status: 'INVOICED',
      amountPaid: '1000.00',
      remainingBalance: '2250.00',
    });
    const partialOverview = await api('get', `/owner/loads/${loadId}`).expect(
      200,
    );
    expect(partialOverview.body).toMatchObject({
      billing: { balanceDue: '2250.00' },
    });
    await api('post', paymentPath)
      .send({ amountPaid: '2250.00', idempotencyKey: randomUUID() })
      .expect(200);
    const paid = await api('get', `/owner/loads/${loadId}`).expect(200);
    expect(paid.body).toMatchObject({
      load: { status: 'PAID' },
      billing: { balanceDue: '0' },
    });
    const shared = await api('post', `/loads/${loadId}/broker-access`)
      .send({
        permissions: ['VIEW_LOAD_SUMMARY', 'VIEW_DOCUMENT_STATUS'],
        expiresInDays: 1,
      })
      .expect(201);
    const brokerToken = (shared.body as { path: string }).path.split('#')[1];
    await request(app.getHttpServer() as Server)
      .get('/api/v1/external/transactions')
      .set('X-Broker-Token', brokerToken)
      .expect(200)
      .expect(({ body }: { body: { summary: { status: string } } }) =>
        expect(body.summary.status).toBe('PAID'),
      );
  });
});
