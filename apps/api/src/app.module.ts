import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';

import { AppController } from './app.controller';
import { AppService } from './app.service';

import { AuthModule } from './core/auth/auth.module';
import { PrismaModule } from './database/prisma/prisma.module';
import { UsersModule } from './core/users/users.module';
import { RolesModule } from './core/roles/roles.module';
import { OrganizationModule } from './core/organization/organization.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
    }),

    // Registered once, globally, so any module can schedule cron jobs
    // (e.g. SessionCleanupService in AuthModule) with @Cron() without
    // each feature module having to import ScheduleModule itself.
    ScheduleModule.forRoot(),

    PrismaModule,
    AuthModule,
    UsersModule,
    RolesModule,
    OrganizationModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}