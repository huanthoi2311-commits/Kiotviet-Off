import { CartEntity } from '../domain/entities/cart.entity';
import { ICartRepository } from '../domain/repositories/cart.repository.interface';
import { CartDomainService } from './cart-domain.service';

describe('CartDomainService', () => {
  let service: CartDomainService;
  let cartRepository: jest.Mocked<
    Pick<ICartRepository, 'findByUserId' | 'delete'>
  >;

  const makeCart = (): CartEntity => ({
    organizationId: 'org-1',
    userId: 'user-1',
    items: [],
    subtotal: '0.00',
    totalDiscount: '0.00',
    totalPromotion: '0.00',
    totalVoucher: '0.00',
    totalTax: '0.00',
    totalAmount: '0.00',
    updatedAt: new Date().toISOString(),
  });

  beforeEach(() => {
    cartRepository = { findByUserId: jest.fn(), delete: jest.fn() };
    service = new CartDomainService(
      cartRepository as unknown as ICartRepository,
    );
  });

  describe('findByUserId', () => {
    it('ủy quyền cho repository.findByUserId', async () => {
      cartRepository.findByUserId.mockResolvedValue(makeCart());
      const result = await service.findByUserId('org-1', 'user-1');
      expect(result?.userId).toBe('user-1');
      expect(cartRepository.findByUserId).toHaveBeenCalledWith(
        'org-1',
        'user-1',
      );
    });

    it('trả về null khi không có cart', async () => {
      cartRepository.findByUserId.mockResolvedValue(null);
      await expect(service.findByUserId('org-1', 'user-1')).resolves.toBeNull();
    });
  });

  describe('clearAfterCheckout', () => {
    it('ủy quyền cho repository.delete', async () => {
      await service.clearAfterCheckout('org-1', 'user-1');
      expect(cartRepository.delete).toHaveBeenCalledWith('org-1', 'user-1');
    });
  });
});
