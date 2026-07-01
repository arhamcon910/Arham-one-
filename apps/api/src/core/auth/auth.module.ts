import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';

import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { JwtStrategy } from './strategies/jwt.strategy';

import { TokenModule } from './token';

import { UsersModule } from '../users/users.module';
import { OrganizationModule } from '../organization/organization.module';

@Module({
  imports: [
    UsersModule,
    OrganizationModule,

    PassportModule.register({
      defaultStrategy: 'jwt',
    }),

    JwtModule.register({
      secret: process.env.JWT_SECRET || 'arham-secret-key',
      signOptions: {
        expiresIn: '1d',
      },
    }),

    TokenModule,
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
  ],
})
export class AuthModule {}