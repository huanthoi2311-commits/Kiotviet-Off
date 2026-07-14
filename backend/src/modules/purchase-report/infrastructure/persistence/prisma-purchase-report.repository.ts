import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../../prisma/prisma.service';
import {
  PurchaseReportBreakdownItemEntity,
  PurchaseReportDashboardEntity,
  PurchaseReportGroupBy,
} from '../../domain/entities/purchase-report.entity';
import {
  IPurchaseReportRepository,
  PurchaseReportBreakdownParams,
  PurchaseReportBreakdownResult,
  PurchaseReportFilterParams,
} from '../../domain/repositories/purchase-report.repository.interface';

/** Chỉ tính đơn đã thực sự nhập hàng — DRAFT/APPROVED/PENDING chưa có Movement, CANCELLED không có giá trị nhập. */
const RECEIVED_STATUSES = Prisma.sql`('RECEIVED', 'COMPLETED')`;

interface RawBreakdownRow {
  key: string | null;
  code: string | null;
  label: string | null;
  totalAmount: Prisma.Decimal;
  totalQuantity: Prisma.Decimal;
  orderCount: bigint;
}

interface DimensionSql {
  selectColumns: Prisma.Sql;
  joins: Prisma.Sql;
  groupBy: Prisma.Sql;
}

@Injectable()
export class PrismaPurchaseReportRepository implements IPurchaseReportRepository {
  constructor(private readonly prisma: PrismaService) {}

  async getDashboard(
    params: PurchaseReportFilterParams,
  ): Promise<PurchaseReportDashboardEntity> {
    const dateFilter = this.buildDateFilter(params);

    const [totals] = await this.prisma.$queryRaw<
      { totalAmount: Prisma.Decimal | null; totalOrders: bigint }[]
    >(Prisma.sql`
      SELECT SUM(po."totalAmount") as "totalAmount", COUNT(DISTINCT po.id) as "totalOrders"
      FROM purchase_orders po
      WHERE po."organizationId" = ${params.organizationId}
        AND po.status IN ${RECEIVED_STATUSES}
        AND po."deletedAt" IS NULL
        ${dateFilter}
    `);

    const [costs] = await this.prisma.$queryRaw<
      { averageCost: Prisma.Decimal | null }[]
    >(Prisma.sql`
      SELECT CASE WHEN SUM(pi.quantity) = 0 THEN 0
             ELSE SUM(pi.quantity * pi."unitCost") / SUM(pi.quantity) END as "averageCost"
      FROM purchase_items pi
      JOIN purchase_orders po ON po.id = pi."purchaseOrderId"
      WHERE po."organizationId" = ${params.organizationId}
        AND po.status IN ${RECEIVED_STATUSES}
        AND po."deletedAt" IS NULL
        ${dateFilter}
    `);

    const [topSuppliers, topProducts, monthlyPurchase] = await Promise.all([
      this.getBreakdown({ ...params, groupBy: 'SUPPLIER', page: 1, limit: 5 }),
      this.getBreakdown({ ...params, groupBy: 'PRODUCT', page: 1, limit: 5 }),
      this.getBreakdown({ ...params, groupBy: 'MONTH', page: 1, limit: 12 }),
    ]);

    return {
      totalAmount: (totals?.totalAmount ?? new Prisma.Decimal(0)).toString(),
      totalOrders: Number(totals?.totalOrders ?? 0n),
      averageCost: (costs?.averageCost ?? new Prisma.Decimal(0)).toString(),
      topSuppliers: topSuppliers.items,
      topProducts: topProducts.items,
      monthlyPurchase: monthlyPurchase.items,
    };
  }

  async getBreakdown(
    params: PurchaseReportBreakdownParams,
  ): Promise<PurchaseReportBreakdownResult> {
    const { selectColumns, joins, groupBy } = this.buildDimensionSql(
      params.groupBy,
    );
    const dateFilter = this.buildDateFilter(params);
    const skip = (params.page - 1) * params.limit;

    const rows = await this.prisma.$queryRaw<RawBreakdownRow[]>(Prisma.sql`
      SELECT ${selectColumns},
             SUM(pi."totalAmount") as "totalAmount",
             SUM(pi.quantity) as "totalQuantity",
             COUNT(DISTINCT pi."purchaseOrderId") as "orderCount"
      FROM purchase_items pi
      JOIN purchase_orders po ON po.id = pi."purchaseOrderId"
      ${joins}
      WHERE po."organizationId" = ${params.organizationId}
        AND po.status IN ${RECEIVED_STATUSES}
        AND po."deletedAt" IS NULL
        ${dateFilter}
      GROUP BY ${groupBy}
      ORDER BY "totalAmount" DESC
      LIMIT ${params.limit} OFFSET ${skip}
    `);

    const [{ total }] = await this.prisma.$queryRaw<
      { total: bigint }[]
    >(Prisma.sql`
      SELECT COUNT(*) as total FROM (
        SELECT ${selectColumns}
        FROM purchase_items pi
        JOIN purchase_orders po ON po.id = pi."purchaseOrderId"
        ${joins}
        WHERE po."organizationId" = ${params.organizationId}
          AND po.status IN ${RECEIVED_STATUSES}
          AND po."deletedAt" IS NULL
          ${dateFilter}
        GROUP BY ${groupBy}
      ) grouped
    `);

    return {
      items: rows.map((row) => this.toBreakdownEntity(row)),
      total: Number(total),
      page: params.page,
      limit: params.limit,
    };
  }

  private buildDateFilter(params: PurchaseReportFilterParams): Prisma.Sql {
    let filter = Prisma.empty;
    if (params.dateFrom) {
      filter = Prisma.sql`${filter} AND po."createdAt" >= ${params.dateFrom}`;
    }
    if (params.dateTo) {
      filter = Prisma.sql`${filter} AND po."createdAt" <= ${params.dateTo}`;
    }
    return filter;
  }

  private buildDimensionSql(groupBy: PurchaseReportGroupBy): DimensionSql {
    switch (groupBy) {
      case 'SUPPLIER':
        return {
          selectColumns: Prisma.sql`po."supplierId" as key, s.code as code, s."companyName" as label`,
          joins: Prisma.sql`JOIN suppliers s ON s.id = po."supplierId"`,
          groupBy: Prisma.sql`key, code, label`,
        };
      case 'PRODUCT':
        return {
          selectColumns: Prisma.sql`pi."productId" as key, p.sku as code, p.name as label`,
          joins: Prisma.sql`JOIN products p ON p.id = pi."productId"`,
          groupBy: Prisma.sql`key, code, label`,
        };
      case 'WAREHOUSE':
        return {
          selectColumns: Prisma.sql`pi."warehouseId" as key, w.code as code, w.name as label`,
          joins: Prisma.sql`JOIN warehouses w ON w.id = pi."warehouseId"`,
          groupBy: Prisma.sql`key, code, label`,
        };
      case 'MONTH':
        return {
          selectColumns: Prisma.sql`to_char(date_trunc('month', po."createdAt"), 'YYYY-MM') as key, NULL as code, to_char(date_trunc('month', po."createdAt"), 'YYYY-MM') as label`,
          joins: Prisma.sql``,
          groupBy: Prisma.sql`key, code, label`,
        };
      case 'USER':
        return {
          selectColumns: Prisma.sql`po."createdBy" as key, u.username as code, u.email as label`,
          joins: Prisma.sql`LEFT JOIN users u ON u.id = po."createdBy"`,
          groupBy: Prisma.sql`key, code, label`,
        };
      case 'CATEGORY':
        return {
          selectColumns: Prisma.sql`p."categoryId" as key, c.code as code, c.name as label`,
          joins: Prisma.sql`JOIN products p ON p.id = pi."productId" LEFT JOIN categories c ON c.id = p."categoryId"`,
          groupBy: Prisma.sql`key, code, label`,
        };
    }
  }

  private toBreakdownEntity(
    row: RawBreakdownRow,
  ): PurchaseReportBreakdownItemEntity {
    return {
      key: row.key ?? '',
      code: row.code,
      label: row.label ?? '(Không xác định)',
      totalAmount: row.totalAmount.toString(),
      totalQuantity: row.totalQuantity.toString(),
      orderCount: Number(row.orderCount),
    };
  }
}
