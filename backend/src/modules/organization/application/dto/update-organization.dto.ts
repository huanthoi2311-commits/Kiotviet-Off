import { ApiProperty } from '@nestjs/swagger';
import { IsOptional, IsString, Length } from 'class-validator';
import { IsIanaTimezone } from '../../../../common/validators/is-iana-timezone.validator';
import { IsIso4217Currency } from '../../../../common/validators/is-iso4217-currency.validator';

/** Không có slug/code/status/ownerUserId — bất biến hoặc chỉ đổi qua API riêng (Rule 6/7). */
export class UpdateOrganizationDto {
  @ApiProperty({ required: false, minLength: 3, maxLength: 150 })
  @IsOptional()
  @IsString()
  @Length(3, 150)
  displayName?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  legalName?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  taxCode?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  email?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  phone?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  website?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  logoUrl?: string;

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
  countryCode?: string;

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
  @IsString()
  languageCode?: string;
}
