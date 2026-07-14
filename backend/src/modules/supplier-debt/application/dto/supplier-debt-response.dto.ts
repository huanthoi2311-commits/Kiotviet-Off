import { ApiProperty } from '@nestjs/swagger';

export class SupplierDebtResponseDto {
  @ApiProperty() supplierId: string;
  @ApiProperty() supplierCode: string;
  @ApiProperty() supplierName: string;
  @ApiProperty({
    description:
      'Tổng phát sinh công nợ (từ Purchase Order, đã trừ Purchase Return)',
  })
  totalDebt: string;
  @ApiProperty({ description: 'Tổng đã thanh toán' })
  totalPaid: string;
  @ApiProperty({ description: 'Công nợ hiện tại = totalDebt - totalPaid' })
  balance: string;
}

export class PaginatedSupplierDebtResponseDto {
  @ApiProperty({ type: [SupplierDebtResponseDto] })
  items: SupplierDebtResponseDto[];
  @ApiProperty() total: number;
  @ApiProperty() page: number;
  @ApiProperty() limit: number;
}
