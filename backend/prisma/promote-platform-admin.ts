import { PrismaClient } from '@prisma/client';
import {
  PlatformAdminTargetNotActiveError,
  PlatformAdminTargetNotFoundError,
  promotePlatformAdmin,
} from '../src/modules/platform/bootstrap/platform-admin-promoter';

/**
 * T053.02A — script CLI mỏng, cấp quyền Platform Admin cho MỘT User ĐÃ TỒN TẠI. Chạy qua:
 *
 *   npm run platform-admin:promote -- --organization-slug=<slug> --email=<email>
 *
 * Đây là hành động vận hành viên CHỦ Ý, hiếm khi chạy — KHÁC với `bootstrap-first-admin.ts` (chạy
 * tự động MỌI LẦN `docker compose up`, không TTY) — nên nhận tham số dòng lệnh thay vì biến môi
 * trường, thuận tiện hơn cho thao tác thủ công có chủ đích của vận hành viên.
 *
 * KHÔNG bao giờ tạo Organization/User mới — chỉ promote người dùng đã tồn tại xác định qua
 * organizationSlug + email. KHÔNG nhận/đổi mật khẩu — user tiếp tục đăng nhập bằng mật khẩu hiện
 * có của chính họ (tránh thêm 1 bí mật admin dạng plaintext mới).
 */
function readArg(name: string): string {
  const prefix = `--${name}=`;
  const found = process.argv.find((arg) => arg.startsWith(prefix));
  if (!found) {
    throw new Error(
      `Thiếu tham số bắt buộc --${name}=<value>. Cách dùng: npm run platform-admin:promote -- --organization-slug=<slug> --email=<email>`,
    );
  }
  return found.slice(prefix.length);
}

async function main(): Promise<void> {
  const organizationSlug = readArg('organization-slug');
  const email = readArg('email');

  const prisma = new PrismaClient();
  try {
    const result = await promotePlatformAdmin(prisma, {
      organizationSlug,
      email,
    });
    if (result.outcome === 'ALREADY_PLATFORM_ADMIN') {
      console.log(
        `✓ User "${email}" (organization "${organizationSlug}") đã là Platform Admin từ trước — không có thay đổi nào, không có session nào bị thu hồi.`,
      );
      return;
    }
    console.log(
      `✓ Đã cấp quyền Platform Admin cho "${email}" (userId=${result.userId}, organizationId=${result.organizationId}).`,
    );
    console.log(
      '  Toàn bộ session hiện có của user này đã bị thu hồi — phải đăng nhập lại (POST /auth/login) để nhận access token mới với isPlatformAdmin=true.',
    );
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  if (
    error instanceof PlatformAdminTargetNotFoundError ||
    error instanceof PlatformAdminTargetNotActiveError
  ) {
    console.error(`✗ Cấp quyền Platform Admin thất bại: ${error.message}`);
  } else {
    console.error(
      '✗ Cấp quyền Platform Admin thất bại:',
      error instanceof Error ? error.message : error,
    );
  }
  process.exitCode = 1;
});
