import { ApiProperty } from '@nestjs/swagger';

export class PurchaseItemResponseDto {
  @ApiProperty() id: string;
  @ApiProperty() productId: string;
  @ApiProperty() warehouseId: string;
  @ApiProperty() quantity: string;
  @ApiProperty() receivedQuantity: string;
  @ApiProperty() unitCost: string;
  @ApiProperty() discount: string;
  @ApiProperty() taxAmount: string;
  @ApiProperty() totalAmount: string;
}

export class PurchaseOrderResponseDto {
  @ApiProperty() id: string;
  @ApiProperty() branchId: string;
  @ApiProperty() supplierId: string;
  @ApiProperty() code: string;
  @ApiProperty() status: string;
  @ApiProperty() totalAmount: string;
  @ApiProperty() paidAmount: string;
  @ApiProperty({ nullable: true }) expectedAt: Date | null;
  @ApiProperty({ type: [PurchaseItemResponseDto] })
  items: PurchaseItemResponseDto[];
  @ApiProperty() createdAt: Date;
  @ApiProperty() updatedAt: Date;
}

export class PaginatedPurchaseOrderResponseDto {
  @ApiProperty({ type: [PurchaseOrderResponseDto] })
  items: PurchaseOrderResponseDto[];
  @ApiProperty() total: number;
  @ApiProperty() page: number;
  @ApiProperty() limit: number;
}
