import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Job } from 'bullmq';
import { createTransport, Transporter } from 'nodemailer';
import { requestContextStorage } from '../../../../common/context/request-context';
import { MAIL_QUEUE, SendOtpEmailJobData } from './mail.constants';

@Processor(MAIL_QUEUE)
export class MailProcessor extends WorkerHost {
  private readonly logger = new Logger(MailProcessor.name);
  private readonly transporter: Transporter | null;
  private readonly from: string;

  constructor(private readonly config: ConfigService) {
    super();
    const host = this.config.get<string>('mail.host');
    this.from = this.config.get<string>('mail.from')!;
    this.transporter = host
      ? createTransport({
          host,
          port: this.config.get<number>('mail.port'),
          auth: this.config.get<string>('mail.user')
            ? {
                user: this.config.get<string>('mail.user'),
                pass: this.config.get<string>('mail.pass'),
              }
            : undefined,
        })
      : null;
  }

  async process(job: Job<SendOtpEmailJobData>): Promise<void> {
    // Chạy trong cùng AsyncLocalStorage context với requestId đã enqueue job,
    // để log của worker này nối lại được với log của request HTTP gốc.
    return requestContextStorage.run(
      { requestId: job.data.requestId ?? job.id ?? 'unknown' },
      () => this.handle(job),
    );
  }

  private async handle(job: Job<SendOtpEmailJobData>): Promise<void> {
    const { to, otp } = job.data;
    const subject = 'Mã xác thực đặt lại mật khẩu — POS ERP Enterprise';
    const text = `Mã OTP của bạn là ${otp}. Mã có hiệu lực trong 5 phút. Vui lòng không chia sẻ mã này với bất kỳ ai.`;

    if (!this.transporter) {
      this.logger.warn(
        `SMTP chưa cấu hình (SMTP_HOST rỗng) — log OTP thay vì gửi thật: to=${to} otp=${otp}`,
      );
      return;
    }

    await this.transporter.sendMail({ from: this.from, to, subject, text });
  }
}
