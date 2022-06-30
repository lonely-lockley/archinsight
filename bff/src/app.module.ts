import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

import appConfig from './config/app.config';
import workersConfig from './config/workers.config';
import { RenderModule } from './render/render.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      ignoreEnvFile: true,
      isGlobal: true,
      load: [appConfig, workersConfig],
    }),
    RenderModule,
  ],
})
export class AppModule {}
