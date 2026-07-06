import { Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';

import type { JwtPayload } from '../interfaces/jwt-payload.interface';

// Re-exported so existing consumers that import `JwtPayload` from this
// module (or from the `token` barrel) keep working - `../interfaces` is
// the canonical definition, this file no longer declares its own copy.
export type { JwtPayload };

@Injectable()
export class TokenService {
  constructor(
    private readonly jwtService: JwtService,
  ) {}

  async generateAccessToken(
    payload: JwtPayload,
  ): Promise<string> {
    return this.jwtService.signAsync(payload, {
      expiresIn: '1d',
    });
  }

  async generateRefreshToken(
    payload: JwtPayload,
  ): Promise<string> {
    return this.jwtService.signAsync(payload, {
      expiresIn: '30d',
    });
  }

  async generateTokenPair(
    payload: JwtPayload,
  ) {
    return {
      accessToken: await this.generateAccessToken(payload),
      refreshToken: await this.generateRefreshToken(payload),
    };
  }

  async verifyToken(
    token: string,
  ): Promise<JwtPayload> {
    return this.jwtService.verifyAsync<JwtPayload>(token);
  }

  decodeToken(token: string) {
    return this.jwtService.decode(token);
  }
}