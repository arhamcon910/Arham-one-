import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';

import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { JwtStrategy } from './strategies/jwt.strategy';

import { UsersModule } from '../users/users.module';
import { OrganizationModule } from '../organization/organization.module';

import { TokenModule } from './token';
import { SessionModule } from './session';

@Module({
  imports: [
    UsersModule,
    OrganizationModule,
    TokenModule,
    SessionModule,

    PassportModule.register({
      defaultStrategy: 'jwt',
    }),

    JwtModule.register({
      secret: process.env.JWT_SECRET || 'arham-secret-key',
      signOptions: {
        expiresIn: '1d',
      },
    }),
  ],

  controllers: [AuthController],

  providers: [
    AuthService,
    JwtStrategy,
  ],

  exports: [
    AuthService,
    PassportModule,
    JwtModule,
    TokenModule,
    SessionModule,
  ],
})
export class AuthModule {}