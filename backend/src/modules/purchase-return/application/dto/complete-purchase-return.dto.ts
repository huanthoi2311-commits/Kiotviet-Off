import { ApiProperty } from '@nestjs/swagger';
import { IsInt } from 'class-validator';

export class CompletePurchaseReturnDto {
  @ApiProperty({
    description:
      'Optimistic Lock (T051.02) — gửi lại đúng version đã đọc trước đó; sai version bị từ chối (409)',
  })
  @IsInt()
  version: number;
}
