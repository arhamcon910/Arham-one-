import { ApiProperty } from '@nestjs/swagger';
import {
  IsEmail,
  IsNotEmpty,
  IsString,
  Matches,
  MinLength,
} from 'class-validator';

export class RegisterDto {
  @ApiProperty({
    example: 'ARHAM Technologies Pvt Ltd',
  })
  @IsString()
  @IsNotEmpty()
  organizationName: string;

  @ApiProperty({
    example: 'ARHAM',
  })
  @IsString()
  @Matches(/^[A-Z0-9_-]+$/)
  organizationCode: string;

  @ApiProperty({
    example: 'Ketan',
  })
  @IsString()
  @IsNotEmpty()
  firstName: string;

  @ApiProperty({
    example: 'Shah',
  })
  @IsString()
  @IsNotEmpty()
  lastName: string;

  @ApiProperty({
    example: 'admin@arham.one',
  })
  @IsEmail()
  email: string;

  @ApiProperty({
  example: 'StrongPassword123!',
  minLength: 8,
})
@IsString()
@MinLength(8)
password: string;
}