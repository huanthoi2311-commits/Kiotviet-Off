import { ApiProperty } from '@nestjs/swagger';

export class InventoryAdjustmentItemResponseDto {
  @ApiProperty() id: string;
  @ApiProperty() productId: string;
  @ApiProperty() quantity: string;
  @ApiProperty({ nullable: true }) remark: string | null;
}

export class InventoryAdjustmentResponseDto {
  @ApiProperty() id: string;
  @ApiProperty() warehouseId: string;
  @ApiProperty() code: string;
  @ApiProperty() status: string;
  @ApiProperty() reason: string;
  @ApiProperty({ nullable: true }) note: string | null;
  @ApiProperty({ type: [InventoryAdjustmentItemResponseDto] })
  items: InventoryAdjustmentItemResponseDto[];
  @ApiProperty() createdAt: Date;
  @ApiProperty() updatedAt: Date;
}

export class PaginatedInventoryAdjustmentResponseDto {
  @ApiProperty({ type: [InventoryAdjustmentResponseDto] })
  items: InventoryAdjustmentResponseDto[];
  @ApiProperty() total: number;
  @ApiProperty() page: number;
  @ApiProperty() limit: number;
}
