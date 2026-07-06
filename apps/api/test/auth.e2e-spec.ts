import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import * as request from 'supertest';

import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/database/prisma/prisma.service';

import { FakePrismaService } from './support/fake-prisma.service';

/**
 * End-to-end coverage for the full authentication module (AUTH-10),
 * exercised over real HTTP through the actual Nest application graph
 * (`AppModule`), with only `PrismaService` swapped out for an in-memory
 * fake so the suite doesn't need a live Postgres instance.
 *
 * Flow covered, in order, matching AUTH-10 requirement 3:
 *   register -> login -> refresh (rotation) -> list sessions ->
 *   revoke a specific (non-current) session -> logout current session ->
 *   logout all sessions.
 */
describe('Authentication (e2e)', () => {
  let app: INestApplication;

  const registerPayload = {
    organizationName: 'ARHAM Technologies Pvt Ltd',
    organizationCode: 'ARHAM-E2E',
    firstName: 'Ketan',
    lastName: 'Shah',
    email: 'e2e-user@arham.one',
    password: 'StrongPassword123!',
  };

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(PrismaService)
      .useValue(new FakePrismaService())
      .compile();

    app = moduleFixture.createNestApplication();

    // Mirror main.ts so the e2e suite exercises the same validation
    // behaviour and route prefix as production.
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        transform: true,
        forbidNonWhitelisted: true,
      }),
    );
    app.setGlobalPrefix('api');

    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('rejects registration payloads that fail DTO validation', async () => {
    await request(app.getHttpServer())
      .post('/api/auth/register')
      .send({ ...registerPayload, email: 'not-an-email' })
      .expect(400);
  });

  it('walks the full register -> login -> refresh -> list -> revoke -> logout -> logout-all flow', async () => {
    // 1. Register.
    const registerResponse = await request(app.getHttpServer())
      .post('/api/auth/register')
      .send(registerPayload)
      .expect(201);

    expect(registerResponse.body.success).toBe(true);
    expect(registerResponse.body.data.user).not.toHaveProperty('passwordHash');
    expect(registerResponse.body.data.accessToken).toBeDefined();
    const registerSessionId = registerResponse.body.data.sessionId;

    // 2. Login (a second, independent session for the same user).
    const loginResponse = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email: registerPayload.email, password: registerPayload.password })
      .expect(200);

    expect(loginResponse.body.success).toBe(true);
    expect(loginResponse.body.data.user).not.toHaveProperty('passwordHash');

    const accessToken = loginResponse.body.data.accessToken;
    let refreshToken = loginResponse.body.data.refreshToken;
    const loginSessionId = loginResponse.body.data.sessionId;

    expect(loginSessionId).not.toBe(registerSessionId);

    // Authenticated access with the freshly-issued access token works.
    const meResponse = await request(app.getHttpServer())
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    expect(meResponse.body.data.email).toBe(registerPayload.email);
    expect(meResponse.body.data).not.toHaveProperty('passwordHash');

    // 3. Refresh token rotation for the login session.
    const refreshResponse = await request(app.getHttpServer())
      .post('/api/auth/session/refresh')
      .send({ sessionId: loginSessionId, refreshToken })
      .expect(200);

    expect(refreshResponse.body.data.sessionId).toBe(loginSessionId);
    const rotatedRefreshToken = refreshResponse.body.data.refreshToken;
    expect(rotatedRefreshToken).not.toBe(refreshToken);

    // The old refresh token must be dead immediately (AUTH-05.2).
    await request(app.getHttpServer())
      .post('/api/auth/session/refresh')
      .send({ sessionId: loginSessionId, refreshToken })
      .expect(401);

    refreshToken = rotatedRefreshToken;

    // 4. List sessions - both the register and login sessions should be
    // visible, and the login session should be flagged as current.
    const listResponse = await request(app.getHttpServer())
      .get(`/api/auth/session?sessionId=${loginSessionId}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    const sessions = listResponse.body.data.sessions;
    expect(sessions).toHaveLength(2);

    const listedLoginSession = sessions.find(
      (s: any) => s.sessionId === loginSessionId,
    );
    const listedRegisterSession = sessions.find(
      (s: any) => s.sessionId === registerSessionId,
    );
    expect(listedLoginSession.current).toBe(true);
    expect(listedRegisterSession.current).toBe(false);
    expect(listedLoginSession).not.toHaveProperty('refreshTokenHash');

    // 5. Revoke the *other* (register) session while logged in as the
    // login session - this must succeed and must not be rejected as
    // "the current session".
    await request(app.getHttpServer())
      .post('/api/auth/session/revoke')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ sessionId: registerSessionId })
      .expect(200);

    // Trying to revoke your *own* current session through this endpoint
    // is rejected - logout is the correct endpoint for that.
    await request(app.getHttpServer())
      .post(`/api/auth/session/revoke?currentSessionId=${loginSessionId}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ sessionId: loginSessionId })
      .expect(400);

    // 6. Logout the current (login) session.
    await request(app.getHttpServer())
      .post('/api/auth/session/logout')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ sessionId: loginSessionId })
      .expect(200);

    // Its refresh token is now dead too.
    await request(app.getHttpServer())
      .post('/api/auth/session/refresh')
      .send({ sessionId: loginSessionId, refreshToken })
      .expect(401);

    // 7. Logout-all is still callable (idempotent - nothing active is
    // left for this user) and reports zero additional revocations.
    const logoutAllResponse = await request(app.getHttpServer())
      .post('/api/auth/session/logout-all')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    expect(logoutAllResponse.body.data.revokedSessions).toBe(0);
  });

  it('rejects unauthenticated access to guarded session endpoints', async () => {
    await request(app.getHttpServer()).get('/api/auth/session').expect(401);

    await request(app.getHttpServer())
      .post('/api/auth/session/logout-all')
      .expect(401);
  });
});
