import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsOptional, IsString, IsUUID, Length } from 'class-validator';
import { IsIanaTimezone } from '../../../../common/validators/is-iana-timezone.validator';
import { IsIso4217Currency } from '../../../../common/validators/is-iso4217-currency.validator';

/** Không có code — bất biến sau khi tạo (cùng nguyên tắc Organization Rule 7). */
export class UpdateBranchDto {
  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @Length(1, 150)
  name?: string;

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

  @ApiProperty({ required: false })
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

  @ApiProperty({ required: false })
  @IsOptional()
  @IsUUID()
  defaultWarehouseId?: string;
}
