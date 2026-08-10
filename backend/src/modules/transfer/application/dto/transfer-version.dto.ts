import { ApiProperty } from '@nestjs/swagger';
import { IsInt } from 'class-validator';

/** T051.02 — dùng chung cho approve/receive/cancel, cả 3 đều qua `transitionStatus()` và đều có
 * thể tác động Inventory. */
export class TransferVersionDto {
  @ApiProperty({
    description:
      'Optimistic Lock (T051.02) — gửi lại đúng version đã đọc trước đó; sai version bị từ chối (409)',
  })
  @IsInt()
  version: number;
}
