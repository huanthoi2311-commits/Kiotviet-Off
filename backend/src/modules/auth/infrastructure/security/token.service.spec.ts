import { createHmac } from 'crypto';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { TokenService } from './token.service';

describe('TokenService', () => {
  let tokenService: TokenService;
  const config = new ConfigService({
    jwt: {
      accessSecret: 'access-secret',
      accessExpiresIn: '15m',
      refreshSecret: 'refresh-secret',
      refreshExpiresIn: '30d',
    },
    signup: {
      secret: 'signup-secret',
    },
    forgotPasswordOtp: {
      secret: 'forgot-password-otp-secret',
    },
  });
  const jwtService = new JwtService({
    secret: 'access-secret',
    signOptions: { expiresIn: '15m' },
  });

  beforeEach(() => {
    tokenService = new TokenService(jwtService, config);
  });

  it('signAccessToken sinh ra JWT hợp lệ, verify lại đúng payload', () => {
    const payload = {
      sub: 'user-1',
      organizationId: 'org-1',
      branchId: 'branch-1',
      email: 'a@b.com',
      permissions: ['product:view'],
      permissionVersion: 1,
      isPlatformAdmin: false,
    };
    const token = tokenService.signAccessToken(payload);
    const decoded = jwtService.verify(token);

    expect(decoded.sub).toBe('user-1');
    expect(decoded.permissions).toEqual(['product:view']);
  });

  it('generateRefreshToken sinh ra token ngẫu nhiên kèm hash và hạn dùng hợp lý', () => {
    const a = tokenService.generateRefreshToken();
    const b = tokenService.generateRefreshToken();

    expect(a.raw).not.toBe(b.raw);
    expect(a.hash).toBe(tokenService.hashRefreshToken(a.raw));
    expect(a.expiresAt.getTime()).toBeGreaterThan(Date.now());
  });

  it('hashRefreshToken là hàm thuần (deterministic) cho cùng input', () => {
    const raw = 'some-raw-refresh-token';
    expect(tokenService.hashRefreshToken(raw)).toBe(
      tokenService.hashRefreshToken(raw),
    );
  });

  it('hashOtp là hàm thuần và khác nhau giữa các OTP khác nhau', () => {
    expect(tokenService.hashOtp('123456')).toBe(tokenService.hashOtp('123456'));
    expect(tokenService.hashOtp('123456')).not.toBe(
      tokenService.hashOtp('654321'),
    );
  });

  it('T053.06B-1 — hashOtp ném InternalServerErrorException khi FORGOT_PASSWORD_OTP_SECRET chưa cấu hình (fail closed, không âm thầm dùng secret khác)', () => {
    const configWithoutOtpSecret = new ConfigService({
      jwt: {
        accessSecret: 'access-secret',
        accessExpiresIn: '15m',
        refreshSecret: 'refresh-secret',
        refreshExpiresIn: '30d',
      },
    });
    const serviceWithoutOtpSecret = new TokenService(
      jwtService,
      configWithoutOtpSecret,
    );
    expect(() => serviceWithoutOtpSecret.hashOtp('123456')).toThrow(
      'FORGOT_PASSWORD_OTP_SECRET chưa được cấu hình',
    );
  });

  describe('T053.06B-1 (§8 Architect Decision) — hashOtp phải tách biệt hoàn toàn khỏi các secret mục đích khác', () => {
    it('đổi FORGOT_PASSWORD_OTP_SECRET làm thay đổi kết quả hash cho cùng 1 OTP', () => {
      const configA = new ConfigService({
        forgotPasswordOtp: { secret: 'forgot-password-otp-secret-A' },
      });
      const configB = new ConfigService({
        forgotPasswordOtp: { secret: 'forgot-password-otp-secret-B' },
      });
      const serviceA = new TokenService(jwtService, configA);
      const serviceB = new TokenService(jwtService, configB);

      expect(serviceA.hashOtp('123456')).not.toBe(serviceB.hashOtp('123456'));
    });

    it('hashOtp KHÔNG phụ thuộc jwt.refreshSecret — đổi refreshSecret, giữ nguyên forgotPasswordOtp.secret, kết quả hashOtp không đổi', () => {
      const baseline = tokenService.hashOtp('123456');

      const configDifferentRefreshSecret = new ConfigService({
        jwt: {
          accessSecret: 'access-secret',
          accessExpiresIn: '15m',
          refreshSecret: 'a-completely-different-refresh-secret',
          refreshExpiresIn: '30d',
        },
        forgotPasswordOtp: { secret: 'forgot-password-otp-secret' },
      });
      const serviceWithDifferentRefreshSecret = new TokenService(
        jwtService,
        configDifferentRefreshSecret,
      );

      expect(serviceWithDifferentRefreshSecret.hashOtp('123456')).toBe(
        baseline,
      );
    });

    it('hashOtp KHÔNG phụ thuộc signup.secret — đổi signup.secret, giữ nguyên forgotPasswordOtp.secret, kết quả hashOtp không đổi', () => {
      const baseline = tokenService.hashOtp('123456');

      const configDifferentSignupSecret = new ConfigService({
        signup: { secret: 'a-completely-different-signup-secret' },
        forgotPasswordOtp: { secret: 'forgot-password-otp-secret' },
      });
      const serviceWithDifferentSignupSecret = new TokenService(
        jwtService,
        configDifferentSignupSecret,
      );

      expect(serviceWithDifferentSignupSecret.hashOtp('123456')).toBe(baseline);
    });

    it('cùng OTP + cùng forgotPasswordOtp.secret nhưng dùng jwt.refreshSecret làm khoá (hành vi CŨ, trước T053.06B-1) sẽ cho hash KHÁC — chứng minh đã thật sự đổi sang secret riêng, không phải trùng hợp', () => {
      const legacyHash = createHmac('sha256', 'refresh-secret')
        .update('123456')
        .digest('hex');
      expect(tokenService.hashOtp('123456')).not.toBe(legacyHash);
    });
  });
});
