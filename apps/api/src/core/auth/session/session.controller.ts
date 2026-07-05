import { Body, Controller, HttpCode, HttpStatus, Post, Req } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';

import { SessionService } from './session.service';
import { RefreshTokenDto } from '../dto/refresh-token.dto';

@ApiTags('Authentication')
@Controller('auth/session')
export class SessionController {
  constructor(
    private readonly sessionService: SessionService,
  ) {}

  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Rotate a refresh token and issue a new access/refresh token pair',
  })
  @ApiResponse({
    status: 200,
    description: 'Token refreshed successfully',
  })
  @ApiResponse({
    status: 401,
    description:
      'The refresh token is invalid, expired, revoked, does not match the session, or has already been used',
  })
  async refresh(
    @Body() dto: RefreshTokenDto,
    @Req() request: Request,
  ) {
    const result = await this.sessionService.rotateRefreshToken(
      dto.sessionId,
      dto.refreshToken,
      {
        ipAddress: request.ip,
        userAgent: request.get('user-agent') ?? undefined,
      },
    );

    return {
      success: true,
      message: 'Token refreshed successfully',
      data: {
        sessionId: result.session.id,
        accessToken: result.accessToken,
        refreshToken: result.refreshToken,
      },
    };
  }
}
