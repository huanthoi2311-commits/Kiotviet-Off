import configuration from './configuration';

/**
 * T051.08B — `auth.cookieSecure` là DUY NHẤT nơi tính giá trị hiệu lực của cờ Secure cho cookie
 * `refresh_token`: khi `AUTH_COOKIE_SECURE` chưa được set, PHẢI giữ nguyên hành vi cũ
 * (`NODE_ENV === 'production'`) — không phá vỡ mọi dev/test/CI hiện có chưa từng set biến này.
 */
describe('configuration() — auth.cookieSecure (T051.08B)', () => {
  const ORIGINAL_ENV = process.env;

  beforeEach(() => {
    process.env = { ...ORIGINAL_ENV };
    delete process.env.AUTH_COOKIE_SECURE;
  });

  afterAll(() => {
    process.env = ORIGINAL_ENV;
  });

  it('unset + NODE_ENV=production → falls back to true (preserves pre-T051.08B behavior)', () => {
    process.env.NODE_ENV = 'production';
    expect(configuration().auth.cookieSecure).toBe(true);
  });

  it('unset + NODE_ENV=development → falls back to false (preserves pre-T051.08B behavior)', () => {
    process.env.NODE_ENV = 'development';
    expect(configuration().auth.cookieSecure).toBe(false);
  });

  it('unset + NODE_ENV=test → falls back to false (preserves pre-T051.08B behavior)', () => {
    process.env.NODE_ENV = 'test';
    expect(configuration().auth.cookieSecure).toBe(false);
  });

  it('AUTH_COOKIE_SECURE=false overrides NODE_ENV=production (packaged V1 HTTP topology)', () => {
    process.env.NODE_ENV = 'production';
    process.env.AUTH_COOKIE_SECURE = 'false';
    expect(configuration().auth.cookieSecure).toBe(false);
  });

  it('AUTH_COOKIE_SECURE=true overrides NODE_ENV=development (explicit HTTPS opt-in)', () => {
    process.env.NODE_ENV = 'development';
    process.env.AUTH_COOKIE_SECURE = 'true';
    expect(configuration().auth.cookieSecure).toBe(true);
  });
});
