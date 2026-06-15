import 'dotenv/config';
import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import express from 'express';
import { createServer } from 'node:net';
import { AppModule } from './app.module';

const bootstrapLogger = new Logger('Bootstrap');

async function findAvailablePort(preferredPort: number) {
  const fallbackEnabled = process.env.PORT_FALLBACK !== 'false';
  const maxAttempts = fallbackEnabled ? 10 : 1;

  for (let offset = 0; offset < maxAttempts; offset += 1) {
    const candidatePort = preferredPort + offset;
    const available = await new Promise<boolean>((resolve) => {
      const server = createServer();

      server.once('error', () => {
        resolve(false);
      });

      server.once('listening', () => {
        server.close(() => resolve(true));
      });

      server.listen(candidatePort, '0.0.0.0');
    });

    if (available) {
      return candidatePort;
    }
  }

  throw new Error(
    `No available port found starting from ${preferredPort}. Set PORT to a free port or stop the process using it.`,
  );
}

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.setGlobalPrefix('api/aiverseworld-backend');
  app.use('/api/aiverseworld-backend/english-tutor/realtime-call', express.text({ type: '*/*' }));
  app.enableCors({
    origin: process.env.CORS_ORIGIN?.split(',').map((value) => value.trim()) ?? [
      'http://localhost:3000',
    ],
    credentials: true,
  });

  const preferredPort = Number(process.env.PORT ?? 3001);
  const port = await findAvailablePort(preferredPort);

  if (port !== preferredPort) {
    bootstrapLogger.warn(
      `Port ${preferredPort} is busy. Starting backend on fallback port ${port}. Set PORT to override or free the original port.`,
    );
  }

  await app.listen(port);
  bootstrapLogger.log(`Backend listening on port ${port}`);
}
bootstrap();
