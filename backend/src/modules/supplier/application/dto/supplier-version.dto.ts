import { ApiProperty } from '@nestjs/swagger';
import { IsInt } from 'class-validator';

/**
 * Dùng chung cho Archive/Restore/Activate/Deactivate (SPEC-T012-SUPPLIER-001 §4, BR09) — cả 4
 * thao tác đều bắt buộc Optimistic Lock. Đúng mẫu `CustomerVersionDto` (T011).
 */
export class SupplierVersionDto {
  @ApiProperty({ description: 'Version hiện tại — Optimistic Lock, bắt buộc' })
  @IsInt()
  version: number;
}
