import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsString, Matches, MinLength } from 'class-validator';

export class ResetPasswordDto {
  @ApiProperty({ example: 'kiotviet-off' })
  @IsString()
  @Matches(/^[a-z0-9-]+$/, {
    message: 'organizationSlug chỉ gồm chữ thường, số và dấu gạch ngang',
  })
  organizationSlug: string;

  @ApiProperty({ example: 'owner@kiotviet-off.vn' })
  @IsEmail({}, { message: 'Email không hợp lệ' })
  email: string;

  @ApiProperty({ example: 'NewP@ssw0rd123', minLength: 8 })
  @IsString()
  @MinLength(8, { message: 'Mật khẩu tối thiểu 8 ký tự' })
  newPassword: string;
}
