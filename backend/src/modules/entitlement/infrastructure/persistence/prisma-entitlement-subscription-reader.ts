import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../../prisma/prisma.service';
import {
  EntitlementSubscriptionSnapshot,
  IEntitlementSubscriptionReader,
} from '../../domain/repositories/entitlement-subscription-reader.interface';

/**
 * T053.03 §7/§23 — Đọc trực tiếp qua PrismaService (module @Global(), an toàn inject không cần
 * import PrismaModule — cùng pattern mọi repository khác trong codebase). Query hẹp: chỉ select
 * plan + entitlementOverrides, KHÔNG load toàn bộ Organization aggregate cho mỗi lần check feature.
 */
@Injectable()
export class PrismaEntitlementSubscriptionReader implements IEntitlementSubscriptionReader {
  constructor(private readonly prisma: PrismaService) {}

  async findByOrganizationId(
    organizationId: string,
  ): Promise<EntitlementSubscriptionSnapshot | null> {
    const row = await this.prisma.organizationSubscription.findUnique({
      where: { organizationId },
      select: { plan: true, entitlementOverrides: true },
    });
    if (!row) return null;
    return {
      plan: row.plan,
      entitlementOverrides: row.entitlementOverrides,
    };
  }
}
