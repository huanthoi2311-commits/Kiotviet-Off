import { Module } from '@nestjs/common';
import { OrganizationModule } from '../organization/organization.module';
import { SubscriptionExpiryScheduler } from './application/subscription-expiry.scheduler';
import { SubscriptionLifecycleService } from './application/subscription-lifecycle.service';

/**
 * T053.06F — module hẹp DUY NHẤT cho vòng đời hết hạn Subscription (Cron + orchestration).
 * Import `OrganizationModule` để dùng ĐÚNG `ORGANIZATION_REPOSITORY` đã export sẵn (mirror
 * precedent T053.04's `ORGANIZATION_CODE_GENERATOR` export — "chỉ mở rộng export, không đổi hành
 * vi bất kỳ consumer nào đã có") — KHÔNG tự mở writer thứ 2 vào `organization_subscriptions`.
 *
 * `ScheduleModule.forRoot()` đăng ký 1 LẦN DUY NHẤT ở `AppModule` (không đăng ký lại ở đây) —
 * `@Cron()` trên `SubscriptionExpiryScheduler` tự được `SchedulerRegistry` (từ `ScheduleModule`)
 * phát hiện qua provider bên dưới, không cần import `ScheduleModule` tại module lá này.
 */
@Module({
  imports: [OrganizationModule],
  providers: [SubscriptionLifecycleService, SubscriptionExpiryScheduler],
  exports: [SubscriptionLifecycleService],
})
export class SubscriptionLifecycleModule {}
