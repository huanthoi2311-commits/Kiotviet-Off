import { ApiProperty } from '@nestjs/swagger';
import { IsInt } from 'class-validator';

/**
 * Dùng chung cho Archive/Restore/Activate/Deactivate (SPEC-T011-CUSTOMER-001 §4, BR09) — cả 4
 * thao tác đều bắt buộc Optimistic Lock. Đúng mẫu `BarcodeVersionDto` (T009).
 */
export class CustomerVersionDto {
  @ApiProperty({ description: 'Version hiện tại — Optimistic Lock, bắt buộc' })
  @IsInt()
  version: number;
}
