import { Test, TestingModule } from '@nestjs/testing';

import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';

describe('AuthController', () => {
  let controller: AuthController;
  let authService: { register: jest.Mock; login: jest.Mock };

  beforeEach(async () => {
    authService = {
      register: jest.fn(),
      login: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [AuthController],
      providers: [{ provide: AuthService, useValue: authService }],
    }).compile();

    controller = module.get(AuthController);
  });

  describe('register', () => {
    it('delegates to AuthService.register and returns its result as-is', async () => {
      const dto = {
        organizationName: 'ARHAM',
        organizationCode: 'ARHAM',
        firstName: 'Ketan',
        lastName: 'Shah',
        email: 'admin@arham.one',
        password: 'StrongPassword123!',
      } as any;
      const serviceResult = { success: true, message: 'ok', data: {} };
      authService.register.mockResolvedValue(serviceResult);

      const result = await controller.register(dto);

      expect(authService.register).toHaveBeenCalledWith(dto);
      expect(result).toBe(serviceResult);
    });
  });

  describe('login', () => {
    it('delegates to AuthService.login and returns its result as-is', async () => {
      const dto = { email: 'admin@arham.one', password: 'StrongPassword123!' };
      const serviceResult = { success: true, message: 'ok', data: {} };
      authService.login.mockResolvedValue(serviceResult);

      const result = await controller.login(dto);

      expect(authService.login).toHaveBeenCalledWith(dto);
      expect(result).toBe(serviceResult);
    });
  });

  describe('me', () => {
    it('wraps the current user in the standard response envelope', async () => {
      const user = { id: 'user-1', email: 'admin@arham.one' };

      const result = await controller.me(user);

      expect(result).toEqual({
        success: true,
        message: 'Current user fetched successfully',
        data: user,
      });
    });
  });
});
