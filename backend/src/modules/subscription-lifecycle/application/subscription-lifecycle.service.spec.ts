import type { IOrganizationRepository } from '../../organization/domain/repositories/organization.repository.interface';
import { SubscriptionLifecycleService } from './subscription-lifecycle.service';

describe('SubscriptionLifecycleService (T053.06F)', () => {
  let organizationRepository: jest.Mocked<
    Pick<IOrganizationRepository, 'expireDueTrials'>
  >;
  let service: SubscriptionLifecycleService;

  beforeEach(() => {
    organizationRepository = { expireDueTrials: jest.fn() };
    service = new SubscriptionLifecycleService(
      organizationRepository as unknown as IOrganizationRepository,
    );
  });

  it('ủy quyền cho organizationRepository.expireDueTrials() với đúng now truyền vào', async () => {
    const now = new Date('2026-08-24T00:00:00.000Z');
    organizationRepository.expireDueTrials.mockResolvedValue(2);

    const result = await service.expireDueTrials(now);

    expect(result).toBe(2);
    expect(organizationRepository.expireDueTrials).toHaveBeenCalledWith(now);
  });

  it('mặc định dùng new Date() khi không truyền now', async () => {
    organizationRepository.expireDueTrials.mockResolvedValue(0);
    await service.expireDueTrials();
    expect(organizationRepository.expireDueTrials).toHaveBeenCalledTimes(1);
    const calledWith = organizationRepository.expireDueTrials.mock.calls[0][0];
    expect(calledWith).toBeInstanceOf(Date);
  });

  // U7 (idempotency, tầng service) — trả 0 là kết quả hợp lệ, không throw.
  it('trả về 0 khi không có dòng nào cần chuyển (lặp lại/đã xử lý hết) — không throw', async () => {
    organizationRepository.expireDueTrials.mockResolvedValue(0);
    await expect(service.expireDueTrials()).resolves.toBe(0);
  });
});
