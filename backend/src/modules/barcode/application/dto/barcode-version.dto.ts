import { ApiProperty } from '@nestjs/swagger';
import { IsInt } from 'class-validator';

/**
 * Dùng chung cho Archive/Restore/SetDefault (SPEC-BARCODE-001 §4.1/§10, Decision BQ10) — 3 thao
 * tác này đều bắt buộc Optimistic Lock, khác mặc định chuẩn dự án (chỉ PATCH).
 */
export class BarcodeVersionDto {
  @ApiProperty({ description: 'Version hiện tại — Optimistic Lock, bắt buộc' })
  @IsInt()
  version: number;
}
