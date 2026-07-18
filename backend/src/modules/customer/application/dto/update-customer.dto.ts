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

/**
 * Không có `code` — bất biến sau khi tạo (BR03), không có nhánh sửa code ở T011 (Decision SR11).
 * Không có `status` — chuyển hẳn sang route Activate/Deactivate/Archive/Restore riêng.
 */
export class UpdateCustomerDto {
  @ApiProperty({
    description: 'Version hiện tại — Optimistic Lock, bắt buộc (BR09)',
  })
  @IsInt()
  version: number;

  @ApiProperty({ required: false, enum: CUSTOMER_TYPES })
  @IsOptional()
  @IsEnum(CUSTOMER_TYPES)
  customerType?: (typeof CUSTOMER_TYPES)[number];

  @ApiProperty({ required: false, minLength: 2, maxLength: 255 })
  @IsOptional()
  @IsString()
  @Length(2, 255)
  fullName?: string;

  @ApiProperty({ required: false })
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

  @ApiProperty({ required: false })
  @IsOptional()
  @IsNumber()
  @Min(0)
  creditLimit?: number;

  @ApiProperty({
    required: false,
    description: 'Hạn thanh toán (số ngày) — chỉ lưu thông tin.',
  })
  @IsOptional()
  @IsInt()
  @Min(0)
  paymentTermDays?: number;
}
