import { CartEntity } from '../entities/cart.entity';

/**
 * "Một User → Một Cart" (Prompt 033) — key theo cặp (organizationId, userId), không có id riêng
 * cho Cart. Redis là nguồn dữ liệu DUY NHẤT (Cart Entity không map bảng Postgres nào).
 */
export interface ICartRepository {
  findByUserId(
    organizationId: string,
    userId: string,
  ): Promise<CartEntity | null>;
  /** Ghi đè toàn bộ cart + reset TTL 30 phút kể từ lần ghi này. */
  save(cart: CartEntity): Promise<void>;
  delete(organizationId: string, userId: string): Promise<void>;
}

export const CART_REPOSITORY = Symbol('CART_REPOSITORY');
