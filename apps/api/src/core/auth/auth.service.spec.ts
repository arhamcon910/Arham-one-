import { Test, TestingModule } from '@nestjs/testing';
import { ConflictException, UnauthorizedException } from '@nestjs/common';
import * as argon2 from 'argon2';

import { AuthService } from './auth.service';
import { UsersService } from '../users/users.service';
import { OrganizationService } from '../organization/organization.service';
import { TokenService } from './token';
import { SessionService } from './session';

describe('AuthService', () => {
  let service: AuthService;
  let usersService: Record<keyof UsersService, jest.Mock>;
  let organizationService: Record<keyof OrganizationService, jest.Mock>;
  let tokenService: Record<'generateTokenPair', jest.Mock>;
  let sessionService: Record<'createSession', jest.Mock>;

  const registerDto = {
    organizationName: 'ARHAM Technologies',
    organizationCode: 'ARHAM',
    firstName: 'Ketan',
    lastName: 'Shah',
    email: 'admin@arham.one',
    password: 'StrongPassword123!',
  };

  const loginDto = {
    email: 'admin@arham.one',
    password: 'StrongPassword123!',
  };

  beforeEach(async () => {
    usersService = {
      findByEmail: jest.fn(),
      findByEmailWithPassword: jest.fn(),
      findById: jest.fn(),
      create: jest.fn(),
    } as any;

    organizationService = {
      findByCode: jest.fn(),
      findById: jest.fn(),
      create: jest.fn(),
    } as any;

    tokenService = {
      generateTokenPair: jest.fn().mockResolvedValue({
        accessToken: 'access-token',
        refreshToken: 'refresh-token',
      }),
    };

    sessionService = {
      createSession: jest.fn().mockResolvedValue({ id: 'session-1' }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: UsersService, useValue: usersService },
        { provide: OrganizationService, useValue: organizationService },
        { provide: TokenService, useValue: tokenService },
        { provide: SessionService, useValue: sessionService },
      ],
    }).compile();

    service = module.get(AuthService);
  });

  describe('register', () => {
    it('throws ConflictException when the organization code is already taken', async () => {
      organizationService.findByCode.mockResolvedValue({ id: 'org-1' });

      await expect(service.register(registerDto)).rejects.toThrow(
        ConflictException,
      );
      expect(usersService.create).not.toHaveBeenCalled();
    });

    it('throws ConflictException when the email is already registered', async () => {
      organizationService.findByCode.mockResolvedValue(null);
      usersService.findByEmail.mockResolvedValue({ id: 'user-1' });

      await expect(service.register(registerDto)).rejects.toThrow(
        ConflictException,
      );
      expect(organizationService.create).not.toHaveBeenCalled();
    });

    it('registers the organization and admin user, and never leaks the password hash', async () => {
      organizationService.findByCode.mockResolvedValue(null);
      usersService.findByEmail.mockResolvedValue(null);
      organizationService.create.mockResolvedValue({
        id: 'org-1',
        name: registerDto.organizationName,
        code: registerDto.organizationCode,
      });
      usersService.create.mockResolvedValue({
        id: 'user-1',
        organizationId: 'org-1',
        firstName: registerDto.firstName,
        lastName: registerDto.lastName,
        email: registerDto.email,
        passwordHash: 'super-secret-hash',
      });

      const result = await service.register(registerDto);

      expect(usersService.create).toHaveBeenCalledWith(
        expect.objectContaining({
          organizationId: 'org-1',
          firstName: registerDto.firstName,
          lastName: registerDto.lastName,
          email: registerDto.email,
        }),
      );
      expect(sessionService.createSession).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 'user-1',
          refreshToken: 'refresh-token',
        }),
      );

      expect(result.success).toBe(true);
      expect(result.data.accessToken).toBe('access-token');
      expect(result.data.refreshToken).toBe('refresh-token');
      expect(result.data.sessionId).toBe('session-1');
      expect(result.data.user).not.toHaveProperty('passwordHash');
      expect(result.data.user.email).toBe(registerDto.email);
    });
  });

  describe('login', () => {
    it('throws UnauthorizedException when no user matches the email', async () => {
      usersService.findByEmailWithPassword.mockResolvedValue(null);

      await expect(service.login(loginDto)).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('throws UnauthorizedException when the password does not match', async () => {
      usersService.findByEmailWithPassword.mockResolvedValue({
        id: 'user-1',
        email: loginDto.email,
        organizationId: 'org-1',
        passwordHash: await argon2.hash('a-completely-different-password'),
      });

      await expect(service.login(loginDto)).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('logs the user in and never leaks the password hash', async () => {
      usersService.findByEmailWithPassword.mockResolvedValue({
        id: 'user-1',
        email: loginDto.email,
        organizationId: 'org-1',
        passwordHash: await argon2.hash(loginDto.password),
      });
      organizationService.findById.mockResolvedValue({
        id: 'org-1',
        name: 'ARHAM Technologies',
      });

      const result = await service.login(loginDto);

      expect(tokenService.generateTokenPair).toHaveBeenCalledWith({
        sub: 'user-1',
        email: loginDto.email,
        organizationId: 'org-1',
      });
      expect(sessionService.createSession).toHaveBeenCalledWith(
        expect.objectContaining({ userId: 'user-1', refreshToken: 'refresh-token' }),
      );

      expect(result.success).toBe(true);
      expect(result.data.accessToken).toBe('access-token');
      expect(result.data.refreshToken).toBe('refresh-token');
      expect(result.data.sessionId).toBe('session-1');
      expect(result.data.user).not.toHaveProperty('passwordHash');
      expect(result.data.organization).toEqual({
        id: 'org-1',
        name: 'ARHAM Technologies',
      });
    });
  });
});
