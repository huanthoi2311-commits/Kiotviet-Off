import { InjectQueue } from '@nestjs/bullmq';
import { Injectable } from '@nestjs/common';
import { Queue } from 'bullmq';
import { getRequestId } from '../../../../common/context/request-context';
import {
  MAIL_QUEUE,
  SEND_OTP_EMAIL_JOB,
  SendOtpEmailJobData,
} from './mail.constants';

/**
 * T030.9 — BullMQ's connection dùng `maxRetriesPerRequest: null` (bắt buộc bởi chính BullMQ cho
 * mọi connection blocking — xem `redis-options.util.ts`'s `buildBullMqConnectionOptions`), nghĩa
 * là 1 lệnh như `Queue.add()` phát ra khi Redis không khả dụng sẽ nằm chờ TRONG offline queue của
 * ioredis VÔ THỜI HẠN cho tới khi kết nối lại được — đúng ý đồ BullMQ (không mất job), nhưng có
 * nghĩa là HTTP request gọi `sendOtpEmail()` (qua `ForgotPasswordService.requestOtp()`) sẽ treo vô
 * hạn nếu không chặn ở đây. Giới hạn RIÊNG ở tầng gọi (request-path), KHÔNG đổi options connection
 * của BullMQ — lệnh `.add()` gốc VẪN còn nằm trong offline queue của ioredis sau khi Promise.race
 * này timeout (không hủy lệnh, không mất job nếu Redis quay lại sau đó); chỉ HTTP response không
 * còn chờ nó nữa.
 */
const MAIL_QUEUE_ADD_TIMEOUT_MS = 3000;

class MailQueueUnavailableError extends Error {
  constructor() {
    super(
      `Không thể đưa job vào hàng đợi "${MAIL_QUEUE}" trong ${MAIL_QUEUE_ADD_TIMEOUT_MS}ms — Redis/BullMQ có thể đang không khả dụng`,
    );
    this.name = 'MailQueueUnavailableError';
  }
}

/**
 * Không gửi email đồng bộ trong request — đẩy qua BullMQ để có retry/backoff
 * (đã cấu hình mặc định ở QueueModule) và không chặn response API.
 */
@Injectable()
export class MailService {
  constructor(
    @InjectQueue(MAIL_QUEUE)
    private readonly mailQueue: Queue<SendOtpEmailJobData>,
  ) {}

  async sendOtpEmail(to: string, otp: string): Promise<void> {
    let timer: NodeJS.Timeout;
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(
        () => reject(new MailQueueUnavailableError()),
        MAIL_QUEUE_ADD_TIMEOUT_MS,
      );
    });

    try {
      await Promise.race([
        this.mailQueue.add(SEND_OTP_EMAIL_JOB, {
          to,
          otp,
          requestId: getRequestId(),
        }),
        timeout,
      ]);
    } finally {
      clearTimeout(timer!);
    }
  }
}
