import { Prisma } from '@prisma/client';
import { AuthUserEntity } from '../entities/auth-user.entity';

export interface IAuthUserRepository {
  /**
   * Định danh đăng nhập = organizationSlug + email (KHÔNG dùng email đơn lẻ)
   * vì email chỉ unique trong phạm vi 1 tổ chức (multi-tenant, `@@unique([organizationId, email])`).
   * Trả về null nếu slug không tồn tại hoặc email không thuộc tổ chức đó.
   */
  findByOrganizationSlugAndEmail(
    organizationSlug: string,
    email: string,
  ): Promise<AuthUserEntity | null>;
  findById(id: string): Promise<AuthUserEntity | null>;
  /**
   * T053.06B-2 (D5) — `tx?` optional, cùng mẫu hình đã duyệt ở `IVoucherRepository.incrementUsage()`
   * (CheckoutService) — cho phép caller bọc lệnh này CHUNG 1 `prisma.$transaction()` với thao tác
   * khác (ở đây: `ISessionRepository.revokeAllForUser()`, xuyên bảng User/Session, đúng
   * CODING_RULES.md §27). Không truyền `tx` vẫn hoạt động độc lập như trước (dùng `this.prisma`).
   */
  updatePasswordHash(
    userId: string,
    passwordHash: string,
    tx?: Prisma.TransactionClient,
  ): Promise<void>;
  updateLastLoginAt(userId: string): Promise<void>;
}

export const AUTH_USER_REPOSITORY = Symbol('AUTH_USER_REPOSITORY');
