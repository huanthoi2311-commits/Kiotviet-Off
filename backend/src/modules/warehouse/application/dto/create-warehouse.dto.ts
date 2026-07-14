import { ApiProperty } from '@nestjs/swagger';
import {
  IsEmail,
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Matches,
} from 'class-validator';

const WAREHOUSE_TYPES = [
  'MAIN',
  'RETAIL',
  'ONLINE',
  'RETURN',
  'DAMAGED',
  'TRANSIT',
  'CUSTOM',
] as const;
const WAREHOUSE_STATUSES = ['ACTIVE', 'INACTIVE'] as const;

/** Số điện thoại VN: bắt đầu 0 hoặc +84, theo sau 9 chữ số. */
const PHONE_REGEX = /^(0|\+84)\d{9,10}$/;

export class CreateWarehouseDto {
  @ApiProperty({ description: 'Chi nhánh sở hữu kho' })
  @IsUUID()
  branchId: string;

  @ApiProperty({ required: false, description: 'Người quản lý kho' })
  @IsOptional()
  @IsUUID()
  managerId?: string;

  @ApiProperty({ example: 'KHO-HN-01' })
  @IsString()
  @Length(1, 50)
  code: string;

  @ApiProperty({ example: 'Kho Chính Hà Nội', minLength: 3, maxLength: 255 })
  @IsString()
  @Length(3, 255)
  name: string;

  @ApiProperty({ required: false, enum: WAREHOUSE_TYPES, default: 'MAIN' })
  @IsOptional()
  @IsEnum(WAREHOUSE_TYPES)
  type?: (typeof WAREHOUSE_TYPES)[number];

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  address?: string;

  @ApiProperty({ required: false, example: '0987654321' })
  @IsOptional()
  @Matches(PHONE_REGEX, { message: 'Số điện thoại không đúng định dạng' })
  phone?: string;

  @ApiProperty({ required: false, nullable: true })
  @IsOptional()
  @IsEmail()
  email?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiProperty({ required: false, enum: WAREHOUSE_STATUSES, default: 'ACTIVE' })
  @IsOptional()
  @IsEnum(WAREHOUSE_STATUSES)
  status?: (typeof WAREHOUSE_STATUSES)[number];
}
