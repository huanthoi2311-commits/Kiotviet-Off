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
    await this.mailQueue.add(SEND_OTP_EMAIL_JOB, {
      to,
      otp,
      requestId: getRequestId(),
    });
  }
}
