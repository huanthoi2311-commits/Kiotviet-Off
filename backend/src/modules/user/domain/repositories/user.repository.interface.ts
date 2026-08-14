import { UserEntity, UserStatus } from '../entities/user.entity';

export interface CreateUserInput {
  organizationId: string;
  branchId?: string | null;
  username: string;
  fullName?: string | null;
  email: string;
  phone?: string | null;
  passwordHash: string;
  createdBy: string;
}

export interface UpdateUserInput {
  branchId?: string | null;
  fullName?: string | null;
  phone?: string | null;
  avatar?: string | null;
  updatedBy: string;
}

export interface UserSearchParams {
  organizationId: string;
  search?: string;
  status?: UserStatus;
  page: number;
  limit: number;
}

export interface UserSearchResult {
  items: UserEntity[];
  total: number;
  page: number;
  limit: number;
}

export class UserUsernameConflictError extends Error {
  constructor(public readonly username: string) {
    super(`Tên đăng nhập "${username}" đã được sử dụng trong tổ chức`);
  }
}

export class UserEmailConflictError extends Error {
  constructor(public readonly email: string) {
    super(`Email "${email}" đã được sử dụng trong tổ chức`);
  }
}

/**
 * T052.02 — mọi lookup theo id BẮT BUỘC nhận organizationId, không có bản "unscoped findById" nào
 * được expose cho UserService (Architect Decision — repository contract). Không có
 * version/optimistic-lock (D6 — profile update là last-write-wins ở version này).
 */
export interface IUserRepository {
  /** Cross-tenant hoặc không tồn tại đều trả `null` như nhau — không phân biệt (non-disclosure). */
  findById(id: string, organizationId: string): Promise<UserEntity | null>;
  search(params: UserSearchParams): Promise<UserSearchResult>;
  existsByUsername(organizationId: string, username: string): Promise<boolean>;
  existsByEmail(organizationId: string, email: string): Promise<boolean>;
  /** Ném UserUsernameConflictError/UserEmailConflictError nếu vi phạm unique constraint DB (P2002)
   * — lớp bảo vệ cuối, không chỉ dựa vào pre-check existsByUsername/existsByEmail. */
  create(input: CreateUserInput): Promise<UserEntity>;
  update(
    id: string,
    organizationId: string,
    input: UpdateUserInput,
  ): Promise<UserEntity>;
  updateStatus(
    id: string,
    organizationId: string,
    status: UserStatus,
    updatedBy: string,
  ): Promise<UserEntity>;
  updatePasswordHash(
    id: string,
    organizationId: string,
    passwordHash: string,
    updatedBy: string,
  ): Promise<void>;
}

export const USER_REPOSITORY = Symbol('USER_REPOSITORY');
