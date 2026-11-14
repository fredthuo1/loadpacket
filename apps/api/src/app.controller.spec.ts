import { ServiceUnavailableException } from '@nestjs/common';

import { Test, TestingModule } from '@nestjs/testing';

import { AppController } from './app.controller';

import { PrismaService } from './database/prisma.service';

describe('AppController', () => {
  let appController: AppController;

  const queryRawMock = jest.fn();

  beforeEach(async () => {
    queryRawMock.mockReset();

    const moduleRef: TestingModule = await Test.createTestingModule({
      controllers: [AppController],

      providers: [
        {
          provide: PrismaService,

          useValue: {
            $queryRaw: queryRawMock,
          },
        },
      ],
    }).compile();

    appController = moduleRef.get<AppController>(AppController);
  });

  describe('getHealth', () => {
    it('returns API health information', () => {
      const result = appController.getHealth();

      expect(result.status).toBe('ok');

      expect(result.service).toBe('loadpacket-api');

      expect(typeof result.timestamp).toBe('string');

      expect(Number.isNaN(Date.parse(result.timestamp))).toBe(false);
    });
  });

  describe('getDatabaseHealth', () => {
    it('returns ok when PostgreSQL is reachable', async () => {
      queryRawMock.mockResolvedValue([
        {
          health_check: 1,
        },
      ]);

      const result = await appController.getDatabaseHealth();

      expect(queryRawMock).toHaveBeenCalledTimes(1);

      expect(result).toEqual({
        status: 'ok',

        database: 'postgresql',
      });
    });

    it('returns a service unavailable error when PostgreSQL cannot be reached', async () => {
      queryRawMock.mockRejectedValue(new Error('Database unavailable'));

      await expect(appController.getDatabaseHealth()).rejects.toBeInstanceOf(
        ServiceUnavailableException,
      );
    });
  });
});
