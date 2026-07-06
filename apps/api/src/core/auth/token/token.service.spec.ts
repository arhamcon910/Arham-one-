import { Test, TestingModule } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';

import { TokenService } from './token.service';

describe('TokenService', () => {
  let service: TokenService;
  let jwtService: {
    signAsync: jest.Mock;
    verifyAsync: jest.Mock;
    decode: jest.Mock;
  };

  const payload = {
    sub: 'user-1',
    email: 'user@example.com',
    organizationId: 'org-1',
  };

  beforeEach(async () => {
    jwtService = {
      signAsync: jest.fn(),
      verifyAsync: jest.fn(),
      decode: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TokenService,
        {
          provide: JwtService,
          useValue: jwtService,
        },
      ],
    }).compile();

    service = module.get(TokenService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('generateAccessToken', () => {
    it('signs the payload with a 1 day expiry', async () => {
      jwtService.signAsync.mockResolvedValue('access-token');

      const result = await service.generateAccessToken(payload);

      expect(jwtService.signAsync).toHaveBeenCalledWith(payload, {
        expiresIn: '1d',
      });
      expect(result).toBe('access-token');
    });
  });

  describe('generateRefreshToken', () => {
    it('signs the payload with a 30 day expiry', async () => {
      jwtService.signAsync.mockResolvedValue('refresh-token');

      const result = await service.generateRefreshToken(payload);

      expect(jwtService.signAsync).toHaveBeenCalledWith(payload, {
        expiresIn: '30d',
      });
      expect(result).toBe('refresh-token');
    });
  });

  describe('generateTokenPair', () => {
    it('returns both an access and a refresh token for the same payload', async () => {
      jwtService.signAsync
        .mockResolvedValueOnce('access-token')
        .mockResolvedValueOnce('refresh-token');

      const result = await service.generateTokenPair(payload);

      expect(result).toEqual({
        accessToken: 'access-token',
        refreshToken: 'refresh-token',
      });
      expect(jwtService.signAsync).toHaveBeenCalledTimes(2);
    });
  });

  describe('verifyToken', () => {
    it('delegates to jwtService.verifyAsync and returns the decoded payload', async () => {
      jwtService.verifyAsync.mockResolvedValue(payload);

      const result = await service.verifyToken('some-token');

      expect(jwtService.verifyAsync).toHaveBeenCalledWith('some-token');
      expect(result).toEqual(payload);
    });

    it('propagates verification errors (expired/invalid/tampered tokens)', async () => {
      jwtService.verifyAsync.mockRejectedValue(new Error('jwt expired'));

      await expect(service.verifyToken('bad-token')).rejects.toThrow(
        'jwt expired',
      );
    });
  });

  describe('decodeToken', () => {
    it('delegates to jwtService.decode', () => {
      jwtService.decode.mockReturnValue(payload);

      const result = service.decodeToken('some-token');

      expect(jwtService.decode).toHaveBeenCalledWith('some-token');
      expect(result).toEqual(payload);
    });
  });
});
