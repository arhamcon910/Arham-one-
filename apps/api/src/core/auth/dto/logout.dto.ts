import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';

export class LogoutDto {
  @ApiProperty({
    description: 'The id of the session to log out',
  })
  @IsString()
  @IsNotEmpty()
  sessionId: string;
}
