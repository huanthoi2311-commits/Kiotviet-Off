export const MAIL_QUEUE = 'mail';
export const SEND_OTP_EMAIL_JOB = 'send-otp-email';

export interface SendOtpEmailJobData {
  to: string;
  otp: string;
  /** X-Request-ID của request đã enqueue job — để log của worker nối lại được với request gốc. */
  requestId?: string;
}
