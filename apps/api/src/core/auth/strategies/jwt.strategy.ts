import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';

import { PrismaService } from '../../../database/prisma/prisma.service';
import type { JwtPayload } from '../interfaces/jwt-payload.interface';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    private readonly prisma: PrismaService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      // Must match the secret TokenModule configures for @nestjs/jwt -
      // otherwise every access token issued by TokenService would fail
      // verification here whenever JWT_SECRET is unset.
      secretOrKey: process.env.JWT_SECRET || 'arham-secret-key',
    });
  }

  async validate(payload: JwtPayload) {
    const user = await this.prisma.user.findUnique({
      where: {
        id: payload.sub,
      },
    });

    if (!user || !user.isActive) {
      throw new UnauthorizedException();
    }

    const { passwordHash, ...safeUser } = user;

    return {
      ...safeUser,
      organizationId: payload.organizationId,
    };
  }
}