import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import * as argon2 from 'argon2';
import type { Session } from '@prisma/client';

import { PrismaService } from '../../../database/prisma/prisma.service';

import { TokenService } from '../token';

export interface CreateSessionParams {
  userId: string;
  refreshToken: string;
  deviceName?: string;
  ipAddress?: string;
  userAgent?: string;
  expiresAt: Date;
}

export interface RotateRefreshTokenMeta {
  ipAddress?: string;
  userAgent?: string;
}

export interface RotatedSessionResult {
  session: Session;
  accessToken: string;
  refreshToken: string;
}

export interface SessionCleanupResult {
  expiredSessionsRemoved: number;
  revokedSessionsRemoved: number;
}

/** Fallback used when no retention period is configured (AUTH-09). */
export const DEFAULT_REVOKED_SESSION_RETENTION_DAYS = 30;

/**
 * Machine-readable reasons stored on `Session.revokedReason` whenever a
 * session is revoked. Kept as a plain string union (rather than a Prisma
 * enum) so new reasons can be introduced without a schema migration.
 */
export const SessionRevokedReason = {
  USER_LOGOUT: 'USER_LOGOUT',
  USER_LOGOUT_ALL: 'USER_LOGOUT_ALL',
  USER_REVOKED_SESSION: 'USER_REVOKED_SESSION',
  REFRESH_TOKEN_REUSE_DETECTED: 'REFRESH_TOKEN_REUSE_DETECTED',
} as const;

@Injectable()
export class SessionService {
  private readonly logger = new Logger(SessionService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly tokenService: TokenService,
  ) {}

  async createSession(data: CreateSessionParams): Promise<Session> {
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

  async findById(id: string): Promise<Session | null> {
    return this.prisma.session.findUnique({
      where: {
        id,
      },
    });
  }

  async findActiveSessions(userId: string): Promise<Session[]> {
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

  /**
   * Lists every non-expired session belonging to a user, active or
   * revoked, for the session management UI (AUTH-07).
   *
   * Unlike `findActiveSessions`, revoked sessions are intentionally kept
   * in the result set so a user can see that a device was logged out -
   * only sessions whose `expiresAt` has passed are dropped. Callers are
   * responsible for shaping the response (e.g. omitting
   * `refreshTokenHash` and flagging the caller's own session as
   * `current`) since that is presentation, not data-access, concern.
   */
  async listSessions(userId: string): Promise<Session[]> {
    return this.prisma.session.findMany({
      where: {
        userId,
        expiresAt: {
          gt: new Date(),
        },
      },
      orderBy: {
        lastActivity: 'desc',
      },
    });
  }

  async updateLastActivity(sessionId: string): Promise<Session> {
    return this.prisma.session.update({
      where: {
        id: sessionId,
      },
      data: {
        lastActivity: new Date(),
      },
    });
  }

  /**
   * Validates a refresh token against a session without mutating any
   * state. A session is only considered valid when it:
   *   - exists
   *   - is active (not revoked)
   *   - has not expired
   *   - matches the stored refresh token hash
   *
   * Returns the session on success, `null` otherwise. Kept side-effect
   * free so it can be reused independently of the rotation flow.
   */
  async verifyRefreshToken(
    sessionId: string,
    refreshToken: string,
  ): Promise<Session | null> {
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

  /**
   * Enterprise refresh token rotation (AUTH-05.2).
   *
   * Every time a refresh token is redeemed:
   *   1. The session + token pair is fully re-validated (exists, active,
   *      not expired, hash match) via `verifyRefreshToken`.
   *   2. A brand-new refresh token is minted.
   *   3. The new refresh token is hashed and persisted.
   *   4. `rotationCounter` is incremented.
   *   5. `lastActivity`, `lastIpAddress` and `lastUserAgent` are refreshed.
   *   6. The previous refresh token is invalidated immediately: the stored
   *      hash is swapped with an atomic compare-and-swap, so a second,
   *      concurrent, or replayed attempt to redeem the same (now stale)
   *      token can never match and is treated as a reuse attempt.
   *
   * Throws `UnauthorizedException` for any validation failure. The
   * message is intentionally generic so callers cannot enumerate why a
   * refresh attempt failed.
   */
  async rotateRefreshToken(
    sessionId: string,
    refreshToken: string,
    meta: RotateRefreshTokenMeta = {},
  ): Promise<RotatedSessionResult> {
    const session = await this.verifyRefreshToken(sessionId, refreshToken);

    if (!session) {
      throw new UnauthorizedException('Invalid or expired refresh token');
    }

    let payload: {
      sub: string;
      email: string;
      organizationId: string;
    };

    try {
      payload = await this.tokenService.verifyToken(refreshToken);
    } catch {
      throw new UnauthorizedException('Invalid or expired refresh token');
    }

    if (payload.sub !== session.userId) {
      throw new UnauthorizedException('Invalid or expired refresh token');
    }

    const tokenPayload = {
      sub: payload.sub,
      email: payload.email,
      organizationId: payload.organizationId,
    };

    const [accessToken, newRefreshToken] = await Promise.all([
      this.tokenService.generateAccessToken(tokenPayload),
      this.tokenService.generateRefreshToken(tokenPayload),
    ]);

    const newRefreshTokenHash = await argon2.hash(newRefreshToken);

    // Atomic compare-and-swap on the previously-verified hash. This is the
    // mechanism that makes the old refresh token invalid immediately and
    // guards against two requests racing to rotate the same session.
    const { count } = await this.prisma.session.updateMany({
      where: {
        id: sessionId,
        refreshTokenHash: session.refreshTokenHash,
        revoked: false,
      },
      data: {
        refreshTokenHash: newRefreshTokenHash,
        rotationCounter: {
          increment: 1,
        },
        lastActivity: new Date(),
        lastIpAddress: meta.ipAddress,
        lastUserAgent: meta.userAgent,
      },
    });

    if (count === 0) {
      // Someone else rotated this session between our read and our write,
      // or this token has already been rotated and is being replayed.
      // Lock the session down rather than silently failing.
      this.logger.warn(
        `Refresh token reuse detected for session ${sessionId}`,
      );

      await this.revokeSession(
        sessionId,
        SessionRevokedReason.REFRESH_TOKEN_REUSE_DETECTED,
      );

      throw new UnauthorizedException('Invalid or expired refresh token');
    }

    const updatedSession = await this.prisma.session.findUniqueOrThrow({
      where: {
        id: sessionId,
      },
    });

    return {
      session: updatedSession,
      accessToken,
      refreshToken: newRefreshToken,
    };
  }

  /**
   * Logs out a single session belonging to the currently authenticated
   * user (AUTH-06.1).
   *
   *   1. Only the session identified by `sessionId` is touched - every
   *      other session for the user (or anyone else) is left untouched.
   *   2. `revoked` is set to `true` and `revokedReason` is stamped with
   *      `USER_LOGOUT`.
   *   3. Because `revoked` gates both `verifyRefreshToken` and
   *      `rotateRefreshToken`, the session's refresh token is rejected on
   *      its very next use - it is invalidated immediately.
   *   4. `revokedAt` records the logout timestamp.
   *
   * Ownership is enforced here: a session that does not exist, or that
   * belongs to a different user, is reported as "not found" rather than
   * "forbidden" so callers cannot use this endpoint to enumerate other
   * users' session ids.
   */
  async logoutSession(
    sessionId: string,
    userId: string,
  ): Promise<Session> {
    const session = await this.prisma.session.findUnique({
      where: {
        id: sessionId,
      },
    });

    if (!session || session.userId !== userId) {
      throw new NotFoundException('Session not found');
    }

    if (session.revoked) {
      // Already logged out elsewhere - idempotent no-op that preserves
      // whatever revocation details were already recorded.
      return session;
    }

    return this.revokeSession(sessionId, SessionRevokedReason.USER_LOGOUT);
  }

  async revokeSession(id: string, reason?: string): Promise<Session> {
    return this.prisma.session.update({
      where: {
        id,
      },
      data: {
        revoked: true,
        revokedReason: reason,
        revokedAt: new Date(),
      },
    });
  }

  /**
   * Revokes a single, specific session belonging to the current user
   * without touching any other session (AUTH-08).
   *
   * Ownership is enforced exactly like `logoutSession`: a session that
   * doesn't exist or belongs to someone else is reported as "not found"
   * rather than "forbidden", so this endpoint cannot be used to probe
   * other users' session ids.
   *
   * The caller's own current session is explicitly out of scope for this
   * endpoint - revoking it here is rejected with a `BadRequestException`
   * pointing callers at the dedicated logout endpoint instead.
   */
  async revokeUserSession(
    sessionId: string,
    userId: string,
    currentSessionId?: string,
  ): Promise<Session> {
    const session = await this.prisma.session.findUnique({
      where: {
        id: sessionId,
      },
    });

    if (!session || session.userId !== userId) {
      throw new NotFoundException('Session not found');
    }

    if (currentSessionId && session.id === currentSessionId) {
      throw new BadRequestException(
        'Use logout endpoint for the current session.',
      );
    }

    if (session.revoked) {
      // Already revoked - idempotent no-op that preserves whatever
      // revocation details were already recorded.
      return session;
    }

    return this.revokeSession(
      sessionId,
      SessionRevokedReason.USER_REVOKED_SESSION,
    );
  }

  /**
   * Logs out every active session belonging to a user (AUTH-06.2).
   *
   * Thin, semantically-named wrapper around `revokeAllSessions` so the
   * "logout everywhere" intent (and its dedicated revocation reason) is
   * explicit at the call site, mirroring `logoutSession` above.
   *
   * Returns the number of sessions that were actually revoked. Sessions
   * that were already revoked are left untouched (and not counted) -
   * `revokeAllSessions` only ever matches `revoked: false` rows.
   */
  async logoutAllSessions(userId: string): Promise<number> {
    const { count } = await this.revokeAllSessions(
      userId,
      SessionRevokedReason.USER_LOGOUT_ALL,
    );

    return count;
  }

  async revokeAllSessions(userId: string, reason?: string) {
    return this.prisma.session.updateMany({
      where: {
        userId,
        revoked: false,
      },
      data: {
        revoked: true,
        revokedReason: reason,
        revokedAt: new Date(),
      },
    });
  }

  /**
   * Deletes rows that no longer need to be kept around (AUTH-09), run by
   * the daily `SessionCleanupService` cron job:
   *   - Any session whose `expiresAt` has passed, regardless of `revoked`.
   *   - Any revoked session whose `revokedAt` is older than
   *     `revokedRetentionDays`, even if it hasn't reached its natural
   *     `expiresAt` yet.
   *
   * Active sessions (not expired and not revoked) never match either
   * `where` clause, so they are never touched. The two deletes run
   * sequentially rather than as a single query so the two counts required
   * for the cleanup log can be reported separately; a session that is
   * both expired and long-revoked is only ever removed (and counted)
   * once, by the first query.
   */
  async cleanupSessions(
    revokedRetentionDays: number = DEFAULT_REVOKED_SESSION_RETENTION_DAYS,
  ): Promise<SessionCleanupResult> {
    const now = new Date();

    const { count: expiredSessionsRemoved } =
      await this.prisma.session.deleteMany({
        where: {
          expiresAt: {
            lt: now,
          },
        },
      });

    const revokedCutoff = new Date(now);
    revokedCutoff.setDate(revokedCutoff.getDate() - revokedRetentionDays);

    const { count: revokedSessionsRemoved } =
      await this.prisma.session.deleteMany({
        where: {
          revoked: true,
          revokedAt: {
            lt: revokedCutoff,
          },
        },
      });

    return {
      expiredSessionsRemoved,
      revokedSessionsRemoved,
    };
  }
}