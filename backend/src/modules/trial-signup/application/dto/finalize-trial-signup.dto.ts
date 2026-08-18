import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsOptional,
  IsString,
  Length,
  Matches,
  MinLength,
  ValidateNested,
} from 'class-validator';

/**
 * T053.04 D7/D14 — DTO CÔNG KHAI, KHÔNG được kế thừa/tái dùng `CreateOrganizationDto` (Platform
 * Admin) — cấu trúc riêng, KHÔNG có trường `subscription`/`plan` ở bất kỳ đâu (đóng cửa ở tầng
 * type, không chỉ validate runtime). `slug` CÓ bound độ dài ở đây (Hybrid D6) — DTO Platform Admin
 * hiện có (`CreateOrganizationOrgDto`) KHÔNG bị đổi, đây là 1 class hoàn toàn mới, tách biệt.
 */
export class FinalizeTrialSignupOrganizationDto {
  @ApiProperty({ minLength: 3, maxLength: 150 })
  @IsString()
  @Length(3, 150)
  displayName: string;

  @ApiProperty({
    required: false,
    minLength: 3,
    maxLength: 60,
    description:
      'Bỏ trống → server tự sinh từ displayName (slugify). Có thể tự chọn/sửa — vẫn phải qua kiểm tra trùng lặp như Organization thường (Hybrid D6).',
  })
  @IsOptional()
  @IsString()
  @Length(3, 60)
  @Matches(/^[a-z0-9-]+$/, {
    message: 'slug chỉ gồm chữ thường, số và dấu gạch ngang',
  })
  slug?: string;
}

/** KHÔNG có trường `email` — email LUÔN lấy từ signup proof token đã xác thực (D14 — "Never
 * re-accept an authoritative owner email independent of the proof"). */
export class FinalizeTrialSignupOwnerDto {
  @ApiProperty()
  @IsString()
  @Length(1, 150)
  fullName: string;

  @ApiProperty({ minLength: 8 })
  @IsString()
  @MinLength(8)
  password: string;
}

export class FinalizeTrialSignupDto {
  @ApiProperty({
    description:
      'Nhận từ POST /trial-signup/verify-otp — hiệu lực 10 phút, dùng đúng 1 lần.',
  })
  @IsString()
  signupProofToken: string;

  @ApiProperty({ type: FinalizeTrialSignupOrganizationDto })
  @ValidateNested()
  @Type(() => FinalizeTrialSignupOrganizationDto)
  organization: FinalizeTrialSignupOrganizationDto;

  @ApiProperty({ type: FinalizeTrialSignupOwnerDto })
  @ValidateNested()
  @Type(() => FinalizeTrialSignupOwnerDto)
  owner: FinalizeTrialSignupOwnerDto;
}
