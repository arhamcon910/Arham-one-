import { Test, TestingModule } from '@nestjs/testing';

import { SessionController } from './session.controller';
import { SessionService } from './session.service';

describe('SessionController', () => {
  let controller: SessionController;
  let sessionService: {
    listSessions: jest.Mock;
    rotateRefreshToken: jest.Mock;
    logoutSession: jest.Mock;
    logoutAllSessions: jest.Mock;
    revokeUserSession: jest.Mock;
  };

  const fakeRequest = (overrides: Record<string, any> = {}) => ({
    ip: '127.0.0.1',
    get: jest.fn().mockReturnValue('jest-agent'),
    ...overrides,
  });

  beforeEach(async () => {
    sessionService = {
      listSessions: jest.fn(),
      rotateRefreshToken: jest.fn(),
      logoutSession: jest.fn(),
      logoutAllSessions: jest.fn(),
      revokeUserSession: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [SessionController],
      providers: [{ provide: SessionService, useValue: sessionService }],
    }).compile();

    controller = module.get(SessionController);
  });

  describe('list', () => {
    it('lists the sessions for the current user and marks the matching one as current', async () => {
      sessionService.listSessions.mockResolvedValue([
        {
          id: 'session-1',
          createdAt: new Date('2026-01-01'),
          expiresAt: new Date('2026-02-01'),
          lastActivity: new Date('2026-01-15'),
          lastIpAddress: '10.0.0.1',
          lastUserAgent: 'chrome',
          revoked: false,
          revokedAt: null,
          revokedReason: null,
        },
        {
          id: 'session-2',
          createdAt: new Date('2026-01-02'),
          expiresAt: new Date('2026-02-02'),
          lastActivity: new Date('2026-01-10'),
          lastIpAddress: '10.0.0.2',
          lastUserAgent: 'firefox',
          revoked: true,
          revokedAt: new Date('2026-01-11'),
          revokedReason: 'USER_LOGOUT',
        },
      ]);

      const result = await controller.list({ id: 'user-1' }, 'session-2');

      expect(sessionService.listSessions).toHaveBeenCalledWith('user-1');
      expect(result).toEqual({
        success: true,
        message: 'Sessions fetched successfully',
        data: {
          sessions: [
            expect.objectContaining({ sessionId: 'session-1', current: false }),
            expect.objectContaining({ sessionId: 'session-2', current: true }),
          ],
        },
      });
    });

    it('marks every session as not-current when no sessionId query param is supplied', async () => {
      sessionService.listSessions.mockResolvedValue([
        {
          id: 'session-1',
          createdAt: new Date(),
          expiresAt: new Date(),
          lastActivity: new Date(),
          lastIpAddress: null,
          lastUserAgent: null,
          revoked: false,
          revokedAt: null,
          revokedReason: null,
        },
      ]);

      const result = await controller.list({ id: 'user-1' }, undefined);

      expect(result.data.sessions[0].current).toBe(false);
    });
  });

  describe('refresh', () => {
    it('rotates the refresh token using the caller IP/user-agent and returns the new pair', async () => {
      sessionService.rotateRefreshToken.mockResolvedValue({
        session: { id: 'session-1' },
        accessToken: 'access',
        refreshToken: 'refresh',
      });

      const result = await controller.refresh(
        { sessionId: 'session-1', refreshToken: 'old-refresh' },
        fakeRequest() as any,
      );

      expect(sessionService.rotateRefreshToken).toHaveBeenCalledWith(
        'session-1',
        'old-refresh',
        { ipAddress: '127.0.0.1', userAgent: 'jest-agent' },
      );
      expect(result).toEqual({
        success: true,
        message: 'Token refreshed successfully',
        data: {
          sessionId: 'session-1',
          accessToken: 'access',
          refreshToken: 'refresh',
        },
      });
    });

    it('falls back to undefined user-agent when the header is absent', async () => {
      sessionService.rotateRefreshToken.mockResolvedValue({
        session: { id: 'session-1' },
        accessToken: 'access',
        refreshToken: 'refresh',
      });

      await controller.refresh(
        { sessionId: 'session-1', refreshToken: 'old-refresh' },
        fakeRequest({ get: jest.fn().mockReturnValue(undefined) }) as any,
      );

      expect(sessionService.rotateRefreshToken).toHaveBeenCalledWith(
        'session-1',
        'old-refresh',
        { ipAddress: '127.0.0.1', userAgent: undefined },
      );
    });
  });

  describe('logout', () => {
    it('logs out the given session for the current user', async () => {
      sessionService.logoutSession.mockResolvedValue({ id: 'session-1' });

      const result = await controller.logout(
        { id: 'user-1' },
        { sessionId: 'session-1' },
      );

      expect(sessionService.logoutSession).toHaveBeenCalledWith(
        'session-1',
        'user-1',
      );
      expect(result).toEqual({
        success: true,
        message: 'Logged out successfully',
        data: { sessionId: 'session-1' },
      });
    });
  });

  describe('logoutAll', () => {
    it('logs out every session for the current user and reports how many were revoked', async () => {
      sessionService.logoutAllSessions.mockResolvedValue(4);

      const result = await controller.logoutAll({ id: 'user-1' });

      expect(sessionService.logoutAllSessions).toHaveBeenCalledWith('user-1');
      expect(result).toEqual({
        success: true,
        message: 'Logged out from all sessions successfully.',
        data: { revokedSessions: 4 },
      });
    });
  });

  describe('revoke', () => {
    it('revokes the target session, forwarding the current session id from the query', async () => {
      sessionService.revokeUserSession.mockResolvedValue({ id: 'session-2' });

      const result = await controller.revoke(
        { id: 'user-1' },
        { sessionId: 'session-2' },
        'session-1',
      );

      expect(sessionService.revokeUserSession).toHaveBeenCalledWith(
        'session-2',
        'user-1',
        'session-1',
      );
      expect(result).toEqual({
        success: true,
        message: 'Session revoked successfully.',
        data: { sessionId: 'session-2' },
      });
    });
  });
});
