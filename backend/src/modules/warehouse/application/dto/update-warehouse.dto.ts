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
const PHONE_REGEX = /^(0|\+84)\d{9,10}$/;

export class UpdateWarehouseDto {
  @ApiProperty({ required: false })
  @IsOptional()
  @IsUUID()
  branchId?: string;

  @ApiProperty({ required: false, nullable: true })
  @IsOptional()
  @IsUUID()
  managerId?: string | null;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @Length(1, 50)
  code?: string;

  @ApiProperty({ required: false, minLength: 3, maxLength: 255 })
  @IsOptional()
  @IsString()
  @Length(3, 255)
  name?: string;

  @ApiProperty({ required: false, enum: WAREHOUSE_TYPES })
  @IsOptional()
  @IsEnum(WAREHOUSE_TYPES)
  type?: (typeof WAREHOUSE_TYPES)[number];

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  address?: string;

  @ApiProperty({ required: false })
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

  @ApiProperty({ required: false, enum: WAREHOUSE_STATUSES })
  @IsOptional()
  @IsEnum(WAREHOUSE_STATUSES)
  status?: (typeof WAREHOUSE_STATUSES)[number];
}
