// Real Nest auth/access/company services with local provider and memory persistence.
// This is sequential browser acceptance, NOT PostgreSQL/locking qualification.
import 'reflect-metadata';
import { Test } from '@nestjs/testing';
import { ValidationPipe } from '@nestjs/common';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/database/prisma.service';
import { browserDatabase } from './support/browser-database';
import { DocumentStorage } from '../src/documents/document-storage';

async function main() {
  if (
    process.env.LOADPACKET_AUTH_TEST !== '1' ||
    process.env.NODE_ENV !== 'test' ||
    process.env.SUPABASE_URL !== 'http://127.0.0.1:3104'
  )
    throw new Error(
      'Screen fixture requires explicit local test configuration.',
    );
  const fixture = browserDatabase();
  const db = fixture.db;
  const files = new Map<string, Buffer>();
  const module = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(PrismaService)
    .useValue(db)
    .overrideProvider(DocumentStorage)
    .useValue({
      put: (key: string, bytes: Buffer) => {
        if (files.has(key)) throw new Error('Immutable fixture');
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
  await app.listen(3105, '127.0.0.1');
}
void main().catch(() => {
  console.error('Local screen fixture failed to start.');
  process.exitCode = 1;
});
