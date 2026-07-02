import { Body, Controller, Post } from '@nestjs/common';

import { SessionService } from './session.service';
import { RefreshTokenDto } from '../dto/refresh-token.dto';

@Controller('auth/session')
export class SessionController {
  constructor(
    private readonly sessionService: SessionService,
  ) {}

  @Post('refresh')
  async refresh(
    @Body() dto: RefreshTokenDto,
  ) {
    return this.sessionService.verifyRefreshToken(
      dto.sessionId,
      dto.refreshToken,
    );
  }
}