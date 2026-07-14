import { ApiProperty } from '@nestjs/swagger';

export class PurchaseReturnItemResponseDto {
  @ApiProperty() id: string;
  @ApiProperty() purchaseItemId: string;
  @ApiProperty() productId: string;
  @ApiProperty() warehouseId: string;
  @ApiProperty() quantity: string;
  @ApiProperty() unitCost: string;
  @ApiProperty() totalAmount: string;
}

export class PurchaseReturnResponseDto {
  @ApiProperty() id: string;
  @ApiProperty() purchaseOrderId: string;
  @ApiProperty() supplierId: string;
  @ApiProperty() code: string;
  @ApiProperty() status: string;
  @ApiProperty() reason: string;
  @ApiProperty() totalAmount: string;
  @ApiProperty({ nullable: true }) note: string | null;
  @ApiProperty({ type: [PurchaseReturnItemResponseDto] })
  items: PurchaseReturnItemResponseDto[];
  @ApiProperty() createdAt: Date;
  @ApiProperty() updatedAt: Date;
}

export class PaginatedPurchaseReturnResponseDto {
  @ApiProperty({ type: [PurchaseReturnResponseDto] })
  items: PurchaseReturnResponseDto[];
  @ApiProperty() total: number;
  @ApiProperty() page: number;
  @ApiProperty() limit: number;
}
