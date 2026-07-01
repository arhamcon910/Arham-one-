import {
  Injectable,
  ConflictException,
  UnauthorizedException,
} from '@nestjs/common';
import * as argon2 from 'argon2';

import { UsersService } from '../users/users.service';
import { OrganizationService } from '../organization/organization.service';

import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';

import { TokenService } from './token';
import { SessionService } from './session';

@Injectable()
export class AuthService {
  constructor(
    private readonly usersService: UsersService,
    private readonly organizationService: OrganizationService,
    private readonly tokenService: TokenService,
    private readonly sessionService: SessionService,
  ) {}

  async register(dto: RegisterDto) {
    const existingOrg = await this.organizationService.findByCode(
      dto.organizationCode,
    );

    if (existingOrg) {
      throw new ConflictException('Organization code already exists');
    }

    const existingUser = await this.usersService.findByEmail(dto.email);

    if (existingUser) {
      throw new ConflictException('Email already registered');
    }

    const organization = await this.organizationService.create({
      name: dto.organizationName,
      code: dto.organizationCode,
      email: dto.email,
    });

    const passwordHash = await argon2.hash(dto.password);

    const user = await this.usersService.create({
      organizationId: organization.id,
      firstName: dto.firstName,
      lastName: dto.lastName,
      email: dto.email,
      passwordHash,
    });

    const tokens = await this.tokenService.generateTokenPair({
      sub: user.id,
      email: user.email,
      organizationId: organization.id,
    });

    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 30);

    const session = await this.sessionService.createSession({
      userId: user.id,
      refreshToken: tokens.refreshToken,
      expiresAt,
    });

    return {
      success: true,
      message: 'Organization registered successfully',
      data: {
        organization,
        user,
        sessionId: session.id,
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken,
      },
    };
  }

  async login(dto: LoginDto) {
    const user = await this.usersService.findByEmailWithPassword(dto.email);

    if (!user) {
      throw new UnauthorizedException('Invalid email or password');
    }

    const passwordValid = await argon2.verify(
      user.passwordHash,
      dto.password,
    );

    if (!passwordValid) {
      throw new UnauthorizedException('Invalid email or password');
    }

    const organization = await this.organizationService.findById(
      user.organizationId,
    );

    const tokens = await this.tokenService.generateTokenPair({
      sub: user.id,
      email: user.email,
      organizationId: user.organizationId,
    });

    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 30);

    const session = await this.sessionService.createSession({
      userId: user.id,
      refreshToken: tokens.refreshToken,
      expiresAt,
    });

    return {
      success: true,
      message: 'Login successful',
      data: {
        organization,
        user,
        sessionId: session.id,
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken,
      },
    };
  }
}
