import { Reflector } from '@nestjs/core';
import { PERMISSIONS_KEY } from '../../rbac/presentation/permissions.decorator';
import { ActorContext, CartService } from '../application/cart.service';
import { CartController } from './cart.controller';

describe('CartController', () => {
  let controller: CartController;
  let cartService: jest.Mocked<
    Pick<
      CartService,
      'getCart' | 'addItem' | 'updateItem' | 'removeItem' | 'clear'
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

  beforeEach(() => {
    cartService = {
      getCart: jest.fn(),
      addItem: jest.fn(),
      updateItem: jest.fn(),
      removeItem: jest.fn(),
      clear: jest.fn(),
    };
    controller = new CartController(cartService as unknown as CartService);
  });

  it('yêu cầu quyền pos:access ở cấp Controller — áp dụng cho toàn bộ endpoint', () => {
    const permissions = reflector.get<string[]>(
      PERMISSIONS_KEY,
      CartController,
    );
    expect(permissions).toEqual(['pos:access']);
  });

  it('getCart ủy quyền cho service kèm actor context', async () => {
    cartService.getCart.mockResolvedValue({
      items: [],
    } as never);
    await controller.getCart(user as never);
    const actor: ActorContext = cartService.getCart.mock.calls[0][0];
    expect(actor).toEqual({ userId: 'user-1', organizationId: 'org-1' });
  });

  it('add ủy quyền cho service kèm dto + actor context', async () => {
    cartService.addItem.mockResolvedValue({ items: [] } as never);
    const dto = { productId: 'prod-1', quantity: 2 } as never;
    await controller.add(dto, user as never);
    expect(cartService.addItem).toHaveBeenCalledWith(dto, {
      userId: 'user-1',
      organizationId: 'org-1',
    });
  });

  it('update ủy quyền cho service kèm dto + actor context', async () => {
    cartService.updateItem.mockResolvedValue({ items: [] } as never);
    const dto = { productId: 'prod-1', quantity: 5 } as never;
    await controller.update(dto, user as never);
    expect(cartService.updateItem).toHaveBeenCalledWith(dto, {
      userId: 'user-1',
      organizationId: 'org-1',
    });
  });

  it('remove ủy quyền cho service kèm dto + actor context', async () => {
    cartService.removeItem.mockResolvedValue({ items: [] } as never);
    const dto = { productId: 'prod-1' } as never;
    await controller.remove(dto, user as never);
    expect(cartService.removeItem).toHaveBeenCalledWith(dto, {
      userId: 'user-1',
      organizationId: 'org-1',
    });
  });

  it('clear ủy quyền cho service kèm actor context', async () => {
    cartService.clear.mockResolvedValue({ items: [] } as never);
    await controller.clear(user as never);
    expect(cartService.clear).toHaveBeenCalledWith({
      userId: 'user-1',
      organizationId: 'org-1',
    });
  });
});
