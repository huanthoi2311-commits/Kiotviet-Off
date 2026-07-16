import {
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import type { IPasswordHasher } from '../../auth/domain/services/password-hasher.interface';
import {
  OrganizationEmailConflictError,
  OrganizationNotActiveError,
  OrganizationOwnerNotInOrganizationError,
  OrganizationSlugConflictError,
  OrganizationTaxCodeConflictError,
} from '../domain/repositories/organization.repository.interface';
import type { IOrganizationRepository } from '../domain/repositories/organization.repository.interface';
import type { IOrganizationCodeGenerator } from '../domain/services/organization-code-generator.interface';
import { ActorContext, OrganizationService } from './organization.service';

describe('OrganizationService', () => {
  let service: OrganizationService;
  let organizationRepository: jest.Mocked<IOrganizationRepository>;
  let codeGenerator: jest.Mocked<IOrganizationCodeGenerator>;
  let passwordHasher: jest.Mocked<IPasswordHasher>;

  const platformAdminActor: ActorContext = {
    userId: 'admin-1',
    organizationId: 'org-other',
    isPlatformAdmin: true,
  };
  const tenantActor: ActorContext = {
    userId: 'user-1',
    organizationId: 'org-1',
    isPlatformAdmin: false,
  };

  const aggregate = {
    organization: {
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
      status: 'ACTIVE' as const,
      ownerUserId: 'user-1',
      createdAt: new Date('2026-01-01'),
      updatedAt: new Date('2026-01-01'),
    },
    settings: {
      organizationId: 'org-1',
      allowNegativeInventory: false,
      allowBackDate: false,
      decimalQuantity: 0,
      decimalPrice: 0,
      defaultWarehouseId: null,
      defaultBranchId: null,
      defaultLanguage: 'vi',
      defaultCurrency: 'VND',
    },
    subscription: {
      organizationId: 'org-1',
      plan: 'FREE' as const,
      status: 'ACTIVE' as const,
      startedAt: new Date('2026-01-01'),
      expiredAt: null,
      maxBranch: null,
      maxUser: null,
      maxWarehouse: null,
      maxProduct: null,
      maxCustomer: null,
      storageLimitGB: null,
    },
  };

  beforeEach(() => {
    organizationRepository = {
      createWithOwner: jest.fn(),
      findById: jest.fn(),
      findBySlug: jest.fn(),
      search: jest.fn(),
      update: jest.fn(),
      archive: jest.fn(),
      transferOwner: jest.fn(),
      existsBySlug: jest.fn(),
      existsByTaxCode: jest.fn(),
      existsByEmail: jest.fn(),
    };
    codeGenerator = { generate: jest.fn() };
    passwordHasher = { hash: jest.fn(), verify: jest.fn() };
    service = new OrganizationService(
      organizationRepository,
      codeGenerator,
      passwordHasher,
    );
  });

  describe('create', () => {
    const dto = {
      organization: { displayName: 'Acme', slug: 'acme' },
      owner: {
        fullName: 'Owner Name',
        email: 'owner@acme.com',
        password: 'Password123',
      },
    };

    it('ném ConflictException khi slug đã tồn tại', async () => {
      organizationRepository.existsBySlug.mockResolvedValue(true);
      await expect(service.create(dto, platformAdminActor)).rejects.toThrow(
        ConflictException,
      );
      expect(codeGenerator.generate).not.toHaveBeenCalled();
    });

    it('ném ConflictException khi taxCode đã tồn tại', async () => {
      organizationRepository.existsBySlug.mockResolvedValue(false);
      organizationRepository.existsByTaxCode.mockResolvedValue(true);
      await expect(
        service.create(
          { ...dto, organization: { ...dto.organization, taxCode: '999' } },
          platformAdminActor,
        ),
      ).rejects.toThrow(ConflictException);
    });

    it('tạo thành công: sinh code, hash password, derive username từ email', async () => {
      organizationRepository.existsBySlug.mockResolvedValue(false);
      codeGenerator.generate.mockResolvedValue('ORG000001');
      passwordHasher.hash.mockResolvedValue('hashed-password');
      organizationRepository.createWithOwner.mockResolvedValue(aggregate);

      const result = await service.create(dto, platformAdminActor);

      expect(passwordHasher.hash).toHaveBeenCalledWith('Password123');
      expect(organizationRepository.createWithOwner).toHaveBeenCalledWith(
        expect.objectContaining({
          code: 'ORG000001',
          owner: expect.objectContaining({
            username: 'owner',
            email: 'owner@acme.com',
            passwordHash: 'hashed-password',
          }),
        }),
        'admin-1',
        expect.any(Object),
      );
      expect(result.code).toBe('ORG000001');
      expect(result.settings.defaultCurrency).toBe('VND');
    });

    it('map OrganizationSlugConflictError (race condition) -> ConflictException', async () => {
      organizationRepository.existsBySlug.mockResolvedValue(false);
      codeGenerator.generate.mockResolvedValue('ORG000001');
      passwordHasher.hash.mockResolvedValue('hashed');
      organizationRepository.createWithOwner.mockRejectedValue(
        new OrganizationSlugConflictError('acme'),
      );
      await expect(service.create(dto, platformAdminActor)).rejects.toThrow(
        ConflictException,
      );
    });
  });

  describe('getById / getCurrent', () => {
    it('ném ForbiddenException khi user thường truy cập Organization khác', async () => {
      await expect(
        service.getById('org-other-id', tenantActor),
      ).rejects.toThrow(ForbiddenException);
      expect(organizationRepository.findById).not.toHaveBeenCalled();
    });

    it('cho phép Platform Admin truy cập bất kỳ Organization nào', async () => {
      organizationRepository.findById.mockResolvedValue(aggregate);
      const result = await service.getById('org-1', platformAdminActor);
      expect(result.id).toBe('org-1');
    });

    it('ném NotFoundException khi Organization không tồn tại', async () => {
      organizationRepository.findById.mockResolvedValue(null);
      await expect(service.getById('org-1', tenantActor)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('getCurrent dùng đúng actor.organizationId', async () => {
      organizationRepository.findById.mockResolvedValue(aggregate);
      await service.getCurrent(tenantActor);
      expect(organizationRepository.findById).toHaveBeenCalledWith('org-1');
    });
  });

  describe('search', () => {
    it('trả về danh sách phân trang', async () => {
      organizationRepository.search.mockResolvedValue({
        items: [aggregate.organization],
        total: 1,
        page: 1,
        limit: 20,
      });
      const result = await service.search({});
      expect(result.total).toBe(1);
    });
  });

  describe('update', () => {
    it('ném ForbiddenException khi khác Organization Context', async () => {
      await expect(
        service.update('org-other-id', {}, tenantActor),
      ).rejects.toThrow(ForbiddenException);
    });

    it('cập nhật thành công', async () => {
      organizationRepository.update.mockResolvedValue(aggregate.organization);
      const result = await service.update(
        'org-1',
        { displayName: 'Acme 2' },
        tenantActor,
      );
      expect(result.displayName).toBe('Acme');
      expect(organizationRepository.update).toHaveBeenCalledWith(
        'org-1',
        expect.objectContaining({ displayName: 'Acme 2', updatedBy: 'user-1' }),
      );
    });

    it('map OrganizationEmailConflictError -> ConflictException', async () => {
      organizationRepository.update.mockRejectedValue(
        new OrganizationEmailConflictError('dup@acme.com'),
      );
      await expect(
        service.update('org-1', { email: 'dup@acme.com' }, tenantActor),
      ).rejects.toThrow(ConflictException);
    });
  });

  describe('archive', () => {
    it('ném NotFoundException khi Organization không tồn tại', async () => {
      organizationRepository.findById.mockResolvedValue(null);
      await expect(
        service.archive('org-1', { confirmSlug: 'acme' }, tenantActor),
      ).rejects.toThrow(NotFoundException);
    });

    it('ném ConflictException khi confirmSlug không khớp (xác nhận 2 bước thất bại)', async () => {
      organizationRepository.findById.mockResolvedValue(aggregate);
      await expect(
        service.archive('org-1', { confirmSlug: 'wrong-slug' }, tenantActor),
      ).rejects.toThrow(ConflictException);
      expect(organizationRepository.archive).not.toHaveBeenCalled();
    });

    it('archive thành công khi confirmSlug khớp', async () => {
      organizationRepository.findById.mockResolvedValue(aggregate);
      organizationRepository.archive.mockResolvedValue({
        ...aggregate.organization,
        status: 'ARCHIVED',
      });
      const result = await service.archive(
        'org-1',
        { confirmSlug: 'acme' },
        tenantActor,
      );
      expect(result.status).toBe('ARCHIVED');
    });

    it('map OrganizationNotActiveError -> ConflictException', async () => {
      organizationRepository.findById.mockResolvedValue(aggregate);
      organizationRepository.archive.mockRejectedValue(
        new OrganizationNotActiveError('org-1'),
      );
      await expect(
        service.archive('org-1', { confirmSlug: 'acme' }, tenantActor),
      ).rejects.toThrow(ConflictException);
    });
  });

  describe('transferOwner', () => {
    it('ném ForbiddenException khi khác Organization Context', async () => {
      await expect(
        service.transferOwner(
          'org-other-id',
          { newOwnerUserId: 'user-2' },
          tenantActor,
        ),
      ).rejects.toThrow(ForbiddenException);
    });

    it('chuyển owner thành công', async () => {
      organizationRepository.transferOwner.mockResolvedValue({
        ...aggregate.organization,
        ownerUserId: 'user-2',
      });
      const result = await service.transferOwner(
        'org-1',
        { newOwnerUserId: 'user-2' },
        tenantActor,
      );
      expect(result.ownerUserId).toBe('user-2');
    });

    it('map OrganizationOwnerNotInOrganizationError -> ConflictException', async () => {
      organizationRepository.transferOwner.mockRejectedValue(
        new OrganizationOwnerNotInOrganizationError('user-2'),
      );
      await expect(
        service.transferOwner(
          'org-1',
          { newOwnerUserId: 'user-2' },
          tenantActor,
        ),
      ).rejects.toThrow(ConflictException);
    });
  });
});
