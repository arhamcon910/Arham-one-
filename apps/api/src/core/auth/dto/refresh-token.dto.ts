import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';

export class RefreshTokenDto {
  @ApiProperty({
    description: 'The id of the session the refresh token belongs to',
  })
  @IsString()
  @IsNotEmpty()
  sessionId: string;

  @ApiProperty({
    description: 'The current, unexpired refresh token issued for that session',
  })
  @IsString()
  @IsNotEmpty()
  refreshToken: string;
}
