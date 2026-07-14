import { ApiProperty } from '@nestjs/swagger';

export class SupplierPaymentResponseDto {
  @ApiProperty() id: string;
  @ApiProperty() branchId: string;
  @ApiProperty() supplierId: string;
  @ApiProperty({ nullable: true }) purchaseOrderId: string | null;
  @ApiProperty() method: string;
  @ApiProperty() amount: string;
  @ApiProperty() paidAt: Date;
  @ApiProperty() createdAt: Date;
}
