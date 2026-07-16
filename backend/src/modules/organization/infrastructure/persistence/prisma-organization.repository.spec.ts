import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../../prisma/prisma.service';
import {
  OrganizationEmailConflictError,
  OrganizationNotActiveError,
  OrganizationOwnerNotInOrganizationError,
  OrganizationSlugConflictError,
  OrganizationTaxCodeConflictError,
} from '../../domain/repositories/organization.repository.interface';
import { PrismaOrganizationRepository } from './prisma-organization.repository';

describe('PrismaOrganizationRepository', () => {
  let repository: PrismaOrganizationRepository;
  let prisma: {
    organization: {
      create: jest.Mock;
      update: jest.Mock;
      findUnique: jest.Mock;
      findMany: jest.Mock;
      count: jest.Mock;
    };
    organizationSettings: { findUnique: jest.Mock };
    organizationSubscription: { findUnique: jest.Mock };
    user: { create: jest.Mock; findUnique: jest.Mock; updateMany: jest.Mock };
    $transaction: jest.Mock;
  };

  const rawOrg = {
    id: 'org-1',
    code: 'ORG000001',
    displayName: 'Acme',
    legalName: null,
    slug: 'acme',
    taxCode: null,
    email: null,
    phone: null,
    website: null,
    logoUrl: null,
    address: null,
    province: null,
    district: null,
    ward: null,
    countryCode: 'VN',
    timezone: 'Asia/Ho_Chi_Minh',
    currencyCode: 'VND',
    languageCode: 'vi',
    status: 'ACTIVE',
    ownerUserId: null,
    createdAt: new Date('2026-01-01'),
    updatedAt: new Date('2026-01-01'),
  };

  const rawSettings = {
    organizationId: 'org-1',
    allowNegativeInventory: false,
    allowBackDate: false,
    decimalQuantity: 0,
    decimalPrice: 0,
    defaultWarehouseId: null,
    defaultBranchId: null,
    defaultLanguage: 'vi',
    defaultCurrency: 'VND',
  };

  const rawSubscription = {
    organizationId: 'org-1',
    plan: 'FREE',
    status: 'ACTIVE',
    startedAt: new Date('2026-01-01'),
    expiredAt: null,
    maxBranch: null,
    maxUser: null,
    maxWarehouse: null,
    maxProduct: null,
    maxCustomer: null,
    storageLimitGB: null,
  };

  beforeEach(() => {
    prisma = {
      organization: {
        create: jest.fn(),
        update: jest.fn(),
        findUnique: jest.fn(),
        findMany: jest.fn(),
        count: jest.fn(),
      },
      organizationSettings: { findUnique: jest.fn() },
      organizationSubscription: { findUnique: jest.fn() },
      user: { create: jest.fn(), findUnique: jest.fn(), updateMany: jest.fn() },
      $transaction: jest.fn(),
    };
    repository = new PrismaOrganizationRepository(
      prisma as unknown as PrismaService,
    );
  });

  describe('createWithOwner', () => {
    const input = {
      code: 'ORG000001',
      displayName: 'Acme',
      slug: 'acme',
      owner: {
        username: 'owner',
        fullName: 'Owner Name',
        email: 'owner@acme.com',
        passwordHash: 'hashed',
      },
    };

    function makeClient() {
      return {
        organization: {
          create: jest.fn().mockResolvedValue(rawOrg),
          update: jest.fn().mockResolvedValue({}),
        },
        user: {
          create: jest.fn().mockResolvedValue({ id: 'user-1' }),
        },
        role: { create: jest.fn().mockResolvedValue({ id: 'role-1' }) },
        permission: {
          findMany: jest.fn().mockResolvedValue([{ id: 'perm-1' }]),
        },
        rolePermission: { createMany: jest.fn().mockResolvedValue({}) },
        userRole: { create: jest.fn().mockResolvedValue({}) },
        organizationSettings: {
          create: jest.fn().mockResolvedValue(rawSettings),
        },
        organizationSubscription: {
          create: jest.fn().mockResolvedValue(rawSubscription),
        },
        auditLog: { create: jest.fn().mockResolvedValue({}) },
      };
    }

    it('tạo đủ Organization + Owner User + Role + UserRole + Settings + Subscription + AuditLog trong 1 transaction', async () => {
      const client = makeClient();
      prisma.$transaction.mockImplementation((fn: (tx: unknown) => unknown) =>
        fn(client),
      );

      const result = await repository.createWithOwner(input, 'admin-1', {
        ip: '127.0.0.1',
        userAgent: 'jest',
      });

      expect(client.organization.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ code: 'ORG000001', slug: 'acme' }),
        }),
      );
      expect(client.user.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            organizationId: 'org-1',
            email: 'owner@acme.com',
          }),
        }),
      );
      expect(client.organization.update).toHaveBeenCalledWith({
        where: { id: 'org-1' },
        data: { ownerUserId: 'user-1' },
      });
      expect(client.role.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ code: 'owner', isSystem: true }),
        }),
      );
      expect(client.rolePermission.createMany).toHaveBeenCalled();
      expect(client.userRole.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { userId: 'user-1', roleId: 'role-1' },
        }),
      );
      expect(client.organizationSettings.create).toHaveBeenCalled();
      expect(client.organizationSubscription.create).toHaveBeenCalled();
      expect(client.auditLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            action: 'organization.created',
            entityType: 'Organization',
          }),
        }),
      );
      expect(result.organization.id).toBe('org-1');
      expect(result.organization.ownerUserId).toBe('user-1');
      expect(result.settings.organizationId).toBe('org-1');
      expect(result.subscription.plan).toBe('FREE');
    });

    it('không tạo RolePermission nếu chưa có Permission nào được seed', async () => {
      const client = makeClient();
      client.permission.findMany.mockResolvedValue([]);
      prisma.$transaction.mockImplementation((fn: (tx: unknown) => unknown) =>
        fn(client),
      );

      await repository.createWithOwner(input, 'admin-1', {});
      expect(client.rolePermission.createMany).not.toHaveBeenCalled();
    });

    it('ném OrganizationSlugConflictError khi slug trùng (P2002)', async () => {
      prisma.$transaction.mockImplementation(() => {
        throw new Prisma.PrismaClientKnownRequestError('duplicate', {
          code: 'P2002',
          clientVersion: '6.19.3',
          meta: { target: ['slug'] },
        });
      });

      await expect(
        repository.createWithOwner(input, 'admin-1', {}),
      ).rejects.toThrow(OrganizationSlugConflictError);
    });

    it('ném OrganizationTaxCodeConflictError khi taxCode trùng (P2002)', async () => {
      prisma.$transaction.mockImplementation(() => {
        throw new Prisma.PrismaClientKnownRequestError('duplicate', {
          code: 'P2002',
          clientVersion: '6.19.3',
          meta: { target: ['taxCode'] },
        });
      });

      await expect(
        repository.createWithOwner(
          { ...input, taxCode: '0101234567' },
          'admin-1',
          {},
        ),
      ).rejects.toThrow(OrganizationTaxCodeConflictError);
    });
  });

  describe('findById', () => {
    it('trả về null khi không tìm thấy Organization', async () => {
      prisma.organization.findUnique.mockResolvedValue(null);
      const result = await repository.findById('org-x');
      expect(result).toBeNull();
    });

    it('trả về null khi thiếu settings/subscription (dữ liệu chưa đồng bộ đủ)', async () => {
      prisma.organization.findUnique.mockResolvedValue(rawOrg);
      prisma.organizationSettings.findUnique.mockResolvedValue(null);
      prisma.organizationSubscription.findUnique.mockResolvedValue(
        rawSubscription,
      );
      const result = await repository.findById('org-1');
      expect(result).toBeNull();
    });

    it('trả về đủ aggregate khi có tất cả', async () => {
      prisma.organization.findUnique.mockResolvedValue(rawOrg);
      prisma.organizationSettings.findUnique.mockResolvedValue(rawSettings);
      prisma.organizationSubscription.findUnique.mockResolvedValue(
        rawSubscription,
      );
      const result = await repository.findById('org-1');
      expect(result?.organization.code).toBe('ORG000001');
    });
  });

  describe('findBySlug', () => {
    it('trả về null khi không tìm thấy', async () => {
      prisma.organization.findUnique.mockResolvedValue(null);
      await expect(repository.findBySlug('nope')).resolves.toBeNull();
    });

    it('trả về entity khi tìm thấy', async () => {
      prisma.organization.findUnique.mockResolvedValue(rawOrg);
      const result = await repository.findBySlug('acme');
      expect(result?.slug).toBe('acme');
    });
  });

  describe('search', () => {
    it('trả về danh sách phân trang', async () => {
      prisma.$transaction.mockResolvedValueOnce([[rawOrg], 1]);
      const result = await repository.search({ page: 1, limit: 20 });
      expect(result.total).toBe(1);
      expect(result.items[0].displayName).toBe('Acme');
    });
  });

  describe('update', () => {
    it('cập nhật và trả về entity', async () => {
      prisma.organization.update.mockResolvedValue({
        ...rawOrg,
        displayName: 'Acme Updated',
      });
      const result = await repository.update('org-1', {
        displayName: 'Acme Updated',
        updatedBy: 'admin-1',
      });
      expect(result.displayName).toBe('Acme Updated');
    });

    it('ném OrganizationTaxCodeConflictError khi taxCode trùng (P2002)', async () => {
      prisma.organization.update.mockRejectedValue(
        new Prisma.PrismaClientKnownRequestError('duplicate', {
          code: 'P2002',
          clientVersion: '6.19.3',
          meta: { target: ['taxCode'] },
        }),
      );
      await expect(
        repository.update('org-1', {
          taxCode: '999',
          updatedBy: 'admin-1',
        }),
      ).rejects.toThrow(OrganizationTaxCodeConflictError);
    });

    it('ném OrganizationEmailConflictError khi email trùng (P2002)', async () => {
      prisma.organization.update.mockRejectedValue(
        new Prisma.PrismaClientKnownRequestError('duplicate', {
          code: 'P2002',
          clientVersion: '6.19.3',
          meta: { target: ['email'] },
        }),
      );
      await expect(
        repository.update('org-1', {
          email: 'dup@acme.com',
          updatedBy: 'admin-1',
        }),
      ).rejects.toThrow(OrganizationEmailConflictError);
    });
  });

  describe('archive', () => {
    function makeClient(current: unknown) {
      const client = {
        organization: {
          findUnique: jest.fn().mockResolvedValue(current),
          update: jest
            .fn()
            .mockResolvedValue({ ...rawOrg, status: 'ARCHIVED' }),
        },
        user: { updateMany: jest.fn().mockResolvedValue({}) },
      };
      prisma.$transaction.mockImplementation((fn: (tx: unknown) => unknown) =>
        fn(client),
      );
      return client;
    }

    it('ném OrganizationNotActiveError khi Organization không tồn tại', async () => {
      makeClient(null);
      await expect(repository.archive('org-x', 'admin-1')).rejects.toThrow(
        OrganizationNotActiveError,
      );
    });

    it('ném OrganizationNotActiveError khi đã ARCHIVED từ trước', async () => {
      makeClient({ ...rawOrg, status: 'ARCHIVED' });
      await expect(repository.archive('org-1', 'admin-1')).rejects.toThrow(
        OrganizationNotActiveError,
      );
    });

    it('archive thành công, vô hiệu hóa toàn bộ User của Organization', async () => {
      const client = makeClient(rawOrg);
      const result = await repository.archive('org-1', 'admin-1');
      expect(result.status).toBe('ARCHIVED');
      expect(client.user.updateMany).toHaveBeenCalledWith({
        where: { organizationId: 'org-1' },
        data: { status: 'INACTIVE' },
      });
    });
  });

  describe('transferOwner', () => {
    it('ném OrganizationOwnerNotInOrganizationError khi User không tồn tại', async () => {
      prisma.user.findUnique.mockResolvedValue(null);
      await expect(
        repository.transferOwner('org-1', 'user-x', 'admin-1'),
      ).rejects.toThrow(OrganizationOwnerNotInOrganizationError);
    });

    it('ném OrganizationOwnerNotInOrganizationError khi User thuộc Organization khác', async () => {
      prisma.user.findUnique.mockResolvedValue({
        id: 'user-2',
        organizationId: 'org-2',
      });
      await expect(
        repository.transferOwner('org-1', 'user-2', 'admin-1'),
      ).rejects.toThrow(OrganizationOwnerNotInOrganizationError);
    });

    it('chuyển owner thành công khi User thuộc đúng Organization', async () => {
      prisma.user.findUnique.mockResolvedValue({
        id: 'user-2',
        organizationId: 'org-1',
      });
      prisma.organization.update.mockResolvedValue({
        ...rawOrg,
        ownerUserId: 'user-2',
      });
      const result = await repository.transferOwner(
        'org-1',
        'user-2',
        'admin-1',
      );
      expect(result.ownerUserId).toBe('user-2');
    });
  });

  describe('existsBySlug / existsByTaxCode / existsByEmail', () => {
    it('existsBySlug trả về true khi count > 0', async () => {
      prisma.organization.count.mockResolvedValue(1);
      await expect(repository.existsBySlug('acme')).resolves.toBe(true);
    });

    it('existsByTaxCode trả về false khi count = 0', async () => {
      prisma.organization.count.mockResolvedValue(0);
      await expect(repository.existsByTaxCode('999')).resolves.toBe(false);
    });

    it('existsByEmail trả về true khi count > 0', async () => {
      prisma.organization.count.mockResolvedValue(1);
      await expect(repository.existsByEmail('a@b.com')).resolves.toBe(true);
    });
  });
});
