import { ApiProperty } from '@nestjs/swagger';

export class InvoiceItemResponseDto {
  @ApiProperty() id: string;
  @ApiProperty() productId: string;
  @ApiProperty() quantity: string;
  @ApiProperty() unitPrice: string;
  @ApiProperty() discount: string;
  @ApiProperty() taxAmount: string;
  @ApiProperty() totalAmount: string;
  @ApiProperty({ nullable: true }) productCodeSnapshot: string | null;
  @ApiProperty({ nullable: true }) productNameSnapshot: string | null;
  @ApiProperty({ nullable: true }) unitNameSnapshot: string | null;
  @ApiProperty({ nullable: true }) barcodeId: string | null;
  @ApiProperty({ nullable: true }) barcodeSnapshot: string | null;
}

export class InvoiceResponseDto {
  @ApiProperty() id: string;
  @ApiProperty() branchId: string;
  @ApiProperty({ nullable: true }) orderId: string | null;
  @ApiProperty({ nullable: true }) customerId: string | null;
  @ApiProperty() code: string;
  @ApiProperty() status: string;
  @ApiProperty() totalAmount: string;
  @ApiProperty() paidAmount: string;
  @ApiProperty() dueAmount: string;
  @ApiProperty({ nullable: true }) dueDate: Date | null;
  @ApiProperty({ nullable: true }) customerCodeSnapshot: string | null;
  @ApiProperty({ nullable: true }) customerNameSnapshot: string | null;
  @ApiProperty({ nullable: true }) customerPhoneSnapshot: string | null;
  @ApiProperty() createdAt: Date;
  @ApiProperty() updatedAt: Date;
  @ApiProperty({ type: [InvoiceItemResponseDto] })
  items: InvoiceItemResponseDto[];
}

export class PaginatedInvoiceResponseDto {
  @ApiProperty({ type: [InvoiceResponseDto] }) items: InvoiceResponseDto[];
  @ApiProperty() total: number;
  @ApiProperty() page: number;
  @ApiProperty() limit: number;
}
