import type { Server } from 'node:http';
import { INestApplication } from '@nestjs/common';

import { Test, TestingModule } from '@nestjs/testing';

import request from 'supertest';

/*
 * AppModule includes DocumentsModule,
 * which imports pdf-parse.
 *
 * These health tests do not exercise PDF
 * extraction, so the PDF dependencies are
 * mocked here.
 */
jest.mock('pdf-parse', () => ({
  PDFParse: jest.fn().mockImplementation(() => ({
    getText: jest.fn(),

    destroy: jest.fn(),
  })),
}));

jest.mock('pdf-parse/worker', () => ({
  CanvasFactory: class CanvasFactory {},
}));

import { AppModule } from '../src/app.module';

import { PrismaService } from '../src/database/prisma.service';

describe('LoadPacket API (e2e)', () => {
  let app: INestApplication;

  const queryRawMock = jest.fn().mockResolvedValue([
    {
      health_check: 1,
    },
  ]);

  const prismaMock = {
    $queryRaw: queryRawMock,
  };

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(PrismaService)
      .useValue(prismaMock)
      .compile();

    app = moduleFixture.createNestApplication();

    app.setGlobalPrefix('api/v1');

    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  describe('GET /api/v1/health', () => {
    it('returns API health', async () => {
      const response = await request(app.getHttpServer() as Server)
        .get('/api/v1/health')
        .expect(200);

      expect((response.body as { status: string }).status).toBe('ok');

      expect((response.body as { service: string }).service).toBe(
        'loadpacket-api',
      );

      expect(typeof (response.body as { timestamp: string }).timestamp).toBe(
        'string',
      );
    });
  });

  describe('GET /api/v1/health/database', () => {
    it('returns database health', async () => {
      const response = await request(app.getHttpServer() as Server)
        .get('/api/v1/health/database')
        .expect(200);

      expect(response.body).toEqual({
        status: 'ok',

        database: 'postgresql',
      });

      expect(queryRawMock).toHaveBeenCalled();
    });
  });
});
