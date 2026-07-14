import { ApiProperty } from '@nestjs/swagger';

export class PurchaseReportBreakdownItemResponseDto {
  @ApiProperty() key: string;
  @ApiProperty({ nullable: true }) code: string | null;
  @ApiProperty() label: string;
  @ApiProperty() totalAmount: string;
  @ApiProperty() totalQuantity: string;
  @ApiProperty() orderCount: number;
}

export class PaginatedPurchaseReportBreakdownResponseDto {
  @ApiProperty({ type: [PurchaseReportBreakdownItemResponseDto] })
  items: PurchaseReportBreakdownItemResponseDto[];
  @ApiProperty() total: number;
  @ApiProperty() page: number;
  @ApiProperty() limit: number;
}

export class PurchaseReportDashboardResponseDto {
  @ApiProperty() totalAmount: string;
  @ApiProperty() totalOrders: number;
  @ApiProperty({
    description:
      'Giá vốn bình quân gia quyền = SUM(quantity*unitCost)/SUM(quantity)',
  })
  averageCost: string;
  @ApiProperty({ type: [PurchaseReportBreakdownItemResponseDto] })
  topSuppliers: PurchaseReportBreakdownItemResponseDto[];
  @ApiProperty({ type: [PurchaseReportBreakdownItemResponseDto] })
  topProducts: PurchaseReportBreakdownItemResponseDto[];
  @ApiProperty({ type: [PurchaseReportBreakdownItemResponseDto] })
  monthlyPurchase: PurchaseReportBreakdownItemResponseDto[];
}
