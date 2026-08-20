import { readFileSync } from 'fs';
import { join } from 'path';
import type { PrismaClient } from '@prisma/client';
import { PRODUCTION_SECRET_PLACEHOLDERS } from '../../../config/env.validation';
import {
  FirstAdminInitializationInput,
  initializeFirstAdmin,
} from './first-admin-initializer';

describe('initializeFirstAdmin — SPEC-T022B1 (First Administrator / Tenant Initialization)', () => {
  const validInput: FirstAdminInitializationInput = {
    organization: {
      code: 'ORG000001',
      displayName: 'Cửa hàng của tôi',
      slug: 'cua-hang-cua-toi',
    },
    branch: { code: 'BR000001', name: 'Chi nhánh chính' },
    administrator: {
      username: 'owner',
      email: 'owner@example.com',
      password: 'a-real-strong-password-123',
      fullName: 'Chủ sở hữu',
    },
  };

  function createMockTx() {
    return {
      organization: {
        create: jest.fn().mockResolvedValue({ id: 'org-1' }),
        update: jest.fn().mockResolvedValue({ id: 'org-1' }),
        findFirst: jest.fn(),
      },
      branch: { create: jest.fn().mockResolvedValue({ id: 'branch-1' }) },
      role: { create: jest.fn().mockResolvedValue({ id: 'role-1' }) },
      rolePermission: { createMany: jest.fn().mockResolvedValue({ count: 0 }) },
      user: { create: jest.fn().mockResolvedValue({ id: 'user-1' }) },
      userRole: { create: jest.fn().mockResolvedValue({ id: 'user-role-1' }) },
      permission: {
        findMany: jest
          .fn()
          .mockResolvedValue([{ id: 'perm-1' }, { id: 'perm-2' }]),
      },
      // T051.08D — `organizationSettings`/`organizationSubscription` được dùng CẢ ở tx (luồng tạo
      // mới, bên trong transaction) LẪN ở top-level prisma (luồng vá tổ chức đã tồn tại, ngoài
      // transaction) — `createMockPrisma()` bên dưới cố ý dùng LẠI ĐÚNG object này cho cả 2 vai
      // trò, giống hệt cách `organization`/`branch`/... đã dùng chung từ trước.
      organizationSettings: {
        create: jest.fn().mockResolvedValue({ id: 'settings-1' }),
        findUnique: jest.fn().mockResolvedValue(null),
        upsert: jest.fn().mockResolvedValue({ id: 'settings-1' }),
      },
      organizationSubscription: {
        create: jest.fn().mockResolvedValue({ id: 'subscription-1' }),
        findUnique: jest.fn().mockResolvedValue(null),
        upsert: jest.fn().mockResolvedValue({ id: 'subscription-1' }),
      },
    };
  }

  type MockTx = ReturnType<typeof createMockTx>;

  function createMockPrisma(tx: MockTx = createMockTx()) {
    return {
      organization: tx.organization,
      branch: tx.branch,
      role: tx.role,
      rolePermission: tx.rolePermission,
      user: tx.user,
      userRole: tx.userRole,
      permission: tx.permission,
      organizationSettings: tx.organizationSettings,
      organizationSubscription: tx.organizationSubscription,
      $transaction: jest.fn(
        async (callback: (tx: MockTx) => Promise<unknown>) => callback(tx),
      ),
    };
  }

  type MockPrisma = ReturnType<typeof createMockPrisma>;

  function asPrismaPick(mock: MockPrisma) {
    return mock as unknown as Pick<
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
  }

  describe('luồng thành công (deployment chưa có Organization nào)', () => {
    it('[1] tạo Organization/Branch/Role/User/UserRole đúng 1 lần mỗi loại, không tạo gì khác', async () => {
      const tx = createMockTx();
      tx.organization.findFirst.mockResolvedValue(null);
      const prisma = createMockPrisma(tx);

      const result = await initializeFirstAdmin(
        asPrismaPick(prisma),
        validInput,
      );

      expect(result.outcome).toBe('CREATED');
      expect(tx.organization.create).toHaveBeenCalledTimes(1);
      expect(tx.branch.create).toHaveBeenCalledTimes(1);
      expect(tx.role.create).toHaveBeenCalledTimes(1);
      expect(tx.user.create).toHaveBeenCalledTimes(1);
      expect(tx.userRole.create).toHaveBeenCalledTimes(1);
      expect(tx.organization.update).toHaveBeenCalledTimes(1);
      // T051.08D §9(1)(2)(3) — OrganizationSettings/OrganizationSubscription tạo đúng 1 lần mỗi
      // loại, đúng organizationId, cùng transaction với Organization/Branch/User/Role.
      expect(tx.organizationSettings.create).toHaveBeenCalledTimes(1);
      expect(tx.organizationSettings.create).toHaveBeenCalledWith({
        data: { organizationId: 'org-1' },
      });
      expect(tx.organizationSubscription.create).toHaveBeenCalledTimes(1);
      expect(tx.organizationSubscription.create).toHaveBeenCalledWith({
        data: { organizationId: 'org-1' },
      });
    });

    it('Organization được tạo với đúng code/displayName/slug từ input, KHÔNG set ownerUserId ở bước create', async () => {
      const tx = createMockTx();
      tx.organization.findFirst.mockResolvedValue(null);
      const prisma = createMockPrisma(tx);

      await initializeFirstAdmin(asPrismaPick(prisma), validInput);

      expect(tx.organization.create).toHaveBeenCalledWith({
        data: {
          code: 'ORG000001',
          displayName: 'Cửa hàng của tôi',
          slug: 'cua-hang-cua-toi',
        },
      });
    });

    it('Branch được tạo thuộc đúng Organization, isMain=true', async () => {
      const tx = createMockTx();
      tx.organization.findFirst.mockResolvedValue(null);
      const prisma = createMockPrisma(tx);

      await initializeFirstAdmin(asPrismaPick(prisma), validInput);

      expect(tx.branch.create).toHaveBeenCalledWith({
        data: {
          organizationId: 'org-1',
          code: 'BR000001',
          name: 'Chi nhánh chính',
          isMain: true,
        },
      });
    });

    it('sau khi tạo User, Organization.ownerUserId được UPDATE trỏ đúng về User đó (SPEC-ORG-001 Decision 3)', async () => {
      const tx = createMockTx();
      tx.organization.findFirst.mockResolvedValue(null);
      const prisma = createMockPrisma(tx);

      await initializeFirstAdmin(asPrismaPick(prisma), validInput);

      expect(tx.organization.update).toHaveBeenCalledWith({
        where: { id: 'org-1' },
        data: { ownerUserId: 'user-1' },
      });
    });

    it('[2] Role "owner" được gán ĐỦ TOÀN BỘ Permission đọc được tại thời điểm chạy (không phải danh sách cố định)', async () => {
      const tx = createMockTx();
      tx.organization.findFirst.mockResolvedValue(null);
      tx.permission.findMany.mockResolvedValue([
        { id: 'perm-a' },
        { id: 'perm-b' },
        { id: 'perm-c' },
      ]);
      const prisma = createMockPrisma(tx);

      await initializeFirstAdmin(asPrismaPick(prisma), validInput);

      expect(tx.permission.findMany).toHaveBeenCalledTimes(1);
      expect(tx.rolePermission.createMany).toHaveBeenCalledWith({
        data: [
          { roleId: 'role-1', permissionId: 'perm-a' },
          { roleId: 'role-1', permissionId: 'perm-b' },
          { roleId: 'role-1', permissionId: 'perm-c' },
        ],
        skipDuplicates: true,
      });
    });

    it('mật khẩu được hash trước khi lưu (không lưu plaintext)', async () => {
      const tx = createMockTx();
      tx.organization.findFirst.mockResolvedValue(null);
      const prisma = createMockPrisma(tx);

      await initializeFirstAdmin(asPrismaPick(prisma), validInput);

      const createCall = tx.user.create.mock.calls[0][0] as {
        data: { passwordHash: string };
      };
      expect(createCall.data.passwordHash).not.toBe(
        validInput.administrator.password,
      );
      expect(createCall.data.passwordHash.length).toBeGreaterThan(0);
    });

    it('trả về outcome CREATED kèm đủ id của Organization/Branch/Role/User vừa tạo', async () => {
      const tx = createMockTx();
      tx.organization.findFirst.mockResolvedValue(null);
      const prisma = createMockPrisma(tx);

      const result = await initializeFirstAdmin(
        asPrismaPick(prisma),
        validInput,
      );

      expect(result).toEqual({
        outcome: 'CREATED',
        organizationId: 'org-1',
        branchId: 'branch-1',
        roleId: 'role-1',
        userId: 'user-1',
      });
    });
  });

  describe('[3] idempotency — đã khởi tạo trước đó (đã có Organization)', () => {
    it('KHÔNG tạo record Organization/Branch/Role/User nào, trả về outcome ALREADY_INITIALIZED, KHÔNG mở transaction', async () => {
      const tx = createMockTx();
      tx.organization.findFirst.mockResolvedValue({ id: 'existing-org' });
      const prisma = createMockPrisma(tx);

      const result = await initializeFirstAdmin(
        asPrismaPick(prisma),
        validInput,
      );

      expect(result).toEqual({
        outcome: 'ALREADY_INITIALIZED',
        organizationId: 'existing-org',
        companionsRepaired: true,
      });
      expect(prisma.$transaction).not.toHaveBeenCalled();
      expect(tx.organization.create).not.toHaveBeenCalled();
      expect(tx.branch.create).not.toHaveBeenCalled();
      expect(tx.role.create).not.toHaveBeenCalled();
      expect(tx.user.create).not.toHaveBeenCalled();
      expect(tx.userRole.create).not.toHaveBeenCalled();
    });

    // T051.08D §5/§9(4)(5)(6)(7) — Organization đã tồn tại nhưng OrganizationSettings/
    // OrganizationSubscription (bootstrap từ trước T051.08D) có thể thiếu 1, thiếu cả 2, hoặc đã
    // đủ cả 2 — bootstrap phải tự vá đúng phần thiếu, không đụng phần đã có, không tạo lại
    // Organization/Branch/User/Role.
    describe('T051.08D — tự vá OrganizationSettings/OrganizationSubscription cho tổ chức đã tồn tại', () => {
      it('[4][8] rerun khi CẢ 2 đã tồn tại đầy đủ → companionsRepaired=false, KHÔNG tạo trùng, KHÔNG tạo lại Organization/Branch/User/Role', async () => {
        const tx = createMockTx();
        tx.organization.findFirst.mockResolvedValue({ id: 'existing-org' });
        tx.organizationSettings.findUnique.mockResolvedValue({
          id: 'settings-existing',
        });
        tx.organizationSubscription.findUnique.mockResolvedValue({
          id: 'subscription-existing',
        });
        const prisma = createMockPrisma(tx);

        const result = await initializeFirstAdmin(
          asPrismaPick(prisma),
          validInput,
        );

        expect(result).toEqual({
          outcome: 'ALREADY_INITIALIZED',
          organizationId: 'existing-org',
          companionsRepaired: false,
        });
        expect(tx.organization.create).not.toHaveBeenCalled();
        expect(tx.branch.create).not.toHaveBeenCalled();
        expect(tx.user.create).not.toHaveBeenCalled();
      });

      it('[5] chỉ OrganizationSettings thiếu → được vá (create qua upsert), Subscription không bị đụng vào lại, companionsRepaired=true', async () => {
        const tx = createMockTx();
        tx.organization.findFirst.mockResolvedValue({ id: 'existing-org' });
        tx.organizationSettings.findUnique.mockResolvedValue(null);
        tx.organizationSubscription.findUnique.mockResolvedValue({
          id: 'subscription-existing',
        });
        const prisma = createMockPrisma(tx);

        const result = await initializeFirstAdmin(
          asPrismaPick(prisma),
          validInput,
        );

        expect(result).toEqual({
          outcome: 'ALREADY_INITIALIZED',
          organizationId: 'existing-org',
          companionsRepaired: true,
        });
        expect(tx.organizationSettings.upsert).toHaveBeenCalledWith({
          where: { organizationId: 'existing-org' },
          create: { organizationId: 'existing-org' },
          update: {},
        });
      });

      it('[6] chỉ OrganizationSubscription thiếu → được vá (create qua upsert), Settings không bị đụng vào lại, companionsRepaired=true', async () => {
        const tx = createMockTx();
        tx.organization.findFirst.mockResolvedValue({ id: 'existing-org' });
        tx.organizationSettings.findUnique.mockResolvedValue({
          id: 'settings-existing',
        });
        tx.organizationSubscription.findUnique.mockResolvedValue(null);
        const prisma = createMockPrisma(tx);

        const result = await initializeFirstAdmin(
          asPrismaPick(prisma),
          validInput,
        );

        expect(result).toEqual({
          outcome: 'ALREADY_INITIALIZED',
          organizationId: 'existing-org',
          companionsRepaired: true,
        });
        expect(tx.organizationSubscription.upsert).toHaveBeenCalledWith({
          where: { organizationId: 'existing-org' },
          create: { organizationId: 'existing-org' },
          update: {},
        });
      });

      it('[7] cả 2 đã tồn tại — upsert vẫn được gọi nhưng với update:{} (no-op), không ghi đè giá trị đã có', async () => {
        const tx = createMockTx();
        tx.organization.findFirst.mockResolvedValue({ id: 'existing-org' });
        tx.organizationSettings.findUnique.mockResolvedValue({
          id: 'settings-existing',
        });
        tx.organizationSubscription.findUnique.mockResolvedValue({
          id: 'subscription-existing',
        });
        const prisma = createMockPrisma(tx);

        await initializeFirstAdmin(asPrismaPick(prisma), validInput);

        expect(tx.organizationSettings.upsert).toHaveBeenCalledWith(
          expect.objectContaining({ update: {} }),
        );
        expect(tx.organizationSubscription.upsert).toHaveBeenCalledWith(
          expect.objectContaining({ update: {} }),
        );
      });
    });
  });

  describe('[4] BR1/BR2 — từ chối credential trước khi tạo bất kỳ record nào', () => {
    it('từ chối khi mật khẩu trùng mật khẩu demo đã biết của prisma/seed.ts (Admin@123)', async () => {
      const tx = createMockTx();
      tx.organization.findFirst.mockResolvedValue(null);
      const prisma = createMockPrisma(tx);
      const input: FirstAdminInitializationInput = {
        ...validInput,
        administrator: { ...validInput.administrator, password: 'Admin@123' },
      };

      await expect(
        initializeFirstAdmin(asPrismaPick(prisma), input),
      ).rejects.toThrow(/mật khẩu demo/i);

      expect(prisma.$transaction).not.toHaveBeenCalled();
      expect(tx.organization.create).not.toHaveBeenCalled();
    });

    // T030.11 (DISCOVERY-T030 F36) — mở rộng ngoài đúng 1 literal demo password. T053.06A — thêm
    // PRODUCTION_SECRET_PLACEHOLDERS.FIRST_ADMIN_PASSWORD (giá trị đóng gói sẵn trong
    // `.env.example`, trước đây KHÔNG nằm trong danh sách này — chính là P1 T053.06 phát hiện).
    it.each([
      'password',
      'Password123',
      'admin123',
      'changeme',
      PRODUCTION_SECRET_PLACEHOLDERS.FIRST_ADMIN_PASSWORD,
    ])(
      'từ chối khi mật khẩu là giá trị mặc định/placeholder đã biết khác: "%s"',
      async (weakPassword) => {
        const tx = createMockTx();
        tx.organization.findFirst.mockResolvedValue(null);
        const prisma = createMockPrisma(tx);
        const input: FirstAdminInitializationInput = {
          ...validInput,
          administrator: {
            ...validInput.administrator,
            password: weakPassword,
          },
        };

        await expect(
          initializeFirstAdmin(asPrismaPick(prisma), input),
        ).rejects.toThrow(/mặc định\/placeholder đã biết/i);

        expect(prisma.$transaction).not.toHaveBeenCalled();
        expect(tx.organization.create).not.toHaveBeenCalled();
      },
    );

    it('mật khẩu đủ mạnh, KHÔNG nằm trong danh sách đã biết, đủ độ dài → được chấp nhận (không throw ở assertCredentialAllowed)', async () => {
      const tx = createMockTx();
      tx.organization.findFirst.mockResolvedValue(null);
      const prisma = createMockPrisma(tx);
      const input: FirstAdminInitializationInput = {
        ...validInput,
        administrator: {
          ...validInput.administrator,
          password: 'a-genuinely-unique-strong-password-2026',
        },
      };

      await expect(
        initializeFirstAdmin(asPrismaPick(prisma), input),
      ).resolves.toMatchObject({ outcome: 'CREATED' });
    });

    it('lỗi mật khẩu yếu KHÔNG in giá trị password thật vào message', async () => {
      const tx = createMockTx();
      tx.organization.findFirst.mockResolvedValue(null);
      const prisma = createMockPrisma(tx);
      const input: FirstAdminInitializationInput = {
        ...validInput,
        administrator: { ...validInput.administrator, password: 'changeme' },
      };

      let message = '';
      try {
        await initializeFirstAdmin(asPrismaPick(prisma), input);
      } catch (error) {
        message = (error as Error).message;
      }
      expect(message).not.toContain('changeme');
    });

    it('từ chối khi mật khẩu ngắn hơn độ dài tối thiểu (BR2, cùng chuẩn ResetPasswordDto)', async () => {
      const tx = createMockTx();
      tx.organization.findFirst.mockResolvedValue(null);
      const prisma = createMockPrisma(tx);
      const input: FirstAdminInitializationInput = {
        ...validInput,
        administrator: { ...validInput.administrator, password: 'short1' },
      };

      await expect(
        initializeFirstAdmin(asPrismaPick(prisma), input),
      ).rejects.toThrow(/tối thiểu/i);

      expect(prisma.$transaction).not.toHaveBeenCalled();
      expect(tx.organization.create).not.toHaveBeenCalled();
    });

    it('validation credential chạy TRƯỚC CẢ bước kiểm tra idempotency (organization.findFirst không được gọi)', async () => {
      const tx = createMockTx();
      const prisma = createMockPrisma(tx);
      const input: FirstAdminInitializationInput = {
        ...validInput,
        administrator: { ...validInput.administrator, password: 'Admin@123' },
      };

      await expect(
        initializeFirstAdmin(asPrismaPick(prisma), input),
      ).rejects.toThrow();

      expect(tx.organization.findFirst).not.toHaveBeenCalled();
    });
  });

  // T053.06A — P1 hard-stop finding (T053.06 discovery): `.env.example` đóng gói
  // FIRST_ADMIN_PASSWORD=change-me-strong-admin-password, một deployment production copy
  // `.env.example` xong quên đổi biến này TRƯỚC ĐÂY sẽ bootstrap thành công (32 ký tự, qua
  // MIN_PASSWORD_LENGTH, không nằm trong KNOWN_WEAK_ADMIN_PASSWORDS). Nhóm test này chứng minh:
  // (A3) whitespace-only bị chặn, (A4) placeholder đóng gói sẵn bị chặn + không thể lệch khỏi
  // `.env.example` thật (drift-proof), (A9) đường update/idempotent-rerun vẫn được bảo vệ như
  // đường tạo mới, (A10) hành vi không phụ thuộc NODE_ENV — áp dụng ở MỌI môi trường.
  describe('[T053.06A] FIRST_ADMIN_PASSWORD hardening — placeholder/whitespace/environment', () => {
    it('A3 — từ chối khi mật khẩu chỉ toàn khoảng trắng (whitespace-only)', async () => {
      const tx = createMockTx();
      tx.organization.findFirst.mockResolvedValue(null);
      const prisma = createMockPrisma(tx);
      const input: FirstAdminInitializationInput = {
        ...validInput,
        administrator: { ...validInput.administrator, password: '        ' },
      };

      await expect(
        initializeFirstAdmin(asPrismaPick(prisma), input),
      ).rejects.toThrow(/khoảng trắng/i);

      expect(prisma.$transaction).not.toHaveBeenCalled();
      expect(tx.organization.create).not.toHaveBeenCalled();
    });

    it('A3 — lỗi whitespace-only KHÔNG in giá trị password thật vào message', async () => {
      const tx = createMockTx();
      tx.organization.findFirst.mockResolvedValue(null);
      const prisma = createMockPrisma(tx);
      const input: FirstAdminInitializationInput = {
        ...validInput,
        administrator: { ...validInput.administrator, password: '   ' },
      };

      let message = '';
      try {
        await initializeFirstAdmin(asPrismaPick(prisma), input);
      } catch (error) {
        message = (error as Error).message;
      }
      expect(message).not.toContain('   ');
    });

    it('A4 — mật khẩu thật (không rỗng, không toàn khoảng trắng) vẫn được chấp nhận bình thường, không bị whitespace-check chặn nhầm', async () => {
      const tx = createMockTx();
      tx.organization.findFirst.mockResolvedValue(null);
      const prisma = createMockPrisma(tx);
      const input: FirstAdminInitializationInput = {
        ...validInput,
        administrator: {
          ...validInput.administrator,
          password: '  a-real-password-with-padding-2026  ',
        },
      };

      await expect(
        initializeFirstAdmin(asPrismaPick(prisma), input),
      ).resolves.toMatchObject({ outcome: 'CREATED' });
    });

    // Drift-proof — giá trị literal trong `.env.example` PHẢI luôn khớp
    // `PRODUCTION_SECRET_PLACEHOLDERS.FIRST_ADMIN_PASSWORD` (nguồn sự thật duy nhất). Nếu ai đó đổi
    // 1 trong 2 nơi mà quên đổi nơi còn lại, test này bắt ngay — đây chính xác là cách F36 tái phát
    // trước đây (giá trị `.env.example` và blocklist code lệch nhau âm thầm, không ai phát hiện).
    it('A4 — giá trị FIRST_ADMIN_PASSWORD thật trong .env.example khớp CHÍNH XÁC với PRODUCTION_SECRET_PLACEHOLDERS (drift-proof)', () => {
      const envExamplePath = join(__dirname, '../../../../.env.example');
      const envExampleContent = readFileSync(envExamplePath, 'utf-8');
      const match = envExampleContent.match(/^FIRST_ADMIN_PASSWORD=(.*)$/m);
      expect(match).not.toBeNull();
      expect(match![1].trim()).toBe(
        PRODUCTION_SECRET_PLACEHOLDERS.FIRST_ADMIN_PASSWORD,
      );
    });

    it('A9 — rerun với Organization đã tồn tại (ALREADY_INITIALIZED) VẪN từ chối giá trị placeholder mới bổ sung, KHÔNG chạm tới bước kiểm tra idempotency (giữ nguyên hành vi đã có: credential validation luôn chạy trước, mọi lần gọi)', async () => {
      const tx = createMockTx();
      // Cố ý KHÔNG mock organization.findFirst trả về gì — nếu code vô tình gọi tới, test sẽ lộ ra
      // (mock mặc định trả undefined, không phải hành vi mong muốn nếu bị gọi).
      const prisma = createMockPrisma(tx);
      const input: FirstAdminInitializationInput = {
        ...validInput,
        administrator: {
          ...validInput.administrator,
          password: PRODUCTION_SECRET_PLACEHOLDERS.FIRST_ADMIN_PASSWORD,
        },
      };

      await expect(
        initializeFirstAdmin(asPrismaPick(prisma), input),
      ).rejects.toThrow(/mặc định\/placeholder đã biết/i);

      expect(tx.organization.findFirst).not.toHaveBeenCalled();
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('A10 — hành vi chặn KHÔNG phụ thuộc NODE_ENV (áp dụng ở mọi môi trường, không có nhánh bypass cho dev/test)', async () => {
      const originalNodeEnv = process.env.NODE_ENV;
      try {
        // Thử với NODE_ENV rỗng, 'development', và 'test' — cả 3 đều phải bị chặn giống hệt nhau,
        // vì assertCredentialAllowed() không hề đọc process.env — chứng minh không có đường tắt
        // dev/test nào có thể vô tình rò rỉ giá trị bị chặn vào production.
        for (const nodeEnv of [undefined, 'development', 'test']) {
          if (nodeEnv === undefined) {
            delete process.env.NODE_ENV;
          } else {
            process.env.NODE_ENV = nodeEnv;
          }

          const tx = createMockTx();
          tx.organization.findFirst.mockResolvedValue(null);
          const prisma = createMockPrisma(tx);
          const input: FirstAdminInitializationInput = {
            ...validInput,
            administrator: {
              ...validInput.administrator,
              password: PRODUCTION_SECRET_PLACEHOLDERS.FIRST_ADMIN_PASSWORD,
            },
          };

          await expect(
            initializeFirstAdmin(asPrismaPick(prisma), input),
          ).rejects.toThrow(/mặc định\/placeholder đã biết/i);
          expect(tx.organization.create).not.toHaveBeenCalled();
        }
      } finally {
        if (originalNodeEnv === undefined) {
          delete process.env.NODE_ENV;
        } else {
          process.env.NODE_ENV = originalNodeEnv;
        }
      }
    });
  });

  describe('[5] thất bại giữa chừng — không tạo bước sau khi bước trước đã lỗi (bằng chứng ý định nguyên tử ở mức mock-interaction)', () => {
    it('nếu user.create() lỗi, KHÔNG có bước nào sau đó (organization.update/role.create/rolePermission.createMany/userRole.create) được gọi', async () => {
      const tx = createMockTx();
      tx.organization.findFirst.mockResolvedValue(null);
      const dbError = new Error('unique constraint violated');
      tx.user.create.mockRejectedValue(dbError);
      const prisma = createMockPrisma(tx);

      await expect(
        initializeFirstAdmin(asPrismaPick(prisma), validInput),
      ).rejects.toBe(dbError);

      expect(tx.organization.create).toHaveBeenCalledTimes(1);
      expect(tx.branch.create).toHaveBeenCalledTimes(1);
      expect(tx.organization.update).not.toHaveBeenCalled();
      expect(tx.role.create).not.toHaveBeenCalled();
      expect(tx.rolePermission.createMany).not.toHaveBeenCalled();
      expect(tx.userRole.create).not.toHaveBeenCalled();
    });

    it('nếu organization.create() lỗi ngay từ đầu, không bước nào khác được gọi', async () => {
      const tx = createMockTx();
      tx.organization.findFirst.mockResolvedValue(null);
      const dbError = new Error('connection lost');
      tx.organization.create.mockRejectedValue(dbError);
      const prisma = createMockPrisma(tx);

      await expect(
        initializeFirstAdmin(asPrismaPick(prisma), validInput),
      ).rejects.toBe(dbError);

      expect(tx.branch.create).not.toHaveBeenCalled();
      expect(tx.user.create).not.toHaveBeenCalled();
      expect(tx.role.create).not.toHaveBeenCalled();
    });
  });

  describe('[Phase 2] §3 Precondition P2 / §7 Failure Behavior — Permission catalog trống', () => {
    it('ném lỗi RÕ RÀNG khi Permission catalog trống (KHÔNG âm thầm tạo Administrator có Role 0 quyền)', async () => {
      const tx = createMockTx();
      tx.organization.findFirst.mockResolvedValue(null);
      tx.permission.findMany.mockResolvedValue([]);
      const prisma = createMockPrisma(tx);

      await expect(
        initializeFirstAdmin(asPrismaPick(prisma), validInput),
      ).rejects.toThrow(/permission catalog trống/i);
    });

    it('khi Permission catalog trống — KHÔNG gọi rolePermission.createMany()/userRole.create() (không tạo kết quả suy giảm)', async () => {
      const tx = createMockTx();
      tx.organization.findFirst.mockResolvedValue(null);
      tx.permission.findMany.mockResolvedValue([]);
      const prisma = createMockPrisma(tx);

      await expect(
        initializeFirstAdmin(asPrismaPick(prisma), validInput),
      ).rejects.toThrow();

      expect(tx.rolePermission.createMany).not.toHaveBeenCalled();
      expect(tx.userRole.create).not.toHaveBeenCalled();
    });

    it('Organization/Branch/User/Role VẪN được gọi tạo trước khi phát hiện catalog trống (đúng thứ tự Phase 1, không đổi) — nhưng nằm trong transaction nên vẫn rollback nguyên vẹn', async () => {
      const tx = createMockTx();
      tx.organization.findFirst.mockResolvedValue(null);
      tx.permission.findMany.mockResolvedValue([]);
      const prisma = createMockPrisma(tx);

      await expect(
        initializeFirstAdmin(asPrismaPick(prisma), validInput),
      ).rejects.toThrow();

      // Thứ tự tạo record giữ NGUYÊN như Phase 1 — chỉ nhánh xử lý catalog rỗng đổi từ
      // "bỏ qua trong im lặng" sang "ném lỗi", không đổi transaction semantics/thứ tự các bước.
      expect(tx.organization.create).toHaveBeenCalledTimes(1);
      expect(tx.branch.create).toHaveBeenCalledTimes(1);
      expect(tx.user.create).toHaveBeenCalledTimes(1);
      expect(tx.role.create).toHaveBeenCalledTimes(1);
    });
  });
});
