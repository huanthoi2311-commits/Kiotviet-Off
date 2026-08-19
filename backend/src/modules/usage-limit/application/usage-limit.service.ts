import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { UsageResourceType } from '../domain/usage-resource-type';

const LIMIT_SELECT = {
  maxUser: true,
  maxBranch: true,
  maxWarehouse: true,
  maxProduct: true,
  maxCustomer: true,
} satisfies Prisma.OrganizationSubscriptionSelect;

type LimitRow = Prisma.OrganizationSubscriptionGetPayload<{
  select: typeof LIMIT_SELECT;
}>;

/**
 * T053.05B — module lá (leaf, mirror EntitlementModule T053.03): KHÔNG import
 * User/Branch/Warehouse/Product/CustomerModule, KHÔNG sở hữu mutation nghiệp vụ nào. Chỉ cung cấp
 * 2 nguyên hàm hẹp cho từng repository resource tự phối hợp theo ĐÚNG thứ tự bắt buộc
 * (LOCK → đọc limit → COUNT theo ngữ nghĩa riêng của resource → INSERT/RESTORE) trong CÙNG 1
 * transaction — COUNT và ngữ nghĩa "tính là đang dùng" là kiến thức nghiệp vụ riêng của từng
 * resource (vd Branch chỉ đếm ACTIVE, Warehouse/Product/Customer đếm deletedAt IS NULL), không
 * thuộc về module này.
 */
@Injectable()
export class UsageLimitService {
  /** pg_advisory_xact_lock — transaction-scoped (tự giải phóng khi tx commit/rollback, KHÔNG
   * dùng bản session-level pg_advisory_lock), tham số hoá qua tagged-template $executeRaw (KHÔNG
   * nối chuỗi, KHÔNG $executeRawUnsafe) — cùng pattern đã duyệt ở SupplierPayment
   * (prisma-supplier-debt.repository.ts). Khoá gồm 2 tham số ĐỘC LẬP (organizationId,
   * resourceType) — chỉ serialize CÙNG tổ chức + CÙNG loại tài nguyên; khác tổ chức hoặc khác loại
   * tài nguyên không bị chặn lẫn nhau. `hashtext()` là hash 32-bit — va chạm giữa 2 cặp khoá khác
   * nhau có thể xảy ra (cực hiếm) nhưng hậu quả chỉ là serialize thừa 1 lần, không sai bất biến,
   * không rò rỉ dữ liệu, không vượt tenant — KHÔNG được xem là không thể xảy ra.
   *
   * PHẢI gọi qua `tx` (transaction client của caller) — khoá lấy trên connection ngoài transaction
   * không bảo vệ được gì (cùng lý do đã áp dụng ở SupplierPayment). */
  async lock(
    tx: Prisma.TransactionClient,
    organizationId: string,
    resource: UsageResourceType,
  ): Promise<void> {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${organizationId}), hashtext(${resource}))`;
  }

  /** Đọc giới hạn ĐÃ PERSIST trên OrganizationSubscription.max* (Architect Decision — nguồn sự
   * thật runtime là dòng đã ghi, KHÔNG suy ra lại từ tên Plan) — PHẢI đọc qua `tx` để nằm trong
   * CÙNG transaction với LOCK/COUNT/INSERT phía trên/dưới, không đọc qua connection khác.
   *
   * Thiếu OrganizationSubscription cho 1 organizationId đã xác thực là VI PHẠM bất biến hệ thống
   * (writeOrganizationWithOwner luôn tạo đúng 1 dòng Subscription cùng lúc với Organization) —
   * KHÔNG được hiểu ngầm là "không giới hạn" (fail closed, không có nhánh fallback all-unlimited). */
  async getLimit(
    tx: Prisma.TransactionClient,
    organizationId: string,
    resource: UsageResourceType,
  ): Promise<number | null> {
    const row = await tx.organizationSubscription.findUnique({
      where: { organizationId },
      select: LIMIT_SELECT,
    });
    if (!row) {
      throw new InternalServerErrorException(
        `Bất biến hệ thống bị vi phạm: tổ chức ${organizationId} không có OrganizationSubscription — không thể xác định giới hạn ${resource}`,
      );
    }
    return this.pickLimit(row, resource);
  }

  private pickLimit(row: LimitRow, resource: UsageResourceType): number | null {
    switch (resource) {
      case 'USER':
        return row.maxUser;
      case 'BRANCH':
        return row.maxBranch;
      case 'WAREHOUSE':
        return row.maxWarehouse;
      case 'PRODUCT':
        return row.maxProduct;
      case 'CUSTOMER':
        return row.maxCustomer;
    }
  }
}
