import { Module } from '@nestjs/common';

import { PrismaModule } from '../../../database/prisma/prisma.module';

import { TokenModule } from '../token';

import { SessionController } from './session.controller';
import { SessionService } from './session.service';
import { SessionCleanupService } from './session-cleanup.service';

@Module({
  imports: [PrismaModule, TokenModule],
  controllers: [SessionController],
  providers: [SessionService, SessionCleanupService],
  exports: [SessionService],
})
export class SessionModule {}