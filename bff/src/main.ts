import { Logger, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';

import { AppModule } from './app.module';

(async () => {
  const app = await NestFactory.create(AppModule, {
    logger: process.env.DEBUG
      ? ['error', 'warn', 'log', 'debug', 'verbose']
      : ['error', 'warn', 'log'],
  });

  app.enableCors({ credentials: true, origin: true });
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  app.setGlobalPrefix('api');

  const port = parseInt(process.env.PORT, 10) || 3000;

  await app.listen(port);
  Logger.log(`Server started on port: ${port}`, 'App');
})();
