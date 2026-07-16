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
});
