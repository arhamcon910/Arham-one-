import { IsNotEmpty, IsString } from 'class-validator';

export class RevokeSessionDto {
  @IsString()
  @IsNotEmpty()
  sessionId: string;
}