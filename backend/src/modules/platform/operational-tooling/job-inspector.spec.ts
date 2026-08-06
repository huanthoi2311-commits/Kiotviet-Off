import type { Job, Queue } from 'bullmq';
import { listFailedJobs } from './job-inspector';

describe('listFailedJobs — SPEC-T023 Finding 9 (FR9.1, IC9.2 read-only)', () => {
  function fakeJob(overrides: Partial<Job>): Job {
    return {
      id: '1',
      name: 'send-otp-email',
      failedReason: 'SMTP timeout',
      timestamp: 1700000000000,
      attemptsMade: 3,
      ...overrides,
    } as Job;
  }

  it('[AC9.1] queue có job thất bại → trả về đúng thông tin job đó', async () => {
    const job = fakeJob({});
    const queue = {
      getFailed: jest.fn().mockResolvedValue([job]),
    } as unknown as Pick<Queue, 'getFailed'>;

    const result = await listFailedJobs(queue);

    expect(result).toEqual([
      {
        id: '1',
        name: 'send-otp-email',
        failedReason: 'SMTP timeout',
        timestamp: 1700000000000,
        attemptsMade: 3,
      },
    ]);
  });

  it('queue không có job thất bại → trả về mảng rỗng', async () => {
    const queue = {
      getFailed: jest.fn().mockResolvedValue([]),
    } as unknown as Pick<Queue, 'getFailed'>;

    const result = await listFailedJobs(queue);
    expect(result).toEqual([]);
  });

  it('job thiếu id/failedReason → fallback an toàn, không throw', async () => {
    const job = fakeJob({ id: undefined, failedReason: undefined });
    const queue = {
      getFailed: jest.fn().mockResolvedValue([job]),
    } as unknown as Pick<Queue, 'getFailed'>;

    const result = await listFailedJobs(queue);
    expect(result[0].id).toBe('unknown');
    expect(result[0].failedReason).toBe('');
  });

  it('[IC9.2] chỉ gọi getFailed — không có phương thức ghi/xóa nào được gọi', async () => {
    const getFailed = jest.fn().mockResolvedValue([]);
    const queue = { getFailed } as unknown as Pick<Queue, 'getFailed'>;

    await listFailedJobs(queue);

    expect(getFailed).toHaveBeenCalledTimes(1);
    expect(Object.keys(queue)).toEqual(['getFailed']);
  });
});
