import { ApiProperty } from '@nestjs/swagger';
import {
  IsEmail,
  IsOptional,
  IsString,
  Matches,
  MinLength,
} from 'class-validator';

export class LoginDto {
  @ApiProperty({
    example: 'kiotviet-off',
    description:
      'Slug tổ chức (subdomain) — bắt buộc vì email chỉ unique trong phạm vi 1 tổ chức, không unique toàn hệ thống',
  })
  @IsString()
  @Matches(/^[a-z0-9-]+$/, {
    message: 'organizationSlug chỉ gồm chữ thường, số và dấu gạch ngang',
  })
  organizationSlug: string;

  @ApiProperty({ example: 'owner@kiotviet-off.vn' })
  @IsEmail({}, { message: 'Email không hợp lệ' })
  email: string;

  @ApiProperty({ example: 'P@ssw0rd123', minLength: 8 })
  @IsString()
  @MinLength(8, { message: 'Mật khẩu tối thiểu 8 ký tự' })
  password: string;

  @ApiProperty({
    required: false,
    example: "Nam's iPhone 15",
    description:
      'Tên thiết bị hiển thị trong danh sách phiên đăng nhập (chủ yếu Mobile App gửi lên).',
  })
  @IsOptional()
  @IsString()
  deviceName?: string;
}
