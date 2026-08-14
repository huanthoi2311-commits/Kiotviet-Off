import {
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { AuditLogService } from '../../platform/audit-log/audit-log.service';
import { ErrorCode } from '../../../common/errors/error-codes';
import { withCode } from '../../../common/errors/with-code';
import { AuthService } from '../../auth/application/auth.service';
import { PASSWORD_HASHER } from '../../auth/domain/services/password-hasher.interface';
import type { IPasswordHasher } from '../../auth/domain/services/password-hasher.interface';
import { BranchService } from '../../branch/application/branch.service';
import { ORGANIZATION_REPOSITORY } from '../../organization/domain/repositories/organization.repository.interface';
import type { IOrganizationRepository } from '../../organization/domain/repositories/organization.repository.interface';
import { RbacService } from '../../rbac/application/rbac.service';
import { UserEntity } from '../domain/entities/user.entity';
import {
  USER_REPOSITORY,
  UserEmailConflictError,
  UserUsernameConflictError,
} from '../domain/repositories/user.repository.interface';
import type { IUserRepository } from '../domain/repositories/user.repository.interface';
import { CreateUserDto } from './dto/create-user.dto';
import { ResetUserPasswordDto } from './dto/reset-user-password.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import {
  PaginatedUserResponseDto,
  UserDetailResponseDto,
  UserResponseDto,
} from './dto/user-response.dto';
import { UserQueryDto } from './dto/user-query.dto';
import { UserMapper } from './mappers/user.mapper';

export interface ActorContext {
  userId: string;
  organizationId: string;
  ip?: string | null;
  userAgent?: string | null;
}

@Injectable()
export class UserService {
  constructor(
    @Inject(USER_REPOSITORY)
    private readonly userRepository: IUserRepository,
    @Inject(PASSWORD_HASHER)
    private readonly passwordHasher: IPasswordHasher,
    @Inject(ORGANIZATION_REPOSITORY)
    private readonly organizationRepository: IOrganizationRepository,
    private readonly branchService: BranchService,
    private readonly authService: AuthService,
    private readonly rbacService: RbacService,
    private readonly auditLogService: AuditLogService,
  ) {}

  async search(
    query: UserQueryDto,
    organizationId: string,
  ): Promise<PaginatedUserResponseDto> {
    const result = await this.userRepository.search({
      organizationId,
      search: query.search,
      status: query.status,
      page: query.page ?? 1,
      limit: query.limit ?? 20,
    });

    return {
      items: result.items.map((item) => UserMapper.toResponseDto(item)),
      total: result.total,
      page: result.page,
      limit: result.limit,
    };
  }

  /** T052.02 §RBAC DETAIL INTEGRATION — chi tiết kèm role codes hiện tại (list KHÔNG kèm, giữ rẻ). */
  async findOne(
    id: string,
    organizationId: string,
  ): Promise<UserDetailResponseDto> {
    const user = await this.userRepository.findById(id, organizationId);
    if (!user) throw this.notFound();
    const roleCodes = await this.rbacService.getRoleCodesForUser(
      id,
      organizationId,
    );
    return UserMapper.toDetailResponseDto(user, roleCodes);
  }

  async create(
    dto: CreateUserDto,
    actor: ActorContext,
  ): Promise<UserResponseDto> {
    await this.assertUsernameNotDuplicate(actor.organizationId, dto.username);
    await this.assertEmailNotDuplicate(actor.organizationId, dto.email);

    // branchId là tenant-owned (foreign id) — bắt buộc xác minh thuộc actor.organizationId qua
    // đúng port công khai đã duyệt (BranchService.getById, T051.06A) trước khi tạo User, cùng
    // pattern đã dùng lặp lại ở SupplierDebtService (T052.01) — không dựa vào FK Prisma đơn thuần
    // (chỉ đảm bảo Branch TỒN TẠI ở đâu đó, không đảm bảo đúng tổ chức).
    if (dto.branchId) {
      await this.branchService.getById(dto.branchId, {
        userId: actor.userId,
        organizationId: actor.organizationId,
      });
    }

    const passwordHash = await this.passwordHasher.hash(dto.password);

    let created: UserEntity;
    try {
      created = await this.userRepository.create({
        organizationId: actor.organizationId,
        branchId: dto.branchId ?? null,
        username: dto.username,
        fullName: dto.fullName ?? null,
        email: dto.email,
        phone: dto.phone ?? null,
        passwordHash,
        createdBy: actor.userId,
      });
    } catch (error) {
      throw this.translateConflictError(error);
    }

    await this.auditLogService.log({
      organizationId: actor.organizationId,
      userId: actor.userId,
      action: 'user.create',
      entityType: 'User',
      entityId: created.id,
      newValue: this.toAuditSnapshot(created),
      ip: actor.ip,
      userAgent: actor.userAgent,
    });

    return UserMapper.toResponseDto(created);
  }

  async update(
    id: string,
    dto: UpdateUserDto,
    actor: ActorContext,
  ): Promise<UserResponseDto> {
    const existing = await this.userRepository.findById(
      id,
      actor.organizationId,
    );
    if (!existing) throw this.notFound();

    if (dto.branchId) {
      await this.branchService.getById(dto.branchId, {
        userId: actor.userId,
        organizationId: actor.organizationId,
      });
    }

    const updated = await this.userRepository.update(id, actor.organizationId, {
      branchId: dto.branchId,
      fullName: dto.fullName,
      phone: dto.phone,
      avatar: dto.avatar,
      updatedBy: actor.userId,
    });

    await this.auditLogService.log({
      organizationId: actor.organizationId,
      userId: actor.userId,
      action: 'user.update',
      entityType: 'User',
      entityId: id,
      oldValue: this.toAuditSnapshot(existing),
      newValue: this.toAuditSnapshot(updated),
      ip: actor.ip,
      userAgent: actor.userAgent,
    });

    return UserMapper.toResponseDto(updated);
  }

  /**
   * D1/D2 — thứ tự BẮT BUỘC để giữ đúng tính an toàn: (1) target thuộc actor.organizationId,
   * (2) target != actor (không tự vô hiệu hóa chính mình), (3) target != Organization.ownerUserId
   * (không vô hiệu hóa Owner) — CẢ BA đều PHẢI qua trước khi ghi status. Sau đó set
   * status=INACTIVE, rồi thu hồi TOÀN BỘ session của target qua đúng boundary đã duyệt (D5,
   * AuthService.revokeAllSessionsForUser — KHÔNG inject SESSION_REPOSITORY trực tiếp).
   *
   * Phân tích an toàn thứ tự ghi (status trước, session sau, KHÔNG bọc trong 1 transaction chung
   * 2 module) — xem `docs/implementation/t052-02b-*` / MANUAL MERGE REQUIRED report: bằng chứng
   * tươi từ `JwtAccessStrategy.validate()` (kiểm tra `user.status === 'ACTIVE'` LIVE từ DB ở MỌI
   * request) và `AuthService.refreshToken()` (kiểm tra tương tự trước khi cấp access token mới)
   * chứng minh việc set status=INACTIVE đơn lẻ ĐÃ ĐỦ để khóa hoàn toàn user khỏi API, bất kể việc
   * thu hồi session ở bước sau có thành công hay không — thu hồi session chỉ là vệ sinh dữ liệu
   * (để danh sách session không còn hiển thị "đang hoạt động"), không phải lớp bảo vệ chính. Đây
   * CHÍNH XÁC là thứ tự không-transaction đã được chấp nhận và đang chạy thật ở
   * `ForgotPasswordService.resetPassword()` (đổi passwordHash rồi revokeAllForUser, không bọc
   * transaction) — tái dùng nguyên trạng, không phát minh cơ chế 2-phase-commit mới.
   */
  async deactivate(id: string, actor: ActorContext): Promise<UserResponseDto> {
    const existing = await this.userRepository.findById(
      id,
      actor.organizationId,
    );
    if (!existing) throw this.notFound();

    if (id === actor.userId) {
      throw new UnprocessableEntityException(
        withCode(
          ErrorCode.USER_CANNOT_DEACTIVATE_SELF,
          'Không thể tự vô hiệu hóa chính mình',
        ),
      );
    }

    const organization = await this.organizationRepository.findById(
      actor.organizationId,
    );
    if (organization?.organization.ownerUserId === id) {
      throw new UnprocessableEntityException(
        withCode(
          ErrorCode.USER_CANNOT_DEACTIVATE_OWNER,
          'Không thể vô hiệu hóa chủ sở hữu tổ chức',
        ),
      );
    }

    if (existing.status !== 'ACTIVE') {
      throw new UnprocessableEntityException(
        withCode(
          ErrorCode.USER_INVALID_TRANSITION,
          `Không thể chuyển user từ trạng thái ${existing.status} sang INACTIVE`,
        ),
      );
    }

    const updated = await this.userRepository.updateStatus(
      id,
      actor.organizationId,
      'INACTIVE',
      actor.userId,
    );
    await this.authService.revokeAllSessionsForUser(id);

    await this.auditLogService.log({
      organizationId: actor.organizationId,
      userId: actor.userId,
      action: 'user.deactivate',
      entityType: 'User',
      entityId: id,
      oldValue: this.toAuditSnapshot(existing),
      newValue: this.toAuditSnapshot(updated),
      ip: actor.ip,
      userAgent: actor.userAgent,
    });

    return UserMapper.toResponseDto(updated);
  }

  /** INACTIVE → ACTIVE. Không đụng session, không tự issue token (D — REACTIVATE). Đã-ACTIVE bị
   * từ chối cùng USER_INVALID_TRANSITION, nhất quán với quy ước lifecycle Customer/Supplier. */
  async reactivate(id: string, actor: ActorContext): Promise<UserResponseDto> {
    const existing = await this.userRepository.findById(
      id,
      actor.organizationId,
    );
    if (!existing) throw this.notFound();

    if (existing.status !== 'INACTIVE') {
      throw new UnprocessableEntityException(
        withCode(
          ErrorCode.USER_INVALID_TRANSITION,
          `Không thể chuyển user từ trạng thái ${existing.status} sang ACTIVE`,
        ),
      );
    }

    const updated = await this.userRepository.updateStatus(
      id,
      actor.organizationId,
      'ACTIVE',
      actor.userId,
    );

    await this.auditLogService.log({
      organizationId: actor.organizationId,
      userId: actor.userId,
      action: 'user.reactivate',
      entityType: 'User',
      entityId: id,
      oldValue: this.toAuditSnapshot(existing),
      newValue: this.toAuditSnapshot(updated),
      ip: actor.ip,
      userAgent: actor.userAgent,
    });

    return UserMapper.toResponseDto(updated);
  }

  /** D4 — admin đặt mật khẩu mới cho user khác. Cùng thứ tự không-transaction đã chấp nhận ở
   * ForgotPasswordService.resetPassword() (hash → persist → revoke sessions), xem phân tích đầy
   * đủ ở docstring deactivate() phía trên — không lặp lại ở đây. */
  async resetPassword(
    id: string,
    dto: ResetUserPasswordDto,
    actor: ActorContext,
  ): Promise<void> {
    const existing = await this.userRepository.findById(
      id,
      actor.organizationId,
    );
    if (!existing) throw this.notFound();

    const passwordHash = await this.passwordHasher.hash(dto.newPassword);
    await this.userRepository.updatePasswordHash(
      id,
      actor.organizationId,
      passwordHash,
      actor.userId,
    );
    await this.authService.revokeAllSessionsForUser(id);

    await this.auditLogService.log({
      organizationId: actor.organizationId,
      userId: actor.userId,
      action: 'user.reset_password',
      entityType: 'User',
      entityId: id,
      ip: actor.ip,
      userAgent: actor.userAgent,
    });
  }

  private async assertUsernameNotDuplicate(
    organizationId: string,
    username: string,
  ): Promise<void> {
    const exists = await this.userRepository.existsByUsername(
      organizationId,
      username,
    );
    if (exists) {
      throw new ConflictException(
        withCode(
          ErrorCode.USER_USERNAME_CONFLICT,
          `Tên đăng nhập "${username}" đã được sử dụng trong tổ chức`,
        ),
      );
    }
  }

  private async assertEmailNotDuplicate(
    organizationId: string,
    email: string,
  ): Promise<void> {
    const exists = await this.userRepository.existsByEmail(
      organizationId,
      email,
    );
    if (exists) {
      throw new ConflictException(
        withCode(
          ErrorCode.USER_EMAIL_CONFLICT,
          `Email "${email}" đã được sử dụng trong tổ chức`,
        ),
      );
    }
  }

  /** Lớp bảo vệ cuối — pre-check ở trên không đủ chống race (2 request đồng thời cùng
   * username/email); DB unique constraint (P2002) mới là nguồn sự thật, map sang lỗi domain. */
  private translateConflictError(error: unknown): Error {
    if (error instanceof UserUsernameConflictError) {
      return new ConflictException(
        withCode(ErrorCode.USER_USERNAME_CONFLICT, error.message),
      );
    }
    if (error instanceof UserEmailConflictError) {
      return new ConflictException(
        withCode(ErrorCode.USER_EMAIL_CONFLICT, error.message),
      );
    }
    return error as Error;
  }

  private notFound(): NotFoundException {
    return new NotFoundException(
      withCode(ErrorCode.USER_NOT_FOUND, 'Không tìm thấy người dùng'),
    );
  }

  private toAuditSnapshot(user: UserEntity): Record<string, unknown> {
    return {
      username: user.username,
      email: user.email,
      fullName: user.fullName,
      branchId: user.branchId,
      status: user.status,
    };
  }
}
