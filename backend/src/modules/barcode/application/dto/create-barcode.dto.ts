import { ApiProperty } from '@nestjs/swagger';
import {
  IsBoolean,
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
  Length,
} from 'class-validator';

const BARCODE_TYPES = ['EAN13', 'EAN8', 'CODE128', 'QR', 'CUSTOM'] as const;

export class CreateBarcodeDto {
  @ApiProperty({ example: '8938505970381' })
  @IsString()
  @Length(1, 100)
  code: string;

  @ApiProperty({ enum: BARCODE_TYPES, example: 'EAN13' })
  @IsEnum(BARCODE_TYPES)
  type: (typeof BARCODE_TYPES)[number];

  @ApiProperty({
    required: false,
    description: 'Đơn vị tính áp dụng barcode này (vd: thùng, lốc)',
  })
  @IsOptional()
  @IsUUID()
  unitId?: string;

  @ApiProperty({ required: false, default: false })
  @IsOptional()
  @IsBoolean()
  isDefault?: boolean;
}
