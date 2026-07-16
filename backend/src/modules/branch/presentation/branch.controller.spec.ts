import { Reflector } from '@nestjs/core';
import { PERMISSIONS_KEY } from '../../rbac/presentation/permissions.decorator';
import { BranchService } from '../application/branch.service';
import { BranchController } from './branch.controller';

describe('BranchController', () => {
  let controller: BranchController;
  let branchService: jest.Mocked<
    Pick<
      BranchService,
      'create' | 'search' | 'getById' | 'update' | 'archive' | 'setDefault'
    >
  >;
  const reflector = new Reflector();

  const user = {
    sub: 'user-1',
    organizationId: 'org-1',
    permissions: [],
    permissionVersion: 1,
    email: 'a@b.com',
    isPlatformAdmin: false,
  };

  beforeEach(() => {
    branchService = {
      create: jest.fn(),
      search: jest.fn(),
      getById: jest.fn(),
      update: jest.fn(),
      archive: jest.fn(),
      setDefault: jest.fn(),
    };
    controller = new BranchController(
      branchService as unknown as BranchService,
    );
  });

  it.each([
    ['create', 'branch:create'],
    ['search', 'branch:view'],
    ['getById', 'branch:view'],
    ['update', 'branch:update'],
    ['archive', 'branch:archive'],
    ['setDefault', 'branch:set-default'],
  ])('method %s yêu cầu permission %s', (method, expectedPermission) => {
    const permissions = reflector.get<string[]>(
      PERMISSIONS_KEY,
      (controller as unknown as Record<string, () => void>)[method],
    );
    expect(permissions).toEqual([expectedPermission]);
  });

  it('create ủy quyền cho service kèm actor context', async () => {
    branchService.create.mockResolvedValue({ id: 'branch-1' } as never);
    const dto = { name: 'Chi nhánh HN' } as never;
    await controller.create(dto, user as never);
    expect(branchService.create).toHaveBeenCalledWith(dto, {
      userId: 'user-1',
      organizationId: 'org-1',
    });
  });

  it('search ủy quyền cho service', async () => {
    branchService.search.mockResolvedValue({
      items: [],
      total: 0,
      page: 1,
      limit: 20,
    });
    const query = { page: 1, limit: 20 } as never;
    await controller.search(query, user as never);
    expect(branchService.search).toHaveBeenCalledWith(query, {
      userId: 'user-1',
      organizationId: 'org-1',
    });
  });

  it('getById ủy quyền cho service', async () => {
    branchService.getById.mockResolvedValue({ id: 'branch-1' } as never);
    await controller.getById('branch-1', user as never);
    expect(branchService.getById).toHaveBeenCalledWith('branch-1', {
      userId: 'user-1',
      organizationId: 'org-1',
    });
  });

  it('update ủy quyền cho service', async () => {
    branchService.update.mockResolvedValue({ id: 'branch-1' } as never);
    const dto = { name: 'HN 2' } as never;
    await controller.update('branch-1', dto, user as never);
    expect(branchService.update).toHaveBeenCalledWith('branch-1', dto, {
      userId: 'user-1',
      organizationId: 'org-1',
    });
  });

  it('archive ủy quyền cho service', async () => {
    branchService.archive.mockResolvedValue({ id: 'branch-1' } as never);
    await controller.archive('branch-1', user as never);
    expect(branchService.archive).toHaveBeenCalledWith('branch-1', {
      userId: 'user-1',
      organizationId: 'org-1',
    });
  });

  it('setDefault ủy quyền cho service', async () => {
    branchService.setDefault.mockResolvedValue({ id: 'branch-1' } as never);
    await controller.setDefault('branch-1', user as never);
    expect(branchService.setDefault).toHaveBeenCalledWith('branch-1', {
      userId: 'user-1',
      organizationId: 'org-1',
    });
  });
});
