import type { PrismaClient } from '@prisma/client';

/**
 * T053.02A — Platform Admin Provisioning (V1, Option B: explicit server-side CLI provisioning).
 *
 * Mượn ĐÚNG tinh thần `first-admin-initializer.ts` (hàm thuần, không NestJS DI, chỉ Prisma trực
 * tiếp — KHÔNG có tiền lệ nào trong repo dùng `NestFactory.createApplicationContext()` cho CLI/ops
 * script, xác nhận qua rà soát `backend/prisma/*.ts` hiện có) — nhưng KHÔNG copy y nguyên: đối
 * tượng ở đây là PROMOTE một User đã tồn tại, không phải tạo mới Organization/Branch/Role.
 *
 * V1 identity model (Architect Decision): Platform Admin vẫn là 1 User row với `isPlatformAdmin =
 * true` — không có bảng/model riêng, không đổi Auth/JWT/Session. Vẫn thuộc về 1 Organization vì
 * `User.organizationId` hiện là NOT NULL (schema.prisma:559) — chấp nhận cho V1.
 *
 * KHÔNG BAO GIỜ tự tạo Organization/User mới nếu không tìm thấy — chỉ PROMOTE người dùng đã tồn
 * tại, xác định KHÔNG MƠ HỒ qua `organizationSlug + email` (email chỉ unique TRONG 1 Organization —
 * `@@unique([organizationId, email])`, schema.prisma:599 — không phải unique toàn hệ thống).
 */

export interface PlatformAdminPromotionInput {
  organizationSlug: string;
  email: string;
}

export type PlatformAdminPromotionResult =
  | {
      outcome: 'PROMOTED';
      userId: string;
      organizationId: string;
    }
  | {
      outcome: 'ALREADY_PLATFORM_ADMIN';
      userId: string;
      organizationId: string;
    };

export class PlatformAdminTargetNotFoundError extends Error {}
export class PlatformAdminTargetNotActiveError extends Error {}

type PlatformAdminPromoterPrismaClient = Pick<
  PrismaClient,
  'organization' | 'user' | 'session' | 'auditLog' | '$transaction'
>;

/**
 * Idempotent theo đúng nghĩa Architect yêu cầu: nếu User đã `isPlatformAdmin = true`, trả về
 * `ALREADY_PLATFORM_ADMIN` NGAY, KHÔNG mở transaction, KHÔNG thu hồi session, KHÔNG ghi thêm audit
 * — chạy lại nhiều lần không được ép một Platform Admin đang hoạt động phải đăng nhập lại vô cớ.
 *
 * Khi PROMOTE thật sự (lần đầu): `user.isPlatformAdmin=true` + `permissionVersion` tăng thêm 1 +
 * thu hồi TOÀN BỘ session hiện có (revokedAt=now) + 1 dòng AuditLog — cả 4 thao tác trong CÙNG 1
 * transaction Prisma (mảng `$transaction([...])`, atomic — hoặc tất cả thành công hoặc không gì
 * thay đổi). `permissionVersion` được xác nhận (đọc trực tiếp `jwt-access.strategy.ts`) là kiểm
 * tra LẠI TỪ DB trên MỌI request có JWT (không chỉ lúc refresh) — tăng nó khiến access token cũ
 * hỏng ngay từ request kế tiếp, không cần đợi hết hạn tự nhiên. Kết hợp thu hồi session (refresh
 * token không dùng lại được) đảm bảo user PHẢI đăng nhập lại để nhận JWT `isPlatformAdmin=true`
 * mới — không dựa MỘT MÌNH vào permissionVersion (Architect §5 yêu cầu bằng chứng, đây là bằng
 * chứng: `jwt-access.strategy.ts:34` so sánh `user.permissionVersion !== payload.permissionVersion`
 * mỗi request).
 *
 * Audit ghi TRỰC TIẾP qua Prisma (không qua `AuditLogService` — service đó là best-effort, nuốt
 * lỗi, phù hợp cho log phụ trong luồng nghiệp vụ HTTP, nhưng bản ghi audit của MỘT hành động cấp
 * quyền phải là bắt buộc/atomic với chính hành động đó, không được phép âm thầm biến mất nếu ghi
 * log lỗi). `userId` trên AuditLog là NGƯỜI ĐƯỢC PROMOTE (đối tượng của sự kiện — cùng quy ước
 * `auth.service.ts` đã dùng cho `auth.login.success/failed`), không phải một "actor" giả lập —
 * CLI không có actor đã đăng nhập, không bịa ra userId nào khác.
 */
export async function promotePlatformAdmin(
  prisma: PlatformAdminPromoterPrismaClient,
  input: PlatformAdminPromotionInput,
): Promise<PlatformAdminPromotionResult> {
  const organization = await prisma.organization.findUnique({
    where: { slug: input.organizationSlug },
  });
  if (!organization) {
    throw new PlatformAdminTargetNotFoundError(
      `Không tìm thấy Organization với slug "${input.organizationSlug}"`,
    );
  }

  const user = await prisma.user.findUnique({
    where: {
      organizationId_email: {
        organizationId: organization.id,
        email: input.email,
      },
    },
  });
  if (!user) {
    throw new PlatformAdminTargetNotFoundError(
      `Không tìm thấy User "${input.email}" trong Organization "${input.organizationSlug}"`,
    );
  }
  if (user.status !== 'ACTIVE') {
    throw new PlatformAdminTargetNotActiveError(
      `User "${input.email}" không ở trạng thái ACTIVE (hiện tại: ${user.status}) — không thể cấp quyền Platform Admin`,
    );
  }

  if (user.isPlatformAdmin) {
    return {
      outcome: 'ALREADY_PLATFORM_ADMIN',
      userId: user.id,
      organizationId: organization.id,
    };
  }

  await prisma.$transaction([
    prisma.user.update({
      where: { id: user.id },
      data: {
        isPlatformAdmin: true,
        permissionVersion: { increment: 1 },
      },
    }),
    prisma.session.updateMany({
      where: { userId: user.id, revokedAt: null },
      data: { revokedAt: new Date() },
    }),
    prisma.auditLog.create({
      data: {
        organizationId: organization.id,
        userId: user.id,
        action: 'platform_admin.promote',
        entityType: 'User',
        entityId: user.id,
        oldValue: { isPlatformAdmin: false },
        newValue: { isPlatformAdmin: true, promotedVia: 'cli' },
      },
    }),
  ]);

  return {
    outcome: 'PROMOTED',
    userId: user.id,
    organizationId: organization.id,
  };
}
