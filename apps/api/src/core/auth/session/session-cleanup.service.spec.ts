import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';

import {
  DEFAULT_REVOKED_SESSION_RETENTION_DAYS,
  SessionService,
} from './session.service';
import { SessionCleanupService } from './session-cleanup.service';

describe('SessionCleanupService', () => {
  let service: SessionCleanupService;
  let sessionService: { cleanupSessions: jest.Mock };
  let configService: { get: jest.Mock };

  beforeEach(async () => {
    sessionService = {
      cleanupSessions: jest.fn().mockResolvedValue({
        expiredSessionsRemoved: 3,
        revokedSessionsRemoved: 2,
      }),
    };
    configService = {
      get: jest.fn().mockReturnValue(undefined),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SessionCleanupService,
        { provide: SessionService, useValue: sessionService },
        { provide: ConfigService, useValue: configService },
      ],
    }).compile();

    service = module.get(SessionCleanupService);
  });

  it('runs cleanup with the default retention period when nothing is configured', async () => {
    await service.handleSessionCleanup();

    expect(sessionService.cleanupSessions).toHaveBeenCalledWith(
      DEFAULT_REVOKED_SESSION_RETENTION_DAYS,
    );
  });

  it('uses the configured retention period when it is a valid positive number', async () => {
    configService.get.mockReturnValue('45');

    await service.handleSessionCleanup();

    expect(sessionService.cleanupSessions).toHaveBeenCalledWith(45);
  });

  it('falls back to the default when the configured value is not a positive number', async () => {
    configService.get.mockReturnValue('not-a-number');
    await service.handleSessionCleanup();
    expect(sessionService.cleanupSessions).toHaveBeenCalledWith(
      DEFAULT_REVOKED_SESSION_RETENTION_DAYS,
    );

    configService.get.mockReturnValue('-5');
    await service.handleSessionCleanup();
    expect(sessionService.cleanupSessions).toHaveBeenLastCalledWith(
      DEFAULT_REVOKED_SESSION_RETENTION_DAYS,
    );

    configService.get.mockReturnValue('0');
    await service.handleSessionCleanup();
    expect(sessionService.cleanupSessions).toHaveBeenLastCalledWith(
      DEFAULT_REVOKED_SESSION_RETENTION_DAYS,
    );
  });

  it('reads the retention period from SESSION_REVOKED_RETENTION_DAYS', async () => {
    await service.handleSessionCleanup();

    expect(configService.get).toHaveBeenCalledWith(
      'SESSION_REVOKED_RETENTION_DAYS',
    );
  });

  it('does not throw when cleanup succeeds, regardless of the counts returned', async () => {
    await expect(service.handleSessionCleanup()).resolves.toBeUndefined();
  });
});
