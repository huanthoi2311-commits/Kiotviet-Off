import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsEmail,
  IsEnum,
  IsOptional,
  IsString,
  Length,
  Matches,
  MinLength,
  ValidateNested,
} from 'class-validator';
import type { OrganizationPlan } from '../../domain/entities/organization.entity';

const ORGANIZATION_PLANS: OrganizationPlan[] = [
  'FREE',
  'TRIAL',
  'BASIC',
  'PRO',
  'ENTERPRISE',
];

export class CreateOrganizationOrgDto {
  @ApiProperty({ minLength: 3, maxLength: 150 })
  @IsString()
  @Length(3, 150)
  displayName: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  legalName?: string;

  @ApiProperty({ example: 'ducan', description: 'Không đổi được sau khi tạo' })
  @Matches(/^[a-z0-9-]+$/, {
    message: 'slug chỉ gồm chữ thường, số và dấu gạch ngang',
  })
  slug: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  taxCode?: string;
}

export class CreateOrganizationOwnerDto {
  @ApiProperty()
  @IsString()
  @Length(1, 150)
  fullName: string;

  @ApiProperty()
  @IsEmail()
  email: string;

  @ApiProperty({ minLength: 8 })
  @IsString()
  @MinLength(8)
  password: string;
}

/** T053.02 — tùy chọn, chỉ chọn Plan thương mại lúc tạo. KHÔNG có field giới hạn tài nguyên
 * (`max*`) — số giới hạn luôn do `SUBSCRIPTION_PLAN_LIMITS` (nguồn sự thật duy nhất) quyết định
 * theo Plan đã chọn, không cho phép Platform Admin tự nhập số tùy ý ở bước tạo tổ chức này
 * (đó là phạm vi T053.07 — platform-admin subscription management). */
export class CreateOrganizationSubscriptionDto {
  @ApiProperty({
    enum: ORGANIZATION_PLANS,
    required: false,
    default: 'FREE',
    description: 'Bỏ trống → FREE (giữ nguyên hành vi mặc định hiện có).',
  })
  @IsOptional()
  @IsEnum(ORGANIZATION_PLANS)
  plan?: OrganizationPlan;
}

/** Chỉ Platform Admin (User.isPlatformAdmin = true) mới được gọi (SPEC-ORG-001 Decision 4). */
export class CreateOrganizationDto {
  @ApiProperty({ type: CreateOrganizationOrgDto })
  @ValidateNested()
  @Type(() => CreateOrganizationOrgDto)
  organization: CreateOrganizationOrgDto;

  @ApiProperty({ type: CreateOrganizationOwnerDto })
  @ValidateNested()
  @Type(() => CreateOrganizationOwnerDto)
  owner: CreateOrganizationOwnerDto;

  @ApiProperty({ type: CreateOrganizationSubscriptionDto, required: false })
  @IsOptional()
  @ValidateNested()
  @Type(() => CreateOrganizationSubscriptionDto)
  subscription?: CreateOrganizationSubscriptionDto;
}
