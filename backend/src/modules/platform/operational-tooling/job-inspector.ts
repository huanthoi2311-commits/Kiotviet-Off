import type { Queue } from 'bullmq';

/**
 * SPEC-T023 Finding 9 (FR9.1) — CHỈ ĐỌC (IC9.2), không sửa/xóa/retry job. Nhận vào interface hẹp
 * `Pick<Queue, 'getFailed'>` (không phải `Queue` đầy đủ) — enforce ở compile-time rằng hàm không
 * thể gọi bất kỳ thao tác ghi nào của BullMQ.
 */
export interface FailedJobInfo {
  id: string;
  name: string;
  failedReason: string;
  timestamp: number;
  attemptsMade: number;
}

export async function listFailedJobs(
  queue: Pick<Queue, 'getFailed'>,
): Promise<FailedJobInfo[]> {
  const jobs = await queue.getFailed();
  return jobs.map((job) => ({
    id: job.id ?? 'unknown',
    name: job.name,
    failedReason: job.failedReason ?? '',
    timestamp: job.timestamp,
    attemptsMade: job.attemptsMade,
  }));
}
