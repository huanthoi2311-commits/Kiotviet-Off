import { ApiProperty } from '@nestjs/swagger';
import { IsNumber, IsString } from 'class-validator';

/** Body chung cho mọi state-transition route (submit/approve/receive/complete/cancel) — Optimistic Lock (SPEC §4). */
export class VersionedActionDto {
  @ApiProperty({ description: 'Optimistic Lock — version hiện tại của phiếu' })
  @IsNumber()
  version: number;
}

export class FailSalesReturnRefundDto extends VersionedActionDto {
  @ApiProperty()
  @IsString()
  failureReason: string;
}
