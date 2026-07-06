import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, NotFoundException, UnauthorizedException } from '@nestjs/common';
import * as argon2 from 'argon2';

import { PrismaService } from '../../../database/prisma/prisma.service';
import { TokenService } from '../token';

import { FakePrismaService } from '../../../../test/support/fake-prisma.service';
import {
  DEFAULT_REVOKED_SESSION_RETENTION_DAYS,
  SessionRevokedReason,
  SessionService,
} from './session.service';

describe('SessionService', () => {
  let service: SessionService;
  let prisma: FakePrismaService;
  let tokenService: {
    verifyToken: jest.Mock;
    generateAccessToken: jest.Mock;
    generateRefreshToken: jest.Mock;
  };

  const userId = 'user-1';

  const daysFromNow = (days: number) => {
    const date = new Date();
    date.setDate(date.getDate() + days);
    return date;
  };

  beforeEach(async () => {
    prisma = new FakePrismaService();
    tokenService = {
      verifyToken: jest.fn(),
      generateAccessToken: jest.fn().mockResolvedValue('new-access-token'),
      generateRefreshToken: jest.fn().mockResolvedValue('new-refresh-token'),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SessionService,
        { provide: PrismaService, useValue: prisma },
        { provide: TokenService, useValue: tokenService },
      ],
    }).compile();

    service = module.get(SessionService);
  });

  async function seedSession(overrides: Record<string, any> = {}) {
    const refreshToken = overrides.refreshToken ?? 'plain-refresh-token';
    const refreshTokenHash = await argon2.hash(refreshToken);

    const session = await prisma.session.create({
      data: {
        userId,
        refreshTokenHash,
        expiresAt: daysFromNow(30),
        ...overrides,
      },
    });

    return { session, refreshToken };
  }

  describe('createSession', () => {
    it('hashes the refresh token and persists the session', async () => {
      const expiresAt = daysFromNow(30);

      const session = await service.createSession({
        userId,
        refreshToken: 'plain-token',
        expiresAt,
      });

      expect(session.userId).toBe(userId);
      expect(session.refreshTokenHash).not.toBe('plain-token');
      expect(await argon2.verify(session.refreshTokenHash, 'plain-token')).toBe(
        true,
      );
      expect(session.expiresAt).toBe(expiresAt);
    });
  });

  describe('verifyRefreshToken', () => {
    it('returns null when the session does not exist', async () => {
      const result = await service.verifyRefreshToken('missing', 'token');
      expect(result).toBeNull();
    });

    it('returns null when the session is revoked', async () => {
      const { session, refreshToken } = await seedSession({ revoked: true });
      const result = await service.verifyRefreshToken(session.id, refreshToken);
      expect(result).toBeNull();
    });

    it('returns null when the session has expired', async () => {
      const { session, refreshToken } = await seedSession({
        expiresAt: daysFromNow(-1),
      });
      const result = await service.verifyRefreshToken(session.id, refreshToken);
      expect(result).toBeNull();
    });

    it('returns null when the refresh token does not match the stored hash', async () => {
      const { session } = await seedSession();
      const result = await service.verifyRefreshToken(session.id, 'wrong-token');
      expect(result).toBeNull();
    });

    it('returns the session when everything checks out', async () => {
      const { session, refreshToken } = await seedSession();
      const result = await service.verifyRefreshToken(session.id, refreshToken);
      expect(result?.id).toBe(session.id);
    });
  });

  describe('rotateRefreshToken', () => {
    it('throws when the session/token pair is not valid', async () => {
      await expect(
        service.rotateRefreshToken('missing', 'token'),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('throws when the refresh token JWT itself fails verification', async () => {
      const { session, refreshToken } = await seedSession();
      tokenService.verifyToken.mockRejectedValue(new Error('bad signature'));

      await expect(
        service.rotateRefreshToken(session.id, refreshToken),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('throws when the JWT subject does not match the session owner', async () => {
      const { session, refreshToken } = await seedSession();
      tokenService.verifyToken.mockResolvedValue({
        sub: 'someone-else',
        email: 'x@example.com',
        organizationId: 'org-1',
      });

      await expect(
        service.rotateRefreshToken(session.id, refreshToken),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('rotates the token, increments rotationCounter and updates activity metadata', async () => {
      const { session, refreshToken } = await seedSession();
      tokenService.verifyToken.mockResolvedValue({
        sub: userId,
        email: 'user@example.com',
        organizationId: 'org-1',
      });

      const result = await service.rotateRefreshToken(session.id, refreshToken, {
        ipAddress: '10.0.0.1',
        userAgent: 'jest',
      });

      expect(result.accessToken).toBe('new-access-token');
      expect(result.refreshToken).toBe('new-refresh-token');
      expect(result.session.rotationCounter).toBe(1);
      expect(result.session.lastIpAddress).toBe('10.0.0.1');
      expect(result.session.lastUserAgent).toBe('jest');
      expect(result.session.revoked).toBe(false);

      // The old refresh token must be dead immediately.
      const stillValid = await service.verifyRefreshToken(
        session.id,
        refreshToken,
      );
      expect(stillValid).toBeNull();
    });

    it('revokes the session and rejects when the stored hash no longer matches (reuse detection)', async () => {
      const { session, refreshToken } = await seedSession();

      // Simulate a second, concurrent request winning the race: it rotates
      // the session (changing the stored hash) while *this* request is
      // still in the middle of verifying its JWT, i.e. after this
      // request's `verifyRefreshToken` already captured the old hash but
      // before its own compare-and-swap update runs.
      tokenService.verifyToken.mockImplementation(async () => {
        await prisma.session.update({
          where: { id: session.id },
          data: { refreshTokenHash: await argon2.hash('someone-got-there-first') },
        });

        return {
          sub: userId,
          email: 'user@example.com',
          organizationId: 'org-1',
        };
      });

      await expect(
        service.rotateRefreshToken(session.id, refreshToken),
      ).rejects.toThrow(UnauthorizedException);

      const updated = await prisma.session.findUnique({ where: { id: session.id } });
      expect(updated.revoked).toBe(true);
      expect(updated.revokedReason).toBe(
        SessionRevokedReason.REFRESH_TOKEN_REUSE_DETECTED,
      );
    });
  });

  describe('logoutSession', () => {
    it('throws NotFoundException when the session does not exist', async () => {
      await expect(
        service.logoutSession('missing', userId),
      ).rejects.toThrow(NotFoundException);
    });

    it('throws NotFoundException when the session belongs to another user', async () => {
      const { session } = await seedSession();

      await expect(
        service.logoutSession(session.id, 'someone-else'),
      ).rejects.toThrow(NotFoundException);
    });

    it('is idempotent when the session is already revoked', async () => {
      const { session } = await seedSession({
        revoked: true,
        revokedReason: 'SOMETHING_ELSE',
      });

      const result = await service.logoutSession(session.id, userId);

      expect(result.revokedReason).toBe('SOMETHING_ELSE');
    });

    it('revokes the session with reason USER_LOGOUT', async () => {
      const { session } = await seedSession();

      const result = await service.logoutSession(session.id, userId);

      expect(result.revoked).toBe(true);
      expect(result.revokedReason).toBe(SessionRevokedReason.USER_LOGOUT);
      expect(result.revokedAt).toBeInstanceOf(Date);
    });

    it('does not touch other sessions belonging to the same user', async () => {
      const { session: sessionA } = await seedSession({ refreshToken: 'a' });
      const { session: sessionB } = await seedSession({ refreshToken: 'b' });

      await service.logoutSession(sessionA.id, userId);

      const untouched = await prisma.session.findUnique({
        where: { id: sessionB.id },
      });
      expect(untouched.revoked).toBe(false);
    });
  });

  describe('revokeUserSession', () => {
    it('throws NotFoundException when the session does not exist or belongs to another user', async () => {
      const { session } = await seedSession();

      await expect(
        service.revokeUserSession('missing', userId),
      ).rejects.toThrow(NotFoundException);
      await expect(
        service.revokeUserSession(session.id, 'someone-else'),
      ).rejects.toThrow(NotFoundException);
    });

    it('rejects revoking the current session', async () => {
      const { session } = await seedSession();

      await expect(
        service.revokeUserSession(session.id, userId, session.id),
      ).rejects.toThrow(BadRequestException);
    });

    it('allows revoking a session that is not the current one', async () => {
      const { session: current } = await seedSession({ refreshToken: 'a' });
      const { session: other } = await seedSession({ refreshToken: 'b' });

      const result = await service.revokeUserSession(
        other.id,
        userId,
        current.id,
      );

      expect(result.revoked).toBe(true);
      expect(result.revokedReason).toBe(
        SessionRevokedReason.USER_REVOKED_SESSION,
      );

      const untouchedCurrent = await prisma.session.findUnique({
        where: { id: current.id },
      });
      expect(untouchedCurrent.revoked).toBe(false);
    });

    it('is idempotent when the target session is already revoked', async () => {
      const { session } = await seedSession({ revoked: true });

      const result = await service.revokeUserSession(session.id, userId);

      expect(result.revoked).toBe(true);
    });
  });

  describe('logoutAllSessions / revokeAllSessions', () => {
    it('revokes every active session for the user and leaves already-revoked ones alone', async () => {
      const { session: active1 } = await seedSession({ refreshToken: 'a' });
      const { session: active2 } = await seedSession({ refreshToken: 'b' });
      const { session: alreadyRevoked } = await seedSession({
        refreshToken: 'c',
        revoked: true,
        revokedReason: 'PREVIOUS_REASON',
      });

      const count = await service.logoutAllSessions(userId);

      expect(count).toBe(2);

      for (const id of [active1.id, active2.id]) {
        const row = await prisma.session.findUnique({ where: { id } });
        expect(row.revoked).toBe(true);
        expect(row.revokedReason).toBe(SessionRevokedReason.USER_LOGOUT_ALL);
      }

      const untouched = await prisma.session.findUnique({
        where: { id: alreadyRevoked.id },
      });
      expect(untouched.revokedReason).toBe('PREVIOUS_REASON');
    });

    it('does not revoke another user\'s sessions', async () => {
      const { session } = await seedSession({ userId: 'someone-else' });

      const count = await service.logoutAllSessions(userId);

      expect(count).toBe(0);
      const untouched = await prisma.session.findUnique({
        where: { id: session.id },
      });
      expect(untouched.revoked).toBe(false);
    });
  });

  describe('cleanupSessions', () => {
    it('deletes expired sessions regardless of revoked status', async () => {
      const { session: expiredActive } = await seedSession({
        refreshToken: 'a',
        expiresAt: daysFromNow(-1),
      });
      const { session: expiredRevoked } = await seedSession({
        refreshToken: 'b',
        expiresAt: daysFromNow(-1),
        revoked: true,
      });
      const { session: stillActive } = await seedSession({ refreshToken: 'c' });

      const result = await service.cleanupSessions();

      expect(result.expiredSessionsRemoved).toBe(2);
      expect(await prisma.session.findUnique({ where: { id: expiredActive.id } })).toBeNull();
      expect(await prisma.session.findUnique({ where: { id: expiredRevoked.id } })).toBeNull();
      expect(await prisma.session.findUnique({ where: { id: stillActive.id } })).not.toBeNull();
    });

    it('deletes revoked sessions older than the retention window but leaves recent ones', async () => {
      const { session: oldRevoked } = await seedSession({
        refreshToken: 'a',
        revoked: true,
        revokedAt: daysFromNow(-40),
      });
      const { session: recentRevoked } = await seedSession({
        refreshToken: 'b',
        revoked: true,
        revokedAt: daysFromNow(-5),
      });

      const result = await service.cleanupSessions(
        DEFAULT_REVOKED_SESSION_RETENTION_DAYS,
      );

      expect(result.revokedSessionsRemoved).toBe(1);
      expect(await prisma.session.findUnique({ where: { id: oldRevoked.id } })).toBeNull();
      expect(
        await prisma.session.findUnique({ where: { id: recentRevoked.id } }),
      ).not.toBeNull();
    });

    it('never touches active sessions', async () => {
      const { session: active } = await seedSession();

      const result = await service.cleanupSessions();

      expect(result.expiredSessionsRemoved).toBe(0);
      expect(result.revokedSessionsRemoved).toBe(0);
      expect(await prisma.session.findUnique({ where: { id: active.id } })).not.toBeNull();
    });

    it('honors a custom retention period', async () => {
      const { session: revoked10DaysAgo } = await seedSession({
        revoked: true,
        revokedAt: daysFromNow(-10),
      });

      const result = await service.cleanupSessions(5);

      expect(result.revokedSessionsRemoved).toBe(1);
      expect(
        await prisma.session.findUnique({ where: { id: revoked10DaysAgo.id } }),
      ).toBeNull();
    });
  });
});
