import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';

export class RevokeSessionDto {
  @ApiProperty({
    description: 'The id of the (non-current) session to revoke',
  })
  @IsString()
  @IsNotEmpty()
  sessionId: string;
}
