import { randomInt } from 'crypto';
import {
  BadRequestException,
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
} from '@nestjs/common';
import { AuditLogService } from '../../platform/audit-log/audit-log.service';
import { PrismaService } from '../../../prisma/prisma.service';
import { ErrorCode } from '../../../common/errors/error-codes';
import { withCode } from '../../../common/errors/with-code';
import { AUTH_USER_REPOSITORY } from '../domain/repositories/auth-user.repository.interface';
import type { IAuthUserRepository } from '../domain/repositories/auth-user.repository.interface';
import { SESSION_REPOSITORY } from '../domain/repositories/session.repository.interface';
import type { ISessionRepository } from '../domain/repositories/session.repository.interface';
import { OTP_REPOSITORY } from '../domain/repositories/otp.repository.interface';
import type { IOtpRepository } from '../domain/repositories/otp.repository.interface';
import { PASSWORD_HASHER } from '../domain/services/password-hasher.interface';
import type { IPasswordHasher } from '../domain/services/password-hasher.interface';
import { MailService } from '../infrastructure/mail/mail.service';
import { TokenService } from '../infrastructure/security/token.service';

const MAX_OTP_SEND_PER_HOUR = 5;
const MAX_OTP_VERIFY_ATTEMPTS = 5;

@Injectable()
export class ForgotPasswordService {
  constructor(
    @Inject(AUTH_USER_REPOSITORY)
    private readonly userRepository: IAuthUserRepository,
    @Inject(SESSION_REPOSITORY)
    private readonly sessionRepository: ISessionRepository,
    @Inject(OTP_REPOSITORY) private readonly otpRepository: IOtpRepository,
    @Inject(PASSWORD_HASHER) private readonly passwordHasher: IPasswordHasher,
    private readonly tokenService: TokenService,
    private readonly mailService: MailService,
    private readonly auditLogService: AuditLogService,
    private readonly prisma: PrismaService,
  ) {}

  private key(organizationSlug: string, email: string): string {
    return `${organizationSlug}:${email}`;
  }

  async requestOtp(organizationSlug: string, email: string): Promise<void> {
    const identifier = this.key(organizationSlug, email);

    const cooldown =
      await this.otpRepository.getCooldownRemainingSeconds(identifier);
    if (cooldown > 0) {
      throw new HttpException(
        withCode(
          ErrorCode.OTP_COOLDOWN_ACTIVE,
          `Vui lòng đợi ${cooldown} giây trước khi gửi lại OTP`,
        ),
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    const sendCount = await this.otpRepository.incrementSendCount(identifier);
    if (sendCount > MAX_OTP_SEND_PER_HOUR) {
      throw new HttpException(
        withCode(
          ErrorCode.OTP_RATE_LIMIT_EXCEEDED,
          'Bạn đã yêu cầu OTP quá 5 lần trong 1 giờ, vui lòng thử lại sau',
        ),
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    await this.otpRepository.startCooldown(identifier);

    const user = await this.userRepository.findByOrganizationSlugAndEmail(
      organizationSlug,
      email,
    );
    // Luôn trả về thành công dù email có tồn tại hay không — tránh lộ thông tin
    // tài khoản nào đang được sử dụng trong hệ thống (user enumeration).
    if (!user) return;

    const otp = randomInt(0, 1_000_000).toString().padStart(6, '0');
    const otpHash = this.tokenService.hashOtp(otp);
    await this.otpRepository.save(identifier, otpHash);
    await this.mailService.sendOtpEmail(email, otp, 'PASSWORD_RESET');
  }

  async verifyOtp(
    organizationSlug: string,
    email: string,
    otp: string,
  ): Promise<void> {
    const identifier = this.key(organizationSlug, email);

    // T053.06B-1 (§6) — throttle account-scoped, ĐỘC LẬP IP throttle hiện có (@Throttle route-level
    // chỉ theo IP). Tính TRƯỚC bất kỳ bước nào khác (kể cả trước khi biết OTP có tồn tại hay không)
    // — cùng nguyên tắc `requestOtp()` đã áp dụng cho cooldown/sendCount ở trên: không tạo oracle
    // mới (identifier không tồn tại thật vẫn bị tính, không phân biệt được với identifier có thật).
    const verifyWindowCount =
      await this.otpRepository.incrementVerifyAttemptWindowCount(identifier);
    if (verifyWindowCount > MAX_OTP_SEND_PER_HOUR * MAX_OTP_VERIFY_ATTEMPTS) {
      throw new HttpException(
        withCode(
          ErrorCode.OTP_VERIFY_RATE_LIMIT_EXCEEDED,
          'Bạn đã thử xác thực OTP quá nhiều lần, vui lòng thử lại sau',
        ),
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    // T053.06B-1 (§2) — trước đây get() → so khớp ở application code → incrementAttempts()/
    // markVerified() (2-3 lệnh Redis riêng biệt, đúng lỗ hổng race condition đã phát hiện). Nay
    // TOÀN BỘ nằm trong 1 lệnh Lua EVAL nguyên tử duy nhất — không còn GET→SET race nào ở tầng
    // application. Giữ NGUYÊN VẸN error code/message/HTTP status cho từng outcome (§3 — không đổi
    // hợp đồng public).
    const otpHash = this.tokenService.hashOtp(otp);
    const result = await this.otpRepository.verifyAndConsume(
      identifier,
      otpHash,
      MAX_OTP_VERIFY_ATTEMPTS,
    );

    if (result.outcome === 'NOT_FOUND') {
      throw new BadRequestException(
        withCode(
          ErrorCode.OTP_INVALID_OR_EXPIRED,
          'OTP không tồn tại hoặc đã hết hạn, vui lòng yêu cầu lại',
        ),
      );
    }
    if (result.outcome === 'MAX_ATTEMPTS') {
      throw new BadRequestException(
        withCode(
          ErrorCode.OTP_MAX_ATTEMPTS_EXCEEDED,
          'Vượt quá số lần thử OTP, vui lòng yêu cầu mã mới',
        ),
      );
    }
    if (result.outcome === 'INCORRECT') {
      throw new BadRequestException(
        withCode(ErrorCode.OTP_INCORRECT, 'OTP không đúng'),
      );
    }
    // result.outcome === 'OK' — verified flag đã được Lua script tạo atomic, không còn bước
    // markVerified() riêng nào cần gọi ở đây nữa.
  }

  async resetPassword(
    organizationSlug: string,
    email: string,
    newPassword: string,
  ): Promise<void> {
    const identifier = this.key(organizationSlug, email);

    // T053.06B-2 (D1/D3) — thay thế hoàn toàn `isVerified()` (GET đơn thuần, KHÔNG tiêu thụ — đúng
    // lỗ hổng double-finalization race đã xác nhận ở Discovery §2/§3: 2 request reset đồng thời
    // CÙNG đọc được verified=true trước khi bất kỳ request nào xoá cờ, cả 2 đều cập nhật mật khẩu
    // thành công, cả 2 đều trả 204). `consumeVerified()` là GETDEL nguyên tử (RedisOtpRepository) —
    // CHỈ ĐÚNG 1 lệnh gọi đồng thời có thể tiêu thụ thành công; mọi lệnh gọi khác — kể cả gọi lại
    // sau khi đã tiêu thụ — nhận `false`, bị từ chối bằng CHÍNH error code cũ (OTP_005), không đổi
    // hợp đồng public (D2 — không có proof/token mới nào lộ ra ngoài).
    const consumed = await this.otpRepository.consumeVerified(identifier);
    if (!consumed) {
      throw new BadRequestException(
        withCode(
          ErrorCode.OTP_NOT_VERIFIED,
          'Vui lòng xác thực OTP trước khi đặt lại mật khẩu',
        ),
      );
    }

    const user = await this.userRepository.findByOrganizationSlugAndEmail(
      organizationSlug,
      email,
    );
    if (!user) {
      throw new BadRequestException(
        withCode(ErrorCode.OTP_ACCOUNT_NOT_FOUND, 'Không tìm thấy tài khoản'),
      );
    }

    const passwordHash = await this.passwordHasher.hash(newPassword);

    // T053.06B-2 (D5) — passwordHash mutation + thu hồi TOÀN BỘ session PHẢI atomic xuyên bảng
    // User/Session (CODING_RULES.md §27 — trước đây 2 lệnh Prisma độc lập, vi phạm quy tắc này,
    // phát hiện ở Discovery §8). Cùng đúng mẫu hình `tx?: Prisma.TransactionClient` đã được duyệt
    // và đang chạy thật ở `CheckoutService`/`IVoucherRepository.incrementUsage()` — không phát
    // minh cơ chế mới, không đổi ranh giới repository (Clean Architecture giữ nguyên: interface
    // vẫn trừu tượng hoá Prisma, `tx?` chỉ là tham số tuỳ chọn).
    //
    // KHÔNG có 2-phase-commit giữa Redis và Postgres (D6) — nếu transaction này thất bại SAU KHI
    // `consumeVerified()` đã tiêu thụ thành công, authorization KHÔNG được khôi phục/tái tạo lại:
    // người dùng phải yêu cầu OTP mới (request → verify → reset lại từ đầu). Đây là hành vi fail-safe
    // được CHẤP NHẬN LÀ CUỐI CÙNG (không phải tạm thời) — ưu tiên đúng đắn/bảo mật hơn tiện lợi
    // retry, và KHÔNG BAO GIỜ để lại 1 authorization có thể dùng lại được.
    await this.prisma.$transaction(async (tx) => {
      await this.userRepository.updatePasswordHash(user.id, passwordHash, tx);
      await this.sessionRepository.revokeAllForUser(user.id, tx);
    });

    // Audit log VẪN nằm NGOÀI transaction Postgres — KHÔNG đổi vị trí tương đối so với trước (trước
    // đây cũng chạy SAU 2 lệnh mutation, ngoài bất kỳ transaction nào vì chưa hề có transaction).
    // `AuditLogService` là service dùng chung TOÀN HỆ THỐNG, best-effort theo thiết kế (tự bắt lỗi,
    // chỉ log warning, KHÔNG BAO GIỜ throw — xem chính doc-comment của nó) và KHÔNG nhận `tx` — mở
    // rộng nó để tham gia transaction của 1 module là thay đổi cross-cutting vượt xa phạm vi B-2,
    // KHÔNG được authorize ở đây. Hệ quả: nếu transaction ở trên thất bại, không có audit row nào
    // được ghi (giống hệt trước đây — audit luôn chạy SAU khi 2 mutation đã thành công); nếu
    // transaction thành công nhưng chính lệnh ghi audit sau đó thất bại, việc đặt lại mật khẩu ĐÃ
    // hoàn tất đầy đủ (khớp hành vi trước T053.06B-2), lỗi audit chỉ log warning theo thiết kế sẵn
    // có của `AuditLogService`.
    await this.auditLogService.log({
      organizationId: user.organizationId,
      userId: user.id,
      action: 'auth.password.reset',
      entityType: 'User',
      entityId: user.id,
    });
  }
}
