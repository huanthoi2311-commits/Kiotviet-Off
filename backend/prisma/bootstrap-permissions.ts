import { PrismaClient } from '@prisma/client';
import { seedPermissionCatalog } from '../src/modules/platform/bootstrap/permission-catalog-seeder';

/**
 * T051.04 (SPEC-T022A) — script CLI mỏng, upsert PERMISSION_CATALOG vào DB. Chạy qua
 * `npm run prisma:bootstrap-permissions`, BẮT BUỘC trước `prisma:bootstrap-first-admin` (xem
 * first-admin-initializer.ts §Precondition P2). Idempotent — an toàn chạy lại mỗi lần
 * `docker compose up` (xem docker-compose.yml, service `bring-up`).
 */
async function main(): Promise<void> {
  const prisma = new PrismaClient();
  try {
    const { upserted } = await seedPermissionCatalog(prisma);
    console.log(`✓ Đã upsert ${upserted} permission vào catalog.`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error('✗ Bootstrap permission catalog thất bại:', error);
  process.exitCode = 1;
});
