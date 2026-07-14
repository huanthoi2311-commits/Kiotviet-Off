import { ApiProperty } from '@nestjs/swagger';

export class InventoryMovementResponseDto {
  @ApiProperty() id: string;
  @ApiProperty() warehouseId: string;
  @ApiProperty() productId: string;
  @ApiProperty() movementType: string;
  @ApiProperty() referenceType: string;
  @ApiProperty({ nullable: true }) referenceId: string | null;
  @ApiProperty() quantity: string;
  @ApiProperty() beforeQuantity: string;
  @ApiProperty() afterQuantity: string;
  @ApiProperty({ nullable: true }) unitCost: string | null;
  @ApiProperty({ nullable: true }) remark: string | null;
  @ApiProperty() createdAt: Date;
}

export class PaginatedInventoryMovementResponseDto {
  @ApiProperty({ type: [InventoryMovementResponseDto] })
  items: InventoryMovementResponseDto[];
  @ApiProperty() total: number;
  @ApiProperty() page: number;
  @ApiProperty() limit: number;
}
