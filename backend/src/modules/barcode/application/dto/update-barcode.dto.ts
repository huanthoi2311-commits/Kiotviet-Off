import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsString, IsUUID, Length } from 'class-validator';

const BARCODE_TYPES = ['EAN13', 'EAN8', 'CODE128', 'QR', 'CUSTOM'] as const;

export class UpdateBarcodeDto {
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
}
