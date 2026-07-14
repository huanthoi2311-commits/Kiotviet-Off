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
  updatePasswordHash(userId: string, passwordHash: string): Promise<void>;
  updateLastLoginAt(userId: string): Promise<void>;
}

export const AUTH_USER_REPOSITORY = Symbol('AUTH_USER_REPOSITORY');
