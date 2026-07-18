import { ApiProperty } from '@nestjs/swagger';
import {
  IsDateString,
  IsEmail,
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Length,
  Min,
} from 'class-validator';

const CUSTOMER_TYPES = [
  'RETAIL',
  'WHOLESALE',
  'VIP',
  'DEALER',
  'COMPANY',
] as const;
const GENDERS = ['MALE', 'FEMALE', 'OTHER'] as const;

/** T011 (Decision CR05/SR08/SR11) — không nhận `status`: luôn `ACTIVE` khi tạo, không cho client set. */
export class CreateCustomerDto {
  @ApiProperty({
    required: false,
    description:
      'Tùy chọn — nếu không gửi, hệ thống tự sinh (CUS000001...). Nếu gửi: phải duy nhất trong Organization.',
  })
  @IsOptional()
  @IsString()
  @Length(1, 50)
  code?: string;

  @ApiProperty({
    required: false,
    enum: CUSTOMER_TYPES,
    default: 'RETAIL',
  })
  @IsOptional()
  @IsEnum(CUSTOMER_TYPES)
  customerType?: (typeof CUSTOMER_TYPES)[number];

  @ApiProperty({ example: 'Nguyễn Văn A', minLength: 2, maxLength: 255 })
  @IsString()
  @Length(2, 255)
  fullName: string;

  @ApiProperty({
    required: false,
    example: '0987654321',
    description: 'Tùy chọn — không còn bắt buộc duy nhất (Decision CR06/SR09).',
  })
  @IsOptional()
  @IsString()
  @Length(8, 20)
  phone?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsEmail()
  email?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsDateString()
  birthday?: string;

  @ApiProperty({ required: false, enum: GENDERS })
  @IsOptional()
  @IsEnum(GENDERS)
  gender?: (typeof GENDERS)[number];

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  taxCode?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  companyName?: string;

  @ApiProperty({ required: false, description: 'Người liên hệ chính.' })
  @IsOptional()
  @IsString()
  contactName?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  address?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  province?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  district?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  ward?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  avatar?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  note?: string;

  @ApiProperty({ required: false, example: 20000000 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  creditLimit?: number;

  @ApiProperty({
    required: false,
    description:
      'Hạn thanh toán (số ngày) — chỉ lưu thông tin, T011 chưa tự tính hạn.',
  })
  @IsOptional()
  @IsInt()
  @Min(0)
  paymentTermDays?: number;
}
