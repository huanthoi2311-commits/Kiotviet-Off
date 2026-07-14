import {
  PurchaseReportBreakdownItemEntity,
  PurchaseReportDashboardEntity,
} from '../../domain/entities/purchase-report.entity';
import {
  PurchaseReportBreakdownItemResponseDto,
  PurchaseReportDashboardResponseDto,
} from '../dto/purchase-report-response.dto';

export class PurchaseReportMapper {
  static toBreakdownItemResponseDto(
    entity: PurchaseReportBreakdownItemEntity,
  ): PurchaseReportBreakdownItemResponseDto {
    return {
      key: entity.key,
      code: entity.code,
      label: entity.label,
      totalAmount: entity.totalAmount,
      totalQuantity: entity.totalQuantity,
      orderCount: entity.orderCount,
    };
  }

  static toDashboardResponseDto(
    entity: PurchaseReportDashboardEntity,
  ): PurchaseReportDashboardResponseDto {
    return {
      totalAmount: entity.totalAmount,
      totalOrders: entity.totalOrders,
      averageCost: entity.averageCost,
      topSuppliers: entity.topSuppliers.map((item) =>
        this.toBreakdownItemResponseDto(item),
      ),
      topProducts: entity.topProducts.map((item) =>
        this.toBreakdownItemResponseDto(item),
      ),
      monthlyPurchase: entity.monthlyPurchase.map((item) =>
        this.toBreakdownItemResponseDto(item),
      ),
    };
  }
}
