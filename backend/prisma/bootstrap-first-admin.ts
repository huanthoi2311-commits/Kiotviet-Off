import { PrismaClient } from '@prisma/client';
import {
  FirstAdminInitializationInput,
  initializeFirstAdmin,
} from '../src/modules/platform/bootstrap/first-admin-initializer';

/**
 * T051.04 (SPEC-T022B1) — script CLI mỏng, khởi tạo Organization/Branch/Role "owner"/Administrator
 * ĐẦU TIÊN cho 1 deployment. Chạy qua `npm run prisma:bootstrap-first-admin`, SAU
 * `prisma:bootstrap-permissions` (Permission catalog phải có sẵn — first-admin-initializer.ts:213).
 * Idempotent — `initializeFirstAdmin()` tự phát hiện đã khởi tạo (có Organization nào đó) và bỏ
 * qua an toàn, không báo lỗi (an toàn chạy lại mỗi lần `docker compose up`).
 *
 * Cấu hình 100% qua biến môi trường (không có bước hỏi tương tác — bring-up chạy trong
 * `docker compose up`, không có TTY). Chỉ FIRST_ADMIN_EMAIL/FIRST_ADMIN_PASSWORD bắt buộc set —
 * phần còn lại có default hợp lý để vận hành viên khởi động lần đầu không cần điền nhiều.
 */
function readRequiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(
      `${name} chưa được set — bắt buộc để khởi tạo quản trị viên đầu tiên (xem docs/release/WINDOWS-DEPLOYMENT-RUNBOOK.md).`,
    );
  }
  return value;
}

function buildInput(): FirstAdminInitializationInput {
  return {
    organization: {
      code: process.env.FIRST_ADMIN_ORG_CODE ?? 'MAIN',
      displayName: process.env.FIRST_ADMIN_ORG_NAME ?? 'Cửa hàng của tôi',
      slug: process.env.FIRST_ADMIN_ORG_SLUG ?? 'cua-hang-cua-toi',
    },
    branch: {
      code: process.env.FIRST_ADMIN_BRANCH_CODE ?? 'MAIN',
      name: process.env.FIRST_ADMIN_BRANCH_NAME ?? 'Chi nhánh chính',
    },
    administrator: {
      username: process.env.FIRST_ADMIN_USERNAME ?? 'admin',
      email: readRequiredEnv('FIRST_ADMIN_EMAIL'),
      password: readRequiredEnv('FIRST_ADMIN_PASSWORD'),
      fullName: process.env.FIRST_ADMIN_FULL_NAME,
    },
  };
}

async function main(): Promise<void> {
  const input = buildInput();
  const prisma = new PrismaClient();
  try {
    const result = await initializeFirstAdmin(prisma, input);
    if (result.outcome === 'ALREADY_INITIALIZED') {
      console.log(
        '✓ Deployment đã được khởi tạo trước đó (đã có Organization) — bỏ qua, không tạo lại.',
      );
      return;
    }
    console.log(
      `✓ Đã tạo Organization/Branch/Administrator đầu tiên. organizationId=${result.organizationId} userId=${result.userId}`,
    );
    console.log(
      `  Đăng nhập bằng email đã cấu hình (FIRST_ADMIN_EMAIL) và mật khẩu đã cấu hình (FIRST_ADMIN_PASSWORD).`,
    );
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error('✗ Bootstrap first admin thất bại:', error);
  process.exitCode = 1;
});
