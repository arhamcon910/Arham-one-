import {
  Body,
  Controller,
  Get,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';

import { AuthService } from './auth.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';

import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { CurrentUser } from './decorators/current-user.decorator';

@ApiTags('Authentication')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
  ) {}

  @Post('register')
  @ApiOperation({
    summary: 'Register a new organization and administrator',
  })
  @ApiResponse({
    status: 201,
    description: 'Organization registered successfully',
  })
  @ApiResponse({
    status: 409,
    description: 'Organization code or email is already registered',
  })
  async register(
    @Body() dto: RegisterDto,
  ) {
    return this.authService.register(dto);
  }

  @Post('login')
  @ApiOperation({
    summary: 'Login user',
  })
  @ApiResponse({
    status: 200,
    description: 'Login successful',
  })
  @ApiResponse({
    status: 401,
    description: 'Invalid email or password',
  })
  async login(
    @Body() dto: LoginDto,
  ) {
    return this.authService.login(dto);
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Get current logged in user',
  })
  @ApiResponse({
    status: 200,
    description: 'Current user fetched successfully',
  })
  async me(
    @CurrentUser() user: any,
  ) {
    return {
      success: true,
      message: 'Current user fetched successfully',
      data: user,
    };
  }
}
