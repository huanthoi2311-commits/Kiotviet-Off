import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { PERMISSIONS_KEY } from '../../rbac/presentation/permissions.decorator';
import { ActorContext, TransferService } from '../application/transfer.service';
import { TransferController } from './transfer.controller';

describe('TransferController', () => {
  let controller: TransferController;
  let transferService: jest.Mocked<
    Pick<
      TransferService,
      'create' | 'search' | 'findOne' | 'approve' | 'receive' | 'cancel'
    >
  >;
  const reflector = new Reflector();

  const user = {
    sub: 'user-1',
    organizationId: 'org-1',
    permissions: [],
    permissionVersion: 1,
    email: 'a@b.com',
  };
  const req = {
    ip: '127.0.0.1',
    headers: { 'user-agent': 'jest' },
  } as unknown as Request;

  beforeEach(() => {
    transferService = {
      create: jest.fn(),
      search: jest.fn(),
      findOne: jest.fn(),
      approve: jest.fn(),
      receive: jest.fn(),
      cancel: jest.fn(),
    };
    controller = new TransferController(
      transferService as unknown as TransferService,
    );
  });

  describe('permission metadata (Prompt 023)', () => {
    it.each([
      ['create', 'transfer:create'],
      ['search', 'transfer:view'],
      ['findOne', 'transfer:view'],
      ['approve', 'transfer:approve'],
      ['receive', 'transfer:receive'],
      ['cancel', 'transfer:cancel'],
    ])('method %s yêu cầu permission %s', (method, expectedPermission) => {
      const permissions = reflector.get<string[]>(
        PERMISSIONS_KEY,
        (controller as unknown as Record<string, () => void>)[method],
      );
      expect(permissions).toEqual([expectedPermission]);
    });
  });

  it('create ủy quyền cho service kèm actor context', async () => {
    transferService.create.mockResolvedValue({ id: 'transfer-1' } as never);
    const dto = {
      fromWarehouseId: 'wh-a',
      toWarehouseId: 'wh-b',
      items: [],
    } as never;
    await controller.create(dto, user as never, req);

    const actor: ActorContext = transferService.create.mock.calls[0][1];
    expect(actor).toEqual({
      userId: 'user-1',
      organizationId: 'org-1',
      ip: '127.0.0.1',
      userAgent: 'jest',
    });
  });

  it('search chỉ truyền query và organizationId', async () => {
    transferService.search.mockResolvedValue({
      items: [],
      total: 0,
      page: 1,
      limit: 20,
    });
    const query = { status: 'PENDING' } as never;
    await controller.search(query, user as never);
    expect(transferService.search).toHaveBeenCalledWith(query, 'org-1');
  });

  it('findOne ủy quyền cho service.findOne kèm organizationId', async () => {
    transferService.findOne.mockResolvedValue({ id: 'transfer-1' } as never);
    const result = await controller.findOne('transfer-1', user as never);
    expect(transferService.findOne).toHaveBeenCalledWith('transfer-1', 'org-1');
    expect(result).toEqual({ id: 'transfer-1' });
  });

  it('approve ủy quyền cho service.approve kèm actor context', async () => {
    transferService.approve.mockResolvedValue({
      id: 'transfer-1',
      status: 'APPROVED',
    } as never);
    const result = await controller.approve('transfer-1', user as never, req);
    expect(transferService.approve).toHaveBeenCalledWith(
      'transfer-1',
      expect.any(Object),
    );
    expect(result).toEqual({ id: 'transfer-1', status: 'APPROVED' });
  });

  it('receive ủy quyền cho service.receive kèm actor context', async () => {
    transferService.receive.mockResolvedValue({
      id: 'transfer-1',
      status: 'RECEIVED',
    } as never);
    await controller.receive('transfer-1', user as never, req);
    expect(transferService.receive).toHaveBeenCalledWith(
      'transfer-1',
      expect.any(Object),
    );
  });

  it('cancel ủy quyền cho service.cancel kèm actor context', async () => {
    transferService.cancel.mockResolvedValue({
      id: 'transfer-1',
      status: 'CANCELLED',
    } as never);
    await controller.cancel('transfer-1', user as never, req);
    expect(transferService.cancel).toHaveBeenCalledWith(
      'transfer-1',
      expect.any(Object),
    );
  });
});
