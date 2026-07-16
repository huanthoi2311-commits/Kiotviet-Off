import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsOptional, IsString, IsUUID, Length } from 'class-validator';
import { IsIanaTimezone } from '../../../../common/validators/is-iana-timezone.validator';
import { IsIso4217Currency } from '../../../../common/validators/is-iso4217-currency.validator';

export class CreateBranchDto {
  @ApiProperty()
  @IsString()
  @Length(1, 150)
  name: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsEmail()
  email?: string;

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
  phone?: string;

  @ApiProperty({
    required: false,
    example: 'HN',
    description: 'Unique trong Organization',
  })
  @IsOptional()
  @IsString()
  invoicePrefix?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  receiptPrefix?: string;

  @ApiProperty({ required: false, example: 'Asia/Ho_Chi_Minh' })
  @IsOptional()
  @IsIanaTimezone()
  timezone?: string;

  @ApiProperty({ required: false, example: 'VND' })
  @IsOptional()
  @IsIso4217Currency()
  currencyCode?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsUUID()
  managerUserId?: string;
}
