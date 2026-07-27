import { ApiProperty } from '@nestjs/swagger';

export class SalesReturnItemResponseDto {
  @ApiProperty() id: string;
  @ApiProperty() invoiceItemId: string;
  @ApiProperty() productId: string;
  @ApiProperty({ nullable: true }) warehouseId: string | null;
  @ApiProperty() quantity: string;
  @ApiProperty() unitPrice: string;
  @ApiProperty() discount: string;
  @ApiProperty() taxAmount: string;
  @ApiProperty() totalAmount: string;
  @ApiProperty() productCodeSnapshot: string;
  @ApiProperty() productNameSnapshot: string;
  @ApiProperty() unitNameSnapshot: string;
  @ApiProperty() reason: string;
  @ApiProperty({ nullable: true }) reasonNote: string | null;
  @ApiProperty() createdAt: Date;
  @ApiProperty() updatedAt: Date;
}

export class SalesReturnRefundResponseDto {
  @ApiProperty() id: string;
  @ApiProperty() salesReturnId: string;
  @ApiProperty() amount: string;
  @ApiProperty() method: string;
  @ApiProperty() status: string;
  @ApiProperty({ nullable: true }) externalReference: string | null;
  @ApiProperty({ nullable: true }) failureReason: string | null;
  @ApiProperty({ nullable: true }) createdBy: string | null;
  @ApiProperty({ nullable: true }) updatedBy: string | null;
  @ApiProperty() createdAt: Date;
  @ApiProperty() updatedAt: Date;
  @ApiProperty() version: number;
}

export class SalesReturnResponseDto {
  @ApiProperty() id: string;
  @ApiProperty() organizationId: string;
  @ApiProperty() branchId: string;
  @ApiProperty() invoiceId: string;
  @ApiProperty({ nullable: true }) customerId: string | null;
  @ApiProperty() code: string;
  @ApiProperty() status: string;
  @ApiProperty() totalAmount: string;
  @ApiProperty({ nullable: true }) note: string | null;
  @ApiProperty({ nullable: true }) createdBy: string | null;
  @ApiProperty({ nullable: true }) updatedBy: string | null;
  @ApiProperty() createdAt: Date;
  @ApiProperty() updatedAt: Date;
  @ApiProperty() version: number;
  @ApiProperty({ type: [SalesReturnItemResponseDto] })
  items: SalesReturnItemResponseDto[];
  @ApiProperty({ type: [SalesReturnRefundResponseDto] })
  refunds: SalesReturnRefundResponseDto[];
}

export class PaginatedSalesReturnResponseDto {
  @ApiProperty({ type: [SalesReturnResponseDto] })
  items: SalesReturnResponseDto[];
  @ApiProperty() total: number;
  @ApiProperty() page: number;
  @ApiProperty() limit: number;
}

export class SalesReturnEligibilityResponseDto {
  @ApiProperty() invoiceItemId: string;
  @ApiProperty() soldQty: string;
  @ApiProperty() returnedQty: string;
  @ApiProperty() eligibleQty: string;
}
