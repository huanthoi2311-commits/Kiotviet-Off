import { ApiProperty } from '@nestjs/swagger';
import {
  IsEmail,
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUrl,
  Length,
  Min,
} from 'class-validator';

const SUPPLIER_STATUSES = ['ACTIVE', 'INACTIVE'] as const;

/** T012 (Decision SR07/SP05) — không nhận `status` khi tạo qua API thường: luôn `ACTIVE`. */
export class CreateSupplierDto {
  @ApiProperty({
    required: false,
    example: 'NCC001',
    description:
      'Tùy chọn — nếu không gửi, hệ thống tự sinh (NCC000001...). Nếu gửi: phải duy nhất trong Organization.',
  })
  @IsOptional()
  @IsString()
  @Length(1, 50)
  code?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  taxCode?: string;

  @ApiProperty({ example: 'Công ty TNHH Đức An', minLength: 2, maxLength: 255 })
  @IsString()
  @Length(2, 255)
  companyName: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  contactName?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  phone?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsEmail()
  email?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsUrl({}, { message: 'website phải là URL hợp lệ' })
  website?: string;

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
  bankName?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  bankAccount?: string;

  @ApiProperty({
    required: false,
    example: 30,
    description: 'Số ngày công nợ cho phép (NET 30)',
  })
  @IsOptional()
  @IsInt()
  @Min(0)
  paymentTerm?: number;

  @ApiProperty({ required: false, example: 50000000 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  creditLimit?: number;

  /**
   * KHÔNG dùng cho API tạo thường (luôn ACTIVE — SupplierService bỏ qua field này khi gọi
   * repository `create()`). Giữ lại CHỈ vì `SupplierExcelService` tái sử dụng chính DTO này để
   * validate từng dòng Import Excel — cột "Trạng thái" trong file Import vẫn hoạt động như cũ
   * (Decision SR04 — Import/Export giữ nguyên 100%, không đổi hành vi).
   */
  @ApiProperty({
    required: false,
    enum: SUPPLIER_STATUSES,
    default: 'ACTIVE',
    description: 'Chỉ áp dụng khi Import Excel — API tạo thường luôn ACTIVE.',
  })
  @IsOptional()
  @IsEnum(SUPPLIER_STATUSES)
  status?: (typeof SUPPLIER_STATUSES)[number];

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  note?: string;
}
