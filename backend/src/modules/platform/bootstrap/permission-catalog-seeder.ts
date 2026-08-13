import type { PrismaClient } from '@prisma/client';
import { PERMISSION_CATALOG } from '../../rbac/infrastructure/permission-catalog';

type PermissionSeederPrismaClient = {
  permission: Pick<PrismaClient['permission'], 'upsert'>;
};

/**
 * T051.04 (SPEC-T022A) — Upsert idempotent toàn bộ PERMISSION_CATALOG vào bảng `permissions`.
 * Đây là bước BẮT BUỘC chạy TRƯỚC `initializeFirstAdmin()` (first-admin-initializer.ts:213 ném
 * lỗi rõ ràng nếu bảng Permission rỗng — SPEC-T022B1 §3 Precondition P2). Idempotent tuyệt đối:
 * `upsert` theo `code` (unique), `update: {}` — chạy lại nhiều lần (mỗi lần `docker compose up`)
 * không tạo trùng, không xoá permission cũ nếu catalog trong code đã thay đổi (bổ sung permission
 * mới là an toàn; xoá permission khỏi catalog KHÔNG tự xoá record cũ — ngoài phạm vi T051.04).
 */
export async function seedPermissionCatalog(
  prisma: PermissionSeederPrismaClient,
): Promise<{ upserted: number }> {
  for (const permission of PERMISSION_CATALOG) {
    await prisma.permission.upsert({
      where: { code: permission.code },
      create: permission,
      update: { group: permission.group, description: permission.description },
    });
  }
  return { upserted: PERMISSION_CATALOG.length };
}
