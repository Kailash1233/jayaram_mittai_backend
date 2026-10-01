import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { AppModule, ObserveInstrument } from './app.module.js';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
  instrument: ObserveInstrument,
});

  // Enable CORS. Set CORS_ORIGIN to a comma-separated list or single origin.
  const originEnv = process.env.CORS_ORIGIN ?? '*';
  const origins =
    originEnv === '*' ? true : originEnv.split(',').map((s) => s.trim());

  app.enableCors({
    origin: origins,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    credentials: true,
  });

  // Global input validation via class-validator.
  // Only applies to class-based DTOs (admin auth / admin products);
  // interface-typed bodies (orders, OTP) pass through unchanged.
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true, // strip unknown properties
      forbidNonWhitelisted: true, // reject requests with unknown properties
      transform: true, // auto-transform payloads to DTO class instances
      transformOptions: {
        enableImplicitConversion: true,
      },
    }),
  );

  await app.listen(process.env.PORT ?? 3000);
}

await bootstrap();
