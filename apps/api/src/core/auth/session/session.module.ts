import { Module } from '@nestjs/common';

import { PrismaModule } from '../../../database/prisma/prisma.module';

import { TokenModule } from '../token';

import { SessionController } from './session.controller';
import { SessionService } from './session.service';

@Module({
  imports: [PrismaModule, TokenModule],
  controllers: [SessionController],
  providers: [SessionService],
  exports: [SessionService],
})
export class SessionModule {}
