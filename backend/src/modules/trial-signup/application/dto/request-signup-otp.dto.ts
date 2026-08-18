import { ApiProperty } from '@nestjs/swagger';
import { IsEmail } from 'class-validator';

export class RequestSignupOtpDto {
  @ApiProperty()
  @IsEmail()
  email: string;
}
