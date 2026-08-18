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

  /** T053.04 D11 — nội dung theo `purpose`, KHÔNG phải template-engine tổng quát (Architect
   * Decision D11) — chỉ đủ tách biệt 2 nội dung hiện có. `purpose` cũ (forgot-password) giữ
   * NGUYÊN VĂN chuỗi gốc, không đổi 1 ký tự nào (Architect Decision D13 — không refactor luồng
   * forgot-password). */
  private emailContent(
    purpose: SendOtpEmailJobData['purpose'],
    otp: string,
  ): { subject: string; text: string } {
    if (purpose === 'TRIAL_SIGNUP') {
      return {
        subject: 'Mã xác thực đăng ký dùng thử — POS ERP Enterprise',
        text: `Mã OTP của bạn là ${otp}. Mã có hiệu lực trong 5 phút. Vui lòng không chia sẻ mã này với bất kỳ ai.`,
      };
    }
    return {
      subject: 'Mã xác thực đặt lại mật khẩu — POS ERP Enterprise',
      text: `Mã OTP của bạn là ${otp}. Mã có hiệu lực trong 5 phút. Vui lòng không chia sẻ mã này với bất kỳ ai.`,
    };
  }

  private async handle(job: Job<SendOtpEmailJobData>): Promise<void> {
    const { to, otp, purpose } = job.data;
    const { subject, text } = this.emailContent(purpose, otp);

    if (!this.transporter) {
      // T030.11 (DISCOVERY-T030 F17) — winston ghi log ra `logs/*.log` (DailyRotateFile, giữ 14
      // ngày), nên in nguyên giá trị OTP vào đây tương đương ghi 1 secret sống ra đĩa 14 ngày.
      // Ở production, che giá trị thật — CHỈ giữ đủ ngữ cảnh vận hành (to=, lý do fallback) để
      // chẩn đoán sự cố gửi mail, KHÔNG bao giờ lộ mã thật. Ở môi trường khác (dev/test), giữ
      // NGUYÊN hành vi cũ — đây là cách duy nhất để đọc OTP khi chưa cấu hình SMTP thật cho local
      // dev (đã tài liệu hóa ở `docs/setup/DEVELOPMENT-SETUP.md` §8), không đổi để không phá quy
      // trình dev đang dùng.
      const isProduction = this.config.get<string>('env') === 'production';
      const otpForLog = isProduction ? '[REDACTED]' : otp;
      this.logger.warn(
        `SMTP chưa cấu hình (SMTP_HOST rỗng) — log OTP thay vì gửi thật: to=${to} otp=${otpForLog}`,
      );
      return;
    }

    await this.transporter.sendMail({ from: this.from, to, subject, text });
  }
}
