import { SubscriptionExpiryScheduler } from './subscription-expiry.scheduler';
import { SubscriptionLifecycleService } from './subscription-lifecycle.service';

/** T053.06F §22 — gọi TRỰC TIẾP handler, không chờ wall-clock Cron thật, không sleep. */
describe('SubscriptionExpiryScheduler (T053.06F §10/§22)', () => {
  let lifecycleService: jest.Mocked<
    Pick<SubscriptionLifecycleService, 'expireDueTrials'>
  >;
  let scheduler: SubscriptionExpiryScheduler;

  beforeEach(() => {
    lifecycleService = { expireDueTrials: jest.fn().mockResolvedValue(0) };
    scheduler = new SubscriptionExpiryScheduler(
      lifecycleService as unknown as SubscriptionLifecycleService,
    );
  });

  it('handleExpiryTick() ủy quyền cho SubscriptionLifecycleService.expireDueTrials() đúng 1 lần, không chứa logic nghiệp vụ riêng', async () => {
    await scheduler.handleExpiryTick();
    expect(lifecycleService.expireDueTrials).toHaveBeenCalledTimes(1);
    expect(lifecycleService.expireDueTrials).toHaveBeenCalledWith();
  });

  it('gọi lặp lại nhiều lần (mô phỏng nhiều tick) vẫn ủy quyền đúng mỗi lần, không lỗi', async () => {
    await scheduler.handleExpiryTick();
    await scheduler.handleExpiryTick();
    expect(lifecycleService.expireDueTrials).toHaveBeenCalledTimes(2);
  });
});
