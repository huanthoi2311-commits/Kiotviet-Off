import { PrismaClient } from '@prisma/client';
import {
  ALLOWED_TARGET_PLANS,
  changeSubscriptionPlan,
  SubscriptionPlanChangeDowngradeBlockedError,
  SubscriptionPlanChangeInvalidTargetError,
  SubscriptionPlanChangeInvalidTargetPlanError,
  SubscriptionPlanChangeOrganizationNotFoundError,
  SubscriptionPlanChangeSubscriptionMissingError,
} from '../src/modules/platform/bootstrap/subscription-plan-changer';

/**
 * T053.06I — script CLI mỏng, đổi OrganizationSubscription.plan cho MỘT Organization ĐÃ TỒN TẠI một
 * cách an toàn (có kiểm tra usage trước khi downgrade, có audit, có preview). Chạy qua:
 *
 *   npm run subscription:change-plan -- --organization-id=<uuid> --plan=<PLAN> [--confirm]
 *   npm run subscription:change-plan -- --organization-slug=<slug> --plan=<PLAN> [--confirm]
 *
 * KHÔNG có --confirm => preview only, KHÔNG ghi gì (an toàn mặc định). --dry-run được chấp nhận như
 * một cách viết tường minh của "không --confirm", hành vi giống hệt nhau.
 *
 * Đây là hành động vận hành viên CHỦ Ý, hiếm khi chạy — cùng lớp với `promote-platform-admin.ts`.
 * KHÔNG có JWT auth — ranh giới cấp quyền là truy cập OS/server + khả năng chạy CLI này.
 */
function readArg(name: string): string | undefined {
  const prefix = `--${name}=`;
  const found = process.argv.find((arg) => arg.startsWith(prefix));
  return found ? found.slice(prefix.length) : undefined;
}

function hasFlag(name: string): boolean {
  return process.argv.includes(`--${name}`);
}

function printPreview(
  result: Extract<
    Awaited<ReturnType<typeof changeSubscriptionPlan>>,
    { outcome: 'PREVIEW' }
  >,
): void {
  console.log('— PREVIEW (không có --confirm, chưa ghi gì) —');
  console.log(`Organization: ${result.organizationId}`);
  console.log(
    `Hiện tại: plan=${result.currentPlan} status=${result.currentStatus}`,
  );
  console.log('Hạn mức hiện tại:', result.currentLimits);
  console.log(`Mục tiêu: plan=${result.targetPlan}`);
  console.log('Hạn mức mục tiêu:', result.targetLimits);
  console.log('Usage hiện tại:', result.usage);
  if (result.noOp) {
    console.log(
      '=> Subscription ĐÃ ở đúng trạng thái mục tiêu — chạy với --confirm sẽ là NO-OP, không ghi gì.',
    );
    return;
  }
  if (result.allowed) {
    console.log('=> Cho phép đổi plan. Chạy lại với --confirm để thực sự ghi.');
  } else {
    console.log(
      `=> BỊ CHẶN: tài nguyên ${result.blockedResource} đang dùng ${result.blockedCurrentUsage}, vượt hạn mức mục tiêu ${result.blockedTargetLimit}. Không thể đổi plan cho tới khi giảm usage hoặc chọn plan khác.`,
    );
  }
}

async function main(): Promise<void> {
  const organizationId = readArg('organization-id');
  const organizationSlug = readArg('organization-slug');
  const plan = readArg('plan');
  const confirm = hasFlag('confirm');

  if (!plan) {
    throw new Error(
      `Thiếu tham số bắt buộc --plan=<PLAN>. Các plan hợp lệ: ${ALLOWED_TARGET_PLANS.join(', ')}. ` +
        'Cách dùng: npm run subscription:change-plan -- [--organization-id=<uuid>|--organization-slug=<slug>] --plan=<PLAN> [--confirm]',
    );
  }

  const prisma = new PrismaClient();
  try {
    const result = await changeSubscriptionPlan(prisma, {
      organizationId,
      organizationSlug,
      targetPlan: plan,
      commit: confirm,
    });

    if (result.outcome === 'PREVIEW') {
      printPreview(result);
      return;
    }
    if (result.outcome === 'NO_OP') {
      console.log(
        `✓ Organization ${result.organizationId} đã ở đúng plan=${result.currentPlan}/status=${result.currentStatus} từ trước — không có thay đổi nào, không ghi audit mới.`,
      );
      return;
    }
    console.log(
      `✓ Đã đổi plan cho Organization ${result.organizationId}: ${result.previousPlan} → ${result.targetPlan} (audit=${result.auditLogId}).`,
    );
    console.log('Hạn mức trước:', result.previousLimits);
    console.log('Hạn mức sau:', result.targetLimits);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  if (
    error instanceof SubscriptionPlanChangeOrganizationNotFoundError ||
    error instanceof SubscriptionPlanChangeSubscriptionMissingError ||
    error instanceof SubscriptionPlanChangeInvalidTargetPlanError ||
    error instanceof SubscriptionPlanChangeInvalidTargetError
  ) {
    console.error(`✗ Đổi plan thất bại: ${error.message}`);
  } else if (error instanceof SubscriptionPlanChangeDowngradeBlockedError) {
    console.error(`✗ Đổi plan bị chặn: ${error.message}`);
  } else {
    console.error(
      '✗ Đổi plan thất bại:',
      error instanceof Error ? error.message : error,
    );
  }
  process.exitCode = 1;
});
