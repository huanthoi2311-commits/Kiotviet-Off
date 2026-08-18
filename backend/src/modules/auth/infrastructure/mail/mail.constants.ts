export const MAIL_QUEUE = 'mail';
export const SEND_OTP_EMAIL_JOB = 'send-otp-email';

/**
 * T053.04 D11 — discriminator PURPOSE, để `MailProcessor` chọn đúng nội dung email (không dùng
 * chung 1 chuỗi hardcode cho cả 2 luồng nữa). KHÔNG phải template-engine tổng quát — chỉ đủ tách
 * biệt 2 nội dung hiện có, đúng phạm vi T053.04 (Architect Decision D11: "Do NOT introduce a
 * general template-engine refactor").
 */
export type OtpEmailPurpose = 'PASSWORD_RESET' | 'TRIAL_SIGNUP';

export interface SendOtpEmailJobData {
  to: string;
  otp: string;
  purpose: OtpEmailPurpose;
  /** X-Request-ID của request đã enqueue job — để log của worker nối lại được với request gốc. */
  requestId?: string;
}
