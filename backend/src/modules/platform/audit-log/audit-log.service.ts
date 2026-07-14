import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { getRequestId } from '../../../common/context/request-context';

export interface AuditLogEntry {
  organizationId: string;
  userId?: string | null;
  action: string;
  entityType: string;
  entityId?: string | null;
  oldValue?: unknown;
  newValue?: unknown;
  ip?: string | null;
  userAgent?: string | null;
}

/**
 * Audit Log dùng chung toàn hệ thống — bất kỳ module nào (Auth, RBAC, Product,
 * Order...) cũng gọi qua service này để ghi "ai làm gì, khi nào, before/after".
 * Ghi log là tác vụ phụ (best-effort): lỗi ghi audit KHÔNG được làm hỏng nghiệp
 * vụ chính, nên mọi lỗi chỉ log cảnh báo, không throw ra ngoài.
 */
@Injectable()
export class AuditLogService {
  private readonly logger = new Logger(AuditLogService.name);

  constructor(private readonly prisma: PrismaService) {}

  async log(entry: AuditLogEntry): Promise<void> {
    try {
      await this.prisma.auditLog.create({
        data: {
          organizationId: entry.organizationId,
          userId: entry.userId ?? null,
          action: entry.action,
          entityType: entry.entityType,
          entityId: entry.entityId ?? null,
          oldValue:
            entry.oldValue === undefined
              ? undefined
              : (entry.oldValue as object),
          newValue:
            entry.newValue === undefined
              ? undefined
              : (entry.newValue as object),
          ip: entry.ip ?? null,
          userAgent: entry.userAgent ?? null,
          traceId: getRequestId() ?? null,
        },
      });
    } catch (error) {
      this.logger.warn(
        `Ghi audit log thất bại (action=${entry.action}, entityType=${entry.entityType}): ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }
}
