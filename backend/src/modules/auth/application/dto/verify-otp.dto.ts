import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsString, Length, Matches } from 'class-validator';

export class VerifyOtpDto {
  @ApiProperty({ example: 'kiotviet-off' })
  @IsString()
  @Matches(/^[a-z0-9-]+$/, {
    message: 'organizationSlug chỉ gồm chữ thường, số và dấu gạch ngang',
  })
  organizationSlug: string;

  @ApiProperty({ example: 'owner@kiotviet-off.vn' })
  @IsEmail({}, { message: 'Email không hợp lệ' })
  email: string;

  @ApiProperty({ example: '482913' })
  @IsString()
  @Length(6, 6, { message: 'OTP gồm 6 chữ số' })
  otp: string;
}
