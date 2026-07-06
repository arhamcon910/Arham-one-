import { Module } from '@nestjs/common';
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

    // Only PassportModule is needed here: JwtStrategy configures its own
    // secret directly via passport-jwt and never injects `JwtService`.
    // Signing tokens is TokenModule's responsibility - it registers its
    // own JwtModule for that. A second, unused JwtModule registration
    // used to live here; it was dead weight (nothing in AuthModule
    // injected JwtService) and its independently-hardcoded secret had
    // drifted out of sync with JwtStrategy's, which was a latent bug.
    PassportModule.register({
      defaultStrategy: 'jwt',
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
    TokenModule,
    SessionModule,
  ],
})
export class AuthModule {}