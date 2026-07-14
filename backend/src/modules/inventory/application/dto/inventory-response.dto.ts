import { ApiProperty } from '@nestjs/swagger';

export class InventoryResponseDto {
  @ApiProperty() id: string;
  @ApiProperty() warehouseId: string;
  @ApiProperty() productId: string;
  @ApiProperty() quantity: string;
  @ApiProperty() reservedQty: string;
  @ApiProperty() availableQty: string;
  @ApiProperty() avgCost: string;
  @ApiProperty() lastCost: string;
  @ApiProperty() createdAt: Date;
  @ApiProperty() updatedAt: Date;
}

export class PaginatedInventoryResponseDto {
  @ApiProperty({ type: [InventoryResponseDto] }) items: InventoryResponseDto[];
  @ApiProperty() total: number;
  @ApiProperty() page: number;
  @ApiProperty() limit: number;
}
