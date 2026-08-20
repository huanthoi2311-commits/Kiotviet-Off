import type { PrismaClient } from '@prisma/client';
import * as argon2 from 'argon2';
import { PRODUCTION_SECRET_PLACEHOLDERS } from '../../../config/env.validation';

/**
 * SPEC-T022B1, Item Phase 1 — First Administrator / Tenant Initialization. Cơ chế bootstrap
 * SẢN XUẤT-AN TOÀN cho tổ chức + quản trị viên ĐẦU TIÊN của 1 deployment — khác hẳn
 * `prisma/seed.ts` (chỉ dev/staging, tự chặn khi NODE_ENV=production) và khác
 * `permission-bootstrap.ts` (T022A, chỉ đụng bảng Permission).
 *
 * Mượn ĐÚNG pattern giao dịch đã có, đã review, đang chạy thật ở
 * `PrismaOrganizationRepository.createWithOwner()` (Organization → User chủ sở hữu → cập nhật lại
 * `ownerUserId` → Role "owner" → gán toàn bộ Permission hiện có → UserRole → OrganizationSettings
 * → OrganizationSubscription) — KHÔNG gọi lại chính class đó (vốn được thiết kế cho luồng có actor
 * đã đăng nhập qua PlatformAdminGuard, đòi hỏi `actorUserId`/`AuditContext` không tồn tại ở bối
 * cảnh bootstrap chưa có ai đăng nhập cả), mà tái hiện lại đúng trình tự đã được chứng minh đúng,
 * không phát minh trình tự mới.
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
 *
 * T051.08D (release-blocking — supersedes the Phase 1 scope note below) — Phase 1's SPEC-T022B1
 * đã CHỦ Ý loại OrganizationSettings/OrganizationSubscription/AuditLog khỏi phạm vi (chỉ liệt kê
 * Organization/Branch/Role/RolePermission/User/UserRole). Thực tế vận hành xác nhận (real-browser
 * E2E, T051.08 resume): `OrganizationRepository.findById()` — nguồn của
 * `GET /organizations/current` — coi Organization/Settings/Subscription là MỘT aggregate bắt buộc
 * đủ cả 3 (đúng những gì `createWithOwner()` đã tạo), nên tổ chức bootstrap (thiếu 2 bảng sau)
 * luôn trả 404 "Không tìm thấy tổ chức" — hiển thị thành toast lỗi thật trên MỌI trang dashboard
 * (`useCurrentOrganization()` gọi ở `dashboard-shell.tsx`, dù kết quả bị bỏ qua, lỗi truy vấn vẫn
 * kích hoạt toast lỗi toàn cục của React Query). Từ T051.08D: bootstrap tạo ĐỦ cả 2 bảng còn thiếu
 * — khi tạo tổ chức mới (trong CÙNG transaction với Organization/Branch/User/Role) VÀ khi phát
 * hiện tổ chức đã tồn tại nhưng thiếu 1 trong 2 (tự vá cho deployment cũ tạo trước T051.08D, xem
 * `upsertOrganizationCompanions()`) — không bắt vận hành viên xoá/tạo lại tổ chức để sửa.
 */

const MIN_PASSWORD_LENGTH = 8; // Cùng chuẩn ResetPasswordDto (BR2) — đây là baseline độ mạnh
// mật khẩu DUY NHẤT đã được chấp thuận trong dự án (không có yêu cầu độ phức tạp/ký tự đặc biệt
// nào khác ở bất kỳ đâu — xác nhận qua `reset-password.dto.ts` chỉ dùng `@MinLength(8)`), nên
// KHÔNG phát minh thêm yêu cầu phức tạp mới chỉ riêng cho luồng này (T030.11, DISCOVERY-T030 F36).
/** BR1 — mật khẩu demo đã biết công khai của prisma/seed.ts, không được phép dùng lại. */
const KNOWN_DEMO_PASSWORD = 'Admin@123';

/**
 * T030.11 (DISCOVERY-T030 F36) — mở rộng danh sách chặn ngoài `KNOWN_DEMO_PASSWORD` (vốn chỉ
 * chặn đúng 1 literal). Các giá trị dưới đây là mật khẩu placeholder/mặc định phổ biến, đủ dài để
 * qua được `MIN_PASSWORD_LENGTH` nhưng rõ ràng không phải mật khẩu thật do người vận hành tự chọn
 * — cùng tinh thần với `WEAK_PRODUCTION_PASSWORDS` (`database-url.util.ts`, T030.7), một danh
 * sách literal nhỏ, tường minh, KHÔNG phải bộ máy chấm điểm phức tạp.
 *
 * T053.06A (F36 re-confirmed, T053.06 hard-stop P1) — bổ sung
 * `PRODUCTION_SECRET_PLACEHOLDERS.FIRST_ADMIN_PASSWORD` (giá trị đóng gói sẵn trong `.env.example`,
 * trước đây KHÔNG nằm trong danh sách này — một deployment production copy `.env.example` xong
 * quên đổi biến này sẽ bootstrap thành công với mật khẩu đã biết công khai). Đọc từ nguồn sự thật
 * duy nhất (`env.validation.ts`) thay vì lặp lại literal — không thể lệch nhau lần nữa. Danh sách
 * này áp dụng ở MỌI môi trường (không chỉ production, giống 5 giá trị đã có từ trước) — đã xác
 * nhận cả `deployment-smoke.yml`/`release-e2e.yml` đều tự sinh mật khẩu ngẫu nhiên thật
 * (`openssl rand -hex 12`), không phụ thuộc giá trị `.env.example`, nên chặn tuyệt đối ở đây không
 * phá bất kỳ luồng CI/deployment hợp pháp nào.
 */
const KNOWN_WEAK_ADMIN_PASSWORDS: ReadonlySet<string> = new Set([
  KNOWN_DEMO_PASSWORD,
  'password',
  'Password123',
  'admin123',
  'changeme',
  PRODUCTION_SECRET_PLACEHOLDERS.FIRST_ADMIN_PASSWORD,
]);

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
  | {
      outcome: 'ALREADY_INITIALIZED';
      organizationId: string;
      // T051.08D — true khi lần chạy này vừa tự vá OrganizationSettings/OrganizationSubscription
      // còn thiếu cho một tổ chức bootstrap từ TRƯỚC T051.08D — vận hành viên cần biết đã có sửa
      // chữa xảy ra (script CLI in ra thông báo khác nhau tuỳ giá trị này), không chỉ "đã có sẵn".
      companionsRepaired: boolean;
    };

type FirstAdminPrismaClient = Pick<
  PrismaClient,
  | 'organization'
  | 'branch'
  | 'role'
  | 'rolePermission'
  | 'user'
  | 'userRole'
  | 'permission'
  | 'organizationSettings'
  | 'organizationSubscription'
  | '$transaction'
>;

/**
 * BR1/BR2 — thất bại RÕ RÀNG trước khi tạo bất kỳ record nào (§7 Failure Behavior).
 * KHÔNG BAO GIỜ in giá trị `password` thật vào bất kỳ message nào ở đây (mọi throw bên dưới chỉ
 * mô tả LOẠI lỗi, không lặp lại giá trị đã nhập).
 */
function assertCredentialAllowed(password: string): void {
  // T053.06A — "whitespace-only" (vd toàn dấu cách) trước đây lọt qua `readRequiredEnv()` (chuỗi
  // không rỗng, `!value` là false) và có thể lọt qua cả `MIN_PASSWORD_LENGTH` nếu đủ dài — kiểm tra
  // riêng ở đây, KHÔNG trim rồi dùng lại giá trị đã trim cho các bước sau (một mật khẩu thật có
  // khoảng trắng đầu/cuối vẫn hợp lệ, chỉ chặn đúng trường hợp TOÀN BỘ là khoảng trắng).
  if (password.trim().length === 0) {
    throw new Error(
      'Mật khẩu quản trị viên không được để trống hoặc chỉ gồm khoảng trắng',
    );
  }
  if (password === KNOWN_DEMO_PASSWORD) {
    throw new Error(
      'Mật khẩu quản trị viên không được trùng với mật khẩu demo đã biết công khai của prisma/seed.ts',
    );
  }
  // T030.11 (DISCOVERY-T030 F36) — mở rộng ngoài đúng 1 literal demo password: các giá trị
  // placeholder/mặc định phổ biến khác cũng bị từ chối tường minh, thông điệp riêng (không lẫn
  // với nhánh "mật khẩu demo" ở trên — test hiện có đã khẳng định message CHÍNH XÁC cho nhánh đó).
  if (KNOWN_WEAK_ADMIN_PASSWORDS.has(password)) {
    throw new Error(
      'Mật khẩu quản trị viên là một giá trị mặc định/placeholder đã biết, không được phép dùng cho production',
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
 *
 * T051.08D — trả về id (không chỉ boolean) để nhánh "đã khởi tạo" bên dưới còn dùng được cho
 * `upsertOrganizationCompanions()`.
 */
async function findExistingOrganizationId(
  prisma: FirstAdminPrismaClient,
): Promise<string | null> {
  const existing = await prisma.organization.findFirst({
    select: { id: true },
  });
  return existing?.id ?? null;
}

/**
 * T051.08D — vá OrganizationSettings/OrganizationSubscription còn thiếu cho MỘT tổ chức đã tồn
 * tại (deployment bootstrap từ trước T051.08D, hoặc bất kỳ lý do nào khác khiến 1 trong 2 bảng
 * chưa có). Dùng `upsert` (không phải `findThenCreate` thủ công) để an toàn ngay cả khi có 2 tiến
 * trình bootstrap chạy gần như đồng thời (dù kịch bản vận hành thật — `docker compose up` một lần
 * — không tạo ra tình huống đó) — `update: {}` là no-op nếu record đã tồn tại, không ghi đè bất kỳ
 * giá trị nào người vận hành/hệ thống đã tự chỉnh sau khi tạo (SPEC-ORG-001: chỉ module
 * `organization` được ghi trực tiếp — bootstrap script đã là ngoại lệ đã được chấp nhận từ Phase 1
 * cho Organization/Branch/User/Role, mở rộng thêm 2 bảng này không phải tiền lệ mới).
 *
 * Trả về `true` nếu THẬT SỰ có vá (1 trong 2 bảng từng thiếu) — dùng để vận hành viên biết có sửa
 * chữa xảy ra, không chỉ "đã có sẵn, không làm gì".
 */
async function upsertOrganizationCompanions(
  prisma: FirstAdminPrismaClient,
  organizationId: string,
): Promise<boolean> {
  const [settingsBefore, subscriptionBefore] = await Promise.all([
    prisma.organizationSettings.findUnique({
      where: { organizationId },
      select: { id: true },
    }),
    prisma.organizationSubscription.findUnique({
      where: { organizationId },
      select: { id: true },
    }),
  ]);

  await prisma.organizationSettings.upsert({
    where: { organizationId },
    create: { organizationId },
    update: {},
  });
  await prisma.organizationSubscription.upsert({
    where: { organizationId },
    create: { organizationId },
    update: {},
  });

  return settingsBefore === null || subscriptionBefore === null;
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

  const existingOrganizationId = await findExistingOrganizationId(prisma);
  if (existingOrganizationId !== null) {
    // T051.08D — deployment đã bootstrap từ trước (có thể từ trước T051.08D, khi
    // OrganizationSettings/OrganizationSubscription còn chưa được tạo) — vá nếu thiếu, KHÔNG tạo
    // lại Organization/Branch/User/Role (giữ nguyên idempotency đã có từ Phase 1).
    const companionsRepaired = await upsertOrganizationCompanions(
      prisma,
      existingOrganizationId,
    );
    return {
      outcome: 'ALREADY_INITIALIZED',
      organizationId: existingOrganizationId,
      companionsRepaired,
    };
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

    // T051.08D — provisioning parity với `PrismaOrganizationRepository.createWithOwner()`:
    // OrganizationSettings/OrganizationSubscription là 1 phần bắt buộc của aggregate Organization
    // (`OrganizationRepository.findById()` — nguồn của `GET /organizations/current` — coi thiếu
    // 1 trong 2 là "tổ chức không tồn tại"). Chỉ cần `organizationId` — mọi field khác đã có default
    // hợp lý ở schema.prisma (plan=FREE, status=ACTIVE, ngôn ngữ=vi, tiền tệ=VND, ...), đúng những
    // gì luồng tạo tổ chức bình thường (`POST /organizations`) cũng dùng — không tự bịa giá trị.
    await tx.organizationSettings.create({
      data: { organizationId: organization.id },
    });
    await tx.organizationSubscription.create({
      data: { organizationId: organization.id },
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
