import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../../prisma/prisma.service';
import {
  EntitlementSubscriptionSnapshot,
  IEntitlementSubscriptionReader,
} from '../../domain/repositories/entitlement-subscription-reader.interface';

/**
 * T053.03 §7/§23 — Đọc trực tiếp qua PrismaService (module @Global(), an toàn inject không cần
 * import PrismaModule — cùng pattern mọi repository khác trong codebase). Query hẹp: chỉ select
 * plan/status/expiredAt/entitlementOverrides, KHÔNG load toàn bộ Organization aggregate cho mỗi
 * lần check feature. T053.06F bổ sung status/expiredAt (trước đó cố ý không đọc).
 */
@Injectable()
export class PrismaEntitlementSubscriptionReader implements IEntitlementSubscriptionReader {
  constructor(private readonly prisma: PrismaService) {}

  async findByOrganizationId(
    organizationId: string,
  ): Promise<EntitlementSubscriptionSnapshot | null> {
    const row = await this.prisma.organizationSubscription.findUnique({
      where: { organizationId },
      select: {
        plan: true,
        status: true,
        expiredAt: true,
        entitlementOverrides: true,
      },
    });
    if (!row) return null;
    return {
      plan: row.plan,
      status: row.status,
      expiredAt: row.expiredAt,
      entitlementOverrides: row.entitlementOverrides,
    };
  }
}
