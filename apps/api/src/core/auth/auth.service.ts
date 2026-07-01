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

@Injectable()
export class AuthService {
  constructor(
    private readonly usersService: UsersService,
    private readonly organizationService: OrganizationService,
    private readonly tokenService: TokenService,
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

    const accessToken = await this.tokenService.generateAccessToken({
      sub: user.id,
      email: user.email,
      organizationId: organization.id,
    });

    return {
      success: true,
      message: 'Organization registered successfully',
      data: {
        organization,
        user,
        accessToken,
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

    const accessToken = await this.tokenService.generateAccessToken({
      sub: user.id,
      email: user.email,
      organizationId: user.organizationId,
    });

    return {
      success: true,
      message: 'Login successful',
      data: {
        organization,
        user,
        accessToken,
      },
    };
  }
}