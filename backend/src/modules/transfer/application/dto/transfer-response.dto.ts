import { ApiProperty } from '@nestjs/swagger';

export class TransferItemResponseDto {
  @ApiProperty() id: string;
  @ApiProperty() productId: string;
  @ApiProperty() quantity: string;
  @ApiProperty({ nullable: true }) unitCost: string | null;
}

export class TransferResponseDto {
  @ApiProperty() id: string;
  @ApiProperty() fromWarehouseId: string;
  @ApiProperty() toWarehouseId: string;
  @ApiProperty() code: string;
  @ApiProperty() status: string;
  @ApiProperty({ nullable: true }) note: string | null;
  @ApiProperty({ type: [TransferItemResponseDto] })
  items: TransferItemResponseDto[];
  @ApiProperty({
    description:
      'Optimistic Lock (T051.02) — gửi lại giá trị này khi gọi approve/receive/cancel',
  })
  version: number;
  @ApiProperty() createdAt: Date;
  @ApiProperty() updatedAt: Date;
}

export class PaginatedTransferResponseDto {
  @ApiProperty({ type: [TransferResponseDto] }) items: TransferResponseDto[];
  @ApiProperty() total: number;
  @ApiProperty() page: number;
  @ApiProperty() limit: number;
}
