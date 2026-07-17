import { ApiProperty } from '@nestjs/swagger';
import {
  IsEnum,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Length,
} from 'class-validator';

const BARCODE_TYPES = ['EAN13', 'EAN8', 'CODE128', 'QR', 'CUSTOM'] as const;
const BARCODE_UPDATE_STATUSES = ['ACTIVE', 'INACTIVE'] as const;

export class UpdateBarcodeDto {
  @ApiProperty({ description: 'Version hiện tại — Optimistic Lock, bắt buộc' })
  @IsInt()
  version: number;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @Length(1, 100)
  code?: string;

  @ApiProperty({ required: false, enum: BARCODE_TYPES })
  @IsOptional()
  @IsEnum(BARCODE_TYPES)
  type?: (typeof BARCODE_TYPES)[number];

  @ApiProperty({ required: false, nullable: true })
  @IsOptional()
  @IsUUID()
  unitId?: string | null;

  @ApiProperty({
    required: false,
    enum: BARCODE_UPDATE_STATUSES,
    description: 'Không cho set ARCHIVED qua route này — chỉ qua DELETE',
  })
  @IsOptional()
  @IsIn(BARCODE_UPDATE_STATUSES)
  status?: (typeof BARCODE_UPDATE_STATUSES)[number];
}
