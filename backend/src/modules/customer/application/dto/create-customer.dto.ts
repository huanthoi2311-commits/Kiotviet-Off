import { ApiProperty } from '@nestjs/swagger';
import {
  IsDateString,
  IsEmail,
  IsEnum,
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
const CUSTOMER_STATUSES = ['ACTIVE', 'INACTIVE'] as const;

export class CreateCustomerDto {
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

  @ApiProperty({ example: '0987654321' })
  @IsString()
  @Length(8, 20)
  phone: string;

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

  @ApiProperty({ required: false, enum: CUSTOMER_STATUSES, default: 'ACTIVE' })
  @IsOptional()
  @IsEnum(CUSTOMER_STATUSES)
  status?: (typeof CUSTOMER_STATUSES)[number];
}
