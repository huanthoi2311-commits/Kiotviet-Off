import type { PrismaClient } from '@prisma/client';
import * as argon2 from 'argon2';

/**
 * SPEC-T022B1, Item Phase 1 — First Administrator / Tenant Initialization. Cơ chế bootstrap
 * SẢN XUẤT-AN TOÀN cho tổ chức + quản trị viên ĐẦU TIÊN của 1 deployment — khác hẳn
 * `prisma/seed.ts` (chỉ dev/staging, tự chặn khi NODE_ENV=production) và khác
 * `permission-bootstrap.ts` (T022A, chỉ đụng bảng Permission).
 *
 * Mượn ĐÚNG pattern giao dịch đã có, đã review, đang chạy thật ở
 * `PrismaOrganizationRepository.createWithOwner()` (Organization → User chủ sở hữu → cập nhật lại
 * `ownerUserId` → Role "owner" → gán toàn bộ Permission hiện có → UserRole) — KHÔNG gọi lại chính
 * class đó (vốn được thiết kế cho luồng có actor đã đăng nhập qua PlatformAdminGuard, đòi hỏi
 * `actorUserId`/`AuditContext` không tồn tại ở bối cảnh bootstrap chưa có ai đăng nhập cả), mà tái
 * hiện lại đúng trình tự đã được chứng minh đúng, không phát minh trình tự mới. Không tạo
 * OrganizationSettings/OrganizationSubscription/AuditLog — ngoài phạm vi SPEC-T022B1 (chỉ liệt kê
 * Organization/Branch/Role/RolePermission/User/UserRole).
 *
 * KHÔNG có decorator NestJS, không đăng ký vào Module nào — chỉ gọi thủ công qua
 * `prisma/bootstrap-first-admin.ts`, ngoài hoàn toàn tầng HTTP API và ngoài `main.ts`/bootstrap()
 * (FR2/FR3).
 *
 * Phase 2 (SPEC-T022B1 §3 Precondition P2 / §7 Failure Behavior) — bổ sung: thất bại RÕ RÀNG nếu
 * Permission catalog trống tại thời điểm chạy (thay vì âm thầm tạo Administrator có Role 0
 * quyền như ở Phase 1) — xem `initializeFirstAdmin()`. Không đổi thứ tự tạo record, không đổi
 * transaction boundary, không đổi idempotency, không đổi khả năng tương thích đăng nhập đã xác
 * minh ở Phase 1 — chỉ đổi hành vi của ĐÚNG 1 nhánh trước đây "bỏ qua trong im lặng".
 */

const MIN_PASSWORD_LENGTH = 8; // Cùng chuẩn ResetPasswordDto (BR2).
/** BR1 — mật khẩu demo đã biết công khai của prisma/seed.ts, không được phép dùng lại. */
const KNOWN_DEMO_PASSWORD = 'Admin@123';

export interface FirstAdminOrganizationInput {
  code: string;
  displayName: string;
  slug: string;
}

export interface FirstAdminBranchInput {
  code: string;
  name: string;
}

export interface FirstAdminAdministratorInput {
  username: string;
  email: string;
  password: string;
  fullName?: string;
}

export interface FirstAdminInitializationInput {
  organization: FirstAdminOrganizationInput;
  branch: FirstAdminBranchInput;
  administrator: FirstAdminAdministratorInput;
}

export type FirstAdminInitializationResult =
  | {
      outcome: 'CREATED';
      organizationId: string;
      branchId: string;
      roleId: string;
      userId: string;
    }
  | { outcome: 'ALREADY_INITIALIZED' };

type FirstAdminPrismaClient = Pick<
  PrismaClient,
  | 'organization'
  | 'branch'
  | 'role'
  | 'rolePermission'
  | 'user'
  | 'userRole'
  | 'permission'
  | '$transaction'
>;

/** BR1/BR2 — thất bại RÕ RÀNG trước khi tạo bất kỳ record nào (§7 Failure Behavior). */
function assertCredentialAllowed(password: string): void {
  if (password === KNOWN_DEMO_PASSWORD) {
    throw new Error(
      'Mật khẩu quản trị viên không được trùng với mật khẩu demo đã biết công khai của prisma/seed.ts',
    );
  }
  if (password.length < MIN_PASSWORD_LENGTH) {
    throw new Error(
      `Mật khẩu quản trị viên phải có tối thiểu ${MIN_PASSWORD_LENGTH} ký tự`,
    );
  }
}

/**
 * SPEC-T022B1 §4 (Idempotency Requirements) — xác định "đã khởi tạo cho deployment này chưa"
 * bằng cách kiểm tra sự tồn tại của BẤT KỲ Organization nào (đã được RFC-T022B1 Rev1 §4.2 và
 * SPEC-T022B1 Rev1 §4 xác nhận rõ là chiến lược được chấp nhận, với phạm vi hiểu đúng: chỉ có
 * nghĩa "cơ chế bootstrap NÀY đã chạy thành công cho deployment NÀY", không phải khẳng định kiến
 * trúc "hệ thống chỉ hỗ trợ 1 tenant mãi mãi" — FR6 cho phép đọc/query phục vụ mục đích này).
 */
async function isAlreadyInitialized(
  prisma: FirstAdminPrismaClient,
): Promise<boolean> {
  const existing = await prisma.organization.findFirst({
    select: { id: true },
  });
  return existing !== null;
}

/**
 * SPEC-T022B1 §1 (Functional Requirements)/§5 (Transaction Boundary) — tạo ĐỦ Organization,
 * Branch, Role "owner", gán TOÀN BỘ Permission hiện có (đọc tại thời điểm chạy — FR5/BR4), User
 * quản trị viên, UserRole — TẤT CẢ trong 1 transaction nguyên tử duy nhất (§5), theo đúng trình
 * tự đã chứng minh đúng ở `PrismaOrganizationRepository.createWithOwner()`.
 */
export async function initializeFirstAdmin(
  prisma: FirstAdminPrismaClient,
  input: FirstAdminInitializationInput,
): Promise<FirstAdminInitializationResult> {
  assertCredentialAllowed(input.administrator.password);

  if (await isAlreadyInitialized(prisma)) {
    return { outcome: 'ALREADY_INITIALIZED' };
  }

  const passwordHash = await argon2.hash(input.administrator.password, {
    type: argon2.argon2id,
  });

  return prisma.$transaction(async (tx) => {
    const organization = await tx.organization.create({
      data: {
        code: input.organization.code,
        displayName: input.organization.displayName,
        slug: input.organization.slug,
      },
    });

    const branch = await tx.branch.create({
      data: {
        organizationId: organization.id,
        code: input.branch.code,
        name: input.branch.name,
        isMain: true,
      },
    });

    const administrator = await tx.user.create({
      data: {
        organizationId: organization.id,
        branchId: branch.id,
        username: input.administrator.username,
        fullName: input.administrator.fullName ?? null,
        email: input.administrator.email,
        passwordHash,
      },
    });

    // SPEC-ORG-001 Decision 3 (schema.prisma comment on Organization.ownerUserId) — Organization
    // phải tạo trước (ownerUserId tạm null) vì User.organizationId bắt buộc NOT NULL, rồi UPDATE
    // lại ownerUserId sau khi User đã tồn tại. Ở tầng nghiệp vụ, sau bước này KHÔNG bao giờ còn null.
    await tx.organization.update({
      where: { id: organization.id },
      data: { ownerUserId: administrator.id },
    });

    const ownerRole = await tx.role.create({
      data: {
        organizationId: organization.id,
        code: 'owner',
        name: 'Chủ sở hữu',
        isSystem: true,
      },
    });

    // FR5/BR4 — đọc TOÀN BỘ Permission hiện có tại thời điểm chạy, không phải danh sách cố định.
    const permissions = await tx.permission.findMany({ select: { id: true } });
    // SPEC-T022B1 §3 (Precondition P2) / §7 (Failure Behavior) — Permission catalog trống nghĩa
    // là `npm run prisma:bootstrap-permissions` (T022A) CHƯA chạy trước đó. Phải thất bại RÕ RÀNG
    // ở đây, không được âm thầm bỏ qua rồi tạo ra một Administrator có Role 0 quyền (kết quả suy
    // giảm mà §7 cấm rõ). Vì bước này nằm TRONG transaction (§5), ném lỗi ở đây cũng rollback
    // nguyên vẹn Organization/Branch/User/Role đã tạo trước đó trong CÙNG lần gọi.
    if (permissions.length === 0) {
      throw new Error(
        'Permission catalog trống — chạy `npm run prisma:bootstrap-permissions` (SPEC-T022A) trước khi chạy cơ chế khởi tạo quản trị viên đầu tiên (SPEC-T022B1 §3, tiền điều kiện P2)',
      );
    }
    await tx.rolePermission.createMany({
      data: permissions.map((permission) => ({
        roleId: ownerRole.id,
        permissionId: permission.id,
      })),
      skipDuplicates: true,
    });

    await tx.userRole.create({
      data: { userId: administrator.id, roleId: ownerRole.id },
    });

    return {
      outcome: 'CREATED',
      organizationId: organization.id,
      branchId: branch.id,
      roleId: ownerRole.id,
      userId: administrator.id,
    };
  });
}
