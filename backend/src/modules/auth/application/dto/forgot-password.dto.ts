import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsString, Matches } from 'class-validator';

export class ForgotPasswordDto {
  @ApiProperty({ example: 'kiotviet-off' })
  @IsString()
  @Matches(/^[a-z0-9-]+$/, {
    message: 'organizationSlug chỉ gồm chữ thường, số và dấu gạch ngang',
  })
  organizationSlug: string;

  @ApiProperty({ example: 'owner@kiotviet-off.vn' })
  @IsEmail({}, { message: 'Email không hợp lệ' })
  email: string;
}
