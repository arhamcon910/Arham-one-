import { Injectable } from '@nestjs/common';
import * as argon2 from 'argon2';

import { PrismaService } from '../../../database/prisma/prisma.service';

@Injectable()
export class SessionService {
  constructor(
    private readonly prisma: PrismaService,
  ) {}

  async createSession(data: {
    userId: string;
    refreshToken: string;
    deviceName?: string;
    ipAddress?: string;
    userAgent?: string;
    expiresAt: Date;
  }) {
    const refreshTokenHash = await argon2.hash(data.refreshToken);

    return this.prisma.session.create({
      data: {
        userId: data.userId,
        refreshTokenHash,
        deviceName: data.deviceName,
        ipAddress: data.ipAddress,
        userAgent: data.userAgent,
        expiresAt: data.expiresAt,
      },
    });
  }

  async findById(id: string) {
    return this.prisma.session.findUnique({
      where: {
        id,
      },
    });
  }

  async findActiveSessions(userId: string) {
    return this.prisma.session.findMany({
      where: {
        userId,
        revoked: false,
      },
      orderBy: {
        lastActivity: 'desc',
      },
    });
  }

  async updateLastActivity(sessionId: string) {
    return this.prisma.session.update({
      where: {
        id: sessionId,
      },
      data: {
        lastActivity: new Date(),
      },
    });
  }

  async rotateRefreshToken(
    sessionId: string,
    refreshToken: string,
  ) {
    const refreshTokenHash = await argon2.hash(refreshToken);

    return this.prisma.session.update({
      where: {
        id: sessionId,
      },
      data: {
        refreshTokenHash,
        lastActivity: new Date(),
      },
    });
  }

  async revokeSession(id: string) {
    return this.prisma.session.update({
      where: {
        id,
      },
      data: {
        revoked: true,
      },
    });
  }

  async revokeAllSessions(userId: string) {
    return this.prisma.session.updateMany({
      where: {
        userId,
        revoked: false,
      },
      data: {
        revoked: true,
      },
    });
  }

  async verifyRefreshToken(
    sessionId: string,
    refreshToken: string,
  ) {
    const session = await this.prisma.session.findUnique({
      where: {
        id: sessionId,
      },
    });

    if (!session) {
      return null;
    }

    if (session.revoked) {
      return null;
    }

    if (session.expiresAt < new Date()) {
      return null;
    }

    const valid = await argon2.verify(
      session.refreshTokenHash,
      refreshToken,
    );

    if (!valid) {
      return null;
    }

    return session;
  }
}