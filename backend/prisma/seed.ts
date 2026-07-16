import { PrismaClient } from '@prisma/client';
import * as argon2 from 'argon2';
import { PERMISSION_CATALOG } from '../src/modules/rbac/infrastructure/permission-catalog';

const prisma = new PrismaClient();

async function main() {
  if (process.env.NODE_ENV === 'production') {
    throw new Error(
      'Seed script bị chặn khi NODE_ENV=production — seed chỉ dùng cho dev/staging, ' +
        'không được tạo tài khoản admin mặc định trên môi trường thật.',
    );
  }

  for (const permission of PERMISSION_CATALOG) {
    await prisma.permission.upsert({
      where: { code: permission.code },
      create: permission,
      update: { group: permission.group, description: permission.description },
    });
  }
  console.log(`Đã seed ${PERMISSION_CATALOG.length} permission.`);

  const organization = await prisma.organization.upsert({
    where: { slug: 'default' },
    create: { code: 'DEFAULT', displayName: 'Cửa hàng mặc định', slug: 'default' },
    update: {},
  });

  const branch = await prisma.branch.upsert({
    where: { organizationId_code: { organizationId: organization.id, code: 'MAIN' } },
    create: {
      organizationId: organization.id,
      code: 'MAIN',
      name: 'Chi nhánh chính',
      isMain: true,
    },
    update: {},
  });

  const ownerRole = await prisma.role.upsert({
    where: { organizationId_code: { organizationId: organization.id, code: 'owner' } },
    create: {
      organizationId: organization.id,
      code: 'owner',
      name: 'Chủ cửa hàng',
      isSystem: true,
      description: 'Toàn quyền trên hệ thống',
    },
    update: {},
  });

  const allPermissions = await prisma.permission.findMany();
  await prisma.rolePermission.deleteMany({ where: { roleId: ownerRole.id } });
  await prisma.rolePermission.createMany({
    data: allPermissions.map((p) => ({ roleId: ownerRole.id, permissionId: p.id })),
    skipDuplicates: true,
  });

  const passwordHash = await argon2.hash('Admin@123', { type: argon2.argon2id });
  const admin = await prisma.user.upsert({
    where: { organizationId_email: { organizationId: organization.id, email: 'admin@pos-erp.local' } },
    create: {
      organizationId: organization.id,
      branchId: branch.id,
      username: 'admin',
      email: 'admin@pos-erp.local',
      passwordHash,
    },
    update: {},
  });

  await prisma.userRole.upsert({
    where: { userId_roleId: { userId: admin.id, roleId: ownerRole.id } },
    create: { userId: admin.id, roleId: ownerRole.id },
    update: {},
  });

  console.log('Seed xong. Đăng nhập thử: admin@pos-erp.local / Admin@123');
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
