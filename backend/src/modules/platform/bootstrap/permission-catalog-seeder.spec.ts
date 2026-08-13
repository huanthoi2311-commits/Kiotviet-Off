import { seedPermissionCatalog } from './permission-catalog-seeder';
import { PERMISSION_CATALOG } from '../../rbac/infrastructure/permission-catalog';

describe('seedPermissionCatalog', () => {
  it('upsert đúng mọi permission trong PERMISSION_CATALOG, theo where.code', async () => {
    const upsert = jest.fn().mockResolvedValue({});
    const prisma = { permission: { upsert } };

    const result = await seedPermissionCatalog(prisma);

    expect(upsert).toHaveBeenCalledTimes(PERMISSION_CATALOG.length);
    expect(result.upserted).toBe(PERMISSION_CATALOG.length);

    const first = PERMISSION_CATALOG[0];
    expect(upsert).toHaveBeenCalledWith({
      where: { code: first.code },
      create: first,
      update: { group: first.group, description: first.description },
    });
  });

  it('idempotent: gọi lại nhiều lần không ném lỗi (upsert, không create thẳng)', async () => {
    const upsert = jest.fn().mockResolvedValue({});
    const prisma = { permission: { upsert } };

    await seedPermissionCatalog(prisma);
    await seedPermissionCatalog(prisma);

    expect(upsert).toHaveBeenCalledTimes(PERMISSION_CATALOG.length * 2);
  });
});
