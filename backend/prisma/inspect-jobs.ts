import { Queue } from 'bullmq';
import { listFailedJobs } from '../src/modules/platform/operational-tooling/job-inspector';

/**
 * SPEC-T023 Finding 9 (FR9.1) — script CLI mỏng, chỉ đọc. Kết nối Redis qua REDIS_HOST/REDIS_PORT/
 * REDIS_PASSWORD (cùng biến môi trường ứng dụng chính đã dùng — không phát minh cấu hình mới).
 * Tên queue mặc định 'mail' (queue duy nhất hiện có trong dự án, `auth.module.ts`) — có thể override
 * qua QUEUE_NAME nếu sau này có thêm queue khác.
 */
async function main() {
  const queueName = process.env.QUEUE_NAME ?? 'mail';
  const queue = new Queue(queueName, {
    connection: {
      host: process.env.REDIS_HOST ?? 'localhost',
      port: parseInt(process.env.REDIS_PORT ?? '6379', 10),
      password: process.env.REDIS_PASSWORD || undefined,
    },
  });

  try {
    const failedJobs = await listFailedJobs(queue);
    if (failedJobs.length === 0) {
      console.log(`Queue "${queueName}": không có job thất bại.`);
      return;
    }
    console.log(`Queue "${queueName}": ${failedJobs.length} job thất bại:`);
    for (const job of failedJobs) {
      console.log(
        `  [${job.id}] ${job.name} — thử ${job.attemptsMade} lần, thất bại lúc ${new Date(job.timestamp).toISOString()}: ${job.failedReason}`,
      );
    }
  } finally {
    await queue.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
