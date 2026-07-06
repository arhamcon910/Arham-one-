import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron, CronExpression } from '@nestjs/schedule';

import { DEFAULT_REVOKED_SESSION_RETENTION_DAYS, SessionService } from './session.service';

/**
 * Environment variable that overrides how long a revoked session is kept
 * around before the daily cleanup job deletes it (AUTH-09, requirement 5).
 * Falls back to `DEFAULT_REVOKED_SESSION_RETENTION_DAYS` when unset or
 * invalid, so the job never has to guess at a hardcoded value.
 */
const REVOKED_SESSION_RETENTION_DAYS_ENV_KEY =
  'SESSION_REVOKED_RETENTION_DAYS';

@Injectable()
export class SessionCleanupService {
  private readonly logger = new Logger(SessionCleanupService.name);

  constructor(
    private readonly sessionService: SessionService,
    private readonly configService: ConfigService,
  ) {}

  /**
   * Runs once a day at 02:00 server time (AUTH-09).
   *
   * Delegates the actual deletion rules to `SessionService.cleanupSessions`
   * - this class is only responsible for scheduling and logging the
   * outcome, not for deciding which rows qualify for deletion.
   */
  @Cron(CronExpression.EVERY_DAY_AT_2AM, {
    name: 'session-cleanup',
  })
  async handleSessionCleanup(): Promise<void> {
    const executedAt = new Date();
    const revokedRetentionDays = this.getRevokedRetentionDays();

    const { expiredSessionsRemoved, revokedSessionsRemoved } =
      await this.sessionService.cleanupSessions(revokedRetentionDays);

    this.logger.log(
      `Session cleanup executed at ${executedAt.toISOString()} - ` +
        `expired sessions removed: ${expiredSessionsRemoved}, ` +
        `revoked sessions removed (older than ${revokedRetentionDays}d): ${revokedSessionsRemoved}`,
    );
  }

  /**
   * Resolves the configurable retention period for revoked sessions
   * (AUTH-09, requirement 5). Any missing or non-positive value silently
   * falls back to the default rather than failing the whole job.
   */
  private getRevokedRetentionDays(): number {
    const configured = this.configService.get<string>(
      REVOKED_SESSION_RETENTION_DAYS_ENV_KEY,
    );

    const parsed = configured === undefined ? NaN : Number(configured);

    return Number.isFinite(parsed) && parsed > 0
      ? parsed
      : DEFAULT_REVOKED_SESSION_RETENTION_DAYS;
  }
}