import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';

import { AppModule } from './app.module';
import { PrismaExceptionFilter } from './common/filters/prisma-exception.filter';
import { corsOrigins } from './common/cors-config';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  app.setGlobalPrefix('api/v1');

  app.enableCors({
    origin: corsOrigins(),
    allowedHeaders: ['Authorization', 'Content-Type', 'X-Broker-Token'],
    credentials: true,
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
    }),
  );

  app.useGlobalFilters(new PrismaExceptionFilter());
  app.use(
    (
      _request: unknown,
      response: { setHeader(name: string, value: string): void },
      next: () => void,
    ) => {
      response.setHeader('Cache-Control', 'private, no-store');
      next();
    },
  );

  const port = Number(process.env.PORT) || 3001;

  await app.listen(port);

  console.log(`LoadPacket API running on http://localhost:${port}/api/v1`);
}

void bootstrap();
