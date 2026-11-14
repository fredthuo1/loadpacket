// Real Nest controllers, PDF extraction, parsing and load creation; isolated memory DB/files.
// Started ONLY by Playwright. No real identity provider, SQL writes or external storage.
import 'reflect-metadata';
import { Test } from '@nestjs/testing';
import { UnauthorizedException, ValidationPipe } from '@nestjs/common';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/database/prisma.service';
import { TokenVerifier } from '../src/auth/token-verifier';
import { DocumentStorage } from '../src/documents/document-storage';
import { id } from './support/database-fixture';
import { browserDatabase } from './support/browser-database';

async function main() {
  if (
    process.env.LOADPACKET_AUTH_TEST !== '1' ||
    process.env.NODE_ENV !== 'test'
  )
    throw new Error('Browser fixture requires explicit test environment.');
  const files = new Map<string, Buffer>();
  // Browser checks need the same query-aware DB behavior without Jest call tracking.
  const module = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(PrismaService)
    .useValue(browserDatabase().db)
    .overrideProvider(TokenVerifier)
    .useValue({
      verify: (token: string) => {
        if (token !== 'ratecon-browser-owner')
          throw new UnauthorizedException();
        return Promise.resolve({ sub: id(200) });
      },
    })
    .overrideProvider(DocumentStorage)
    .useValue({
      put: (key: string, bytes: Buffer) => {
        if (files.has(key)) throw new Error('Immutable evidence');
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
  const app = module.createNestApplication();
  app.useLogger(false);
  app.setGlobalPrefix('api/v1');
  app.enableCors({ origin: 'http://127.0.0.1:3100' });
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
    }),
  );
  await app.listen(3102, '127.0.0.1');
}
void main().catch((error: unknown) => {
  console.error(
    'RateCon browser fixture failed to start:',
    error instanceof Error ? error.message : 'Unknown error',
  );
  process.exitCode = 1;
});
