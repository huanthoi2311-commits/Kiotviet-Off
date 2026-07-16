import type { Request } from 'express';
import { OrganizationService } from '../application/organization.service';
import { OrganizationController } from './organization.controller';

describe('OrganizationController', () => {
  let controller: OrganizationController;
  let organizationService: jest.Mocked<
    Pick<
      OrganizationService,
      | 'create'
      | 'search'
      | 'getCurrent'
      | 'getById'
      | 'update'
      | 'archive'
      | 'transferOwner'
    >
  >;

  const platformAdminUser = {
    sub: 'admin-1',
    organizationId: 'org-other',
    permissions: [],
    permissionVersion: 1,
    email: 'admin@platform.local',
    isPlatformAdmin: true,
  };
  const tenantUser = {
    sub: 'user-1',
    organizationId: 'org-1',
    permissions: [],
    permissionVersion: 1,
    email: 'user@acme.com',
    isPlatformAdmin: false,
  };
  const req = {
    ip: '127.0.0.1',
    headers: { 'user-agent': 'jest' },
  } as unknown as Request;

  beforeEach(() => {
    organizationService = {
      create: jest.fn(),
      search: jest.fn(),
      getCurrent: jest.fn(),
      getById: jest.fn(),
      update: jest.fn(),
      archive: jest.fn(),
      transferOwner: jest.fn(),
    };
    controller = new OrganizationController(
      organizationService as unknown as OrganizationService,
    );
  });

  it('create ủy quyền cho service kèm actor context (ip/userAgent, isPlatformAdmin)', async () => {
    organizationService.create.mockResolvedValue({ id: 'org-1' } as never);
    const dto = {
      organization: { displayName: 'Acme', slug: 'acme' },
      owner: { fullName: 'Owner', email: 'owner@acme.com', password: 'x' },
    } as never;

    await controller.create(dto, platformAdminUser as never, req);

    expect(organizationService.create).toHaveBeenCalledWith(dto, {
      userId: 'admin-1',
      organizationId: 'org-other',
      isPlatformAdmin: true,
      ip: '127.0.0.1',
      userAgent: 'jest',
    });
  });

  it('search ủy quyền cho service kèm query', async () => {
    organizationService.search.mockResolvedValue({
      items: [],
      total: 0,
      page: 1,
      limit: 20,
    });
    const query = { page: 1, limit: 20 } as never;
    await controller.search(query);
    expect(organizationService.search).toHaveBeenCalledWith(query);
  });

  it('getCurrent dùng actor từ JWT (không cần req)', async () => {
    organizationService.getCurrent.mockResolvedValue({ id: 'org-1' } as never);
    await controller.getCurrent(tenantUser as never);
    expect(organizationService.getCurrent).toHaveBeenCalledWith({
      userId: 'user-1',
      organizationId: 'org-1',
      isPlatformAdmin: false,
      ip: undefined,
      userAgent: undefined,
    });
  });

  it('getById ủy quyền cho service', async () => {
    organizationService.getById.mockResolvedValue({ id: 'org-1' } as never);
    await controller.getById('org-1', tenantUser as never);
    expect(organizationService.getById).toHaveBeenCalledWith(
      'org-1',
      expect.objectContaining({ userId: 'user-1' }),
    );
  });

  it('update ủy quyền cho service', async () => {
    organizationService.update.mockResolvedValue({ id: 'org-1' } as never);
    const dto = { displayName: 'Acme 2' } as never;
    await controller.update('org-1', dto, tenantUser as never);
    expect(organizationService.update).toHaveBeenCalledWith(
      'org-1',
      dto,
      expect.objectContaining({ userId: 'user-1' }),
    );
  });

  it('archive ủy quyền cho service', async () => {
    organizationService.archive.mockResolvedValue({ id: 'org-1' } as never);
    const dto = { confirmSlug: 'acme' } as never;
    await controller.archive('org-1', dto, tenantUser as never);
    expect(organizationService.archive).toHaveBeenCalledWith(
      'org-1',
      dto,
      expect.objectContaining({ userId: 'user-1' }),
    );
  });

  it('transferOwner ủy quyền cho service', async () => {
    organizationService.transferOwner.mockResolvedValue({
      id: 'org-1',
    } as never);
    const dto = { newOwnerUserId: 'user-2' } as never;
    await controller.transferOwner('org-1', dto, tenantUser as never);
    expect(organizationService.transferOwner).toHaveBeenCalledWith(
      'org-1',
      dto,
      expect.objectContaining({ userId: 'user-1' }),
    );
  });
});
