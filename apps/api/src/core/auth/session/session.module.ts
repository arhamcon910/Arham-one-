import { Module } from '@nestjs/common';

import { PrismaModule } from '../../../database/prisma/prisma.module';
import { SessionService } from './session.service';

@Module({
  imports: [PrismaModule],
  providers: [SessionService],
  exports: [SessionService],
})
export class SessionModule {}