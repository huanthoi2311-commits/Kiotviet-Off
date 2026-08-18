import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { InternalServerErrorException } from '@nestjs/common';
import { SignupProofService } from './signup-proof.service';

function makeConfig(secret: string | undefined): ConfigService {
  return {
    get: jest.fn(() => secret),
  } as unknown as ConfigService;
}

describe('SignupProofService (T053.04 D2)', () => {
  let jwtService: JwtService;

  beforeEach(() => {
    jwtService = new JwtService({});
  });

  it('hashOtp() dùng HMAC-SHA256 CÓ secret — KHÁC hash trần forgot-password (không đoán ra nếu không biết secret)', () => {
    const service = new SignupProofService(jwtService, makeConfig('secret-a'));
    const hashA = service.hashOtp('123456');

    const serviceOtherSecret = new SignupProofService(
      jwtService,
      makeConfig('secret-b'),
    );
    const hashB = serviceOtherSecret.hashOtp('123456');

    expect(hashA).not.toEqual(hashB);
    expect(hashA).toHaveLength(64); // hex sha256
  });

  it('signProof() → verifyProof() roundtrip đúng email (chuẩn hóa đã được gọi TRƯỚC khi tới đây)', () => {
    const service = new SignupProofService(
      jwtService,
      makeConfig('a-real-signup-secret-32-chars-min'),
    );
    const token = service.signProof('owner@acme.com');
    const result = service.verifyProof(token);

    expect(result).toEqual({ outcome: 'OK', email: 'owner@acme.com' });
  });

  it('verifyProof() với token ký bằng secret KHÁC → INVALID (không thể giả mạo)', () => {
    const signer = new SignupProofService(jwtService, makeConfig('secret-a'));
    const verifier = new SignupProofService(jwtService, makeConfig('secret-b'));
    const token = signer.signProof('owner@acme.com');

    expect(verifier.verifyProof(token)).toEqual({ outcome: 'INVALID' });
  });

  it('verifyProof() với token đã hết hạn → EXPIRED', () => {
    const shortLivedJwt = new JwtService({});
    const service = new SignupProofService(
      shortLivedJwt,
      makeConfig('a-real-signup-secret-32-chars-min'),
    );
    const expiredToken = shortLivedJwt.sign(
      { purpose: 'trial_signup_proof', email: 'owner@acme.com' },
      { secret: 'a-real-signup-secret-32-chars-min', expiresIn: '-1s' },
    );

    expect(service.verifyProof(expiredToken)).toEqual({ outcome: 'EXPIRED' });
  });

  it('verifyProof() với JWT hợp lệ nhưng SAI purpose (vd giả mạo access token khác) → INVALID', () => {
    const service = new SignupProofService(
      jwtService,
      makeConfig('a-real-signup-secret-32-chars-min'),
    );
    const wrongPurposeToken = jwtService.sign(
      { purpose: 'something_else', email: 'owner@acme.com' },
      { secret: 'a-real-signup-secret-32-chars-min', expiresIn: '10m' },
    );

    expect(service.verifyProof(wrongPurposeToken)).toEqual({
      outcome: 'INVALID',
    });
  });

  it('verifyProof() với chuỗi rác (không phải JWT) → INVALID, không throw', () => {
    const service = new SignupProofService(jwtService, makeConfig('secret-a'));
    expect(service.verifyProof('not-a-jwt-at-all')).toEqual({
      outcome: 'INVALID',
    });
  });

  it('hashProofToken() xác định (deterministic) — cùng token luôn ra cùng hash, để tra lookup ổn định', () => {
    const service = new SignupProofService(
      jwtService,
      makeConfig('a-real-signup-secret-32-chars-min'),
    );
    const token = service.signProof('owner@acme.com');

    expect(service.hashProofToken(token)).toEqual(
      service.hashProofToken(token),
    );
  });

  it('hashProofToken() của 2 token KHÁC nhau → hash KHÁC nhau', () => {
    const service = new SignupProofService(
      jwtService,
      makeConfig('a-real-signup-secret-32-chars-min'),
    );
    const tokenA = service.signProof('a@acme.com');
    const tokenB = service.signProof('b@acme.com');

    expect(service.hashProofToken(tokenA)).not.toEqual(
      service.hashProofToken(tokenB),
    );
  });

  it('thiếu SIGNUP_SECRET (undefined) → ném InternalServerErrorException NGAY, KHÔNG âm thầm ký bằng secret rỗng', () => {
    const service = new SignupProofService(jwtService, makeConfig(undefined));
    expect(() => service.signProof('owner@acme.com')).toThrow(
      InternalServerErrorException,
    );
    expect(() => service.hashOtp('123456')).toThrow(
      InternalServerErrorException,
    );
  });

  describe('jti — chống trùng proof token khi ký cùng giây iat (Architect Decision, CASE 29 fix)', () => {
    afterEach(() => {
      jest.useRealTimers();
    });

    it('2 lần signProof() CÙNG email, CÙNG đóng băng đúng 1 giây iat → token KHÁC nhau, jti KHÁC nhau, iat GIỐNG nhau, hash KHÁC nhau', () => {
      jest.useFakeTimers({ advanceTimers: false });
      jest.setSystemTime(new Date('2026-08-18T12:00:00.000Z'));

      const service = new SignupProofService(
        jwtService,
        makeConfig('a-real-signup-secret-32-chars-min'),
      );
      const token1 = service.signProof('owner@acme.com');
      const token2 = service.signProof('owner@acme.com');

      expect(token1).not.toEqual(token2);

      const payload1: { email: string; iat: number; jti: string } =
        jwtService.decode(token1);
      const payload2: { email: string; iat: number; jti: string } =
        jwtService.decode(token2);

      expect(payload1.email).toEqual(payload2.email);
      expect(payload1.iat).toEqual(payload2.iat);
      expect(payload1.jti).not.toEqual(payload2.jti);

      expect(service.hashProofToken(token1)).not.toEqual(
        service.hashProofToken(token2),
      );
    });
  });

  describe('jti — validate ở verifyProof() (Architect Decision)', () => {
    it('proof hợp lệ luôn có jti là chuỗi không rỗng', () => {
      const service = new SignupProofService(
        jwtService,
        makeConfig('a-real-signup-secret-32-chars-min'),
      );
      const token = service.signProof('owner@acme.com');
      const payload: { jti: string } = jwtService.decode(token);

      expect(typeof payload.jti).toBe('string');
      expect(payload.jti.length).toBeGreaterThan(0);
    });

    it('JWT hợp lệ nhưng THIẾU jti (proof cũ trước fix, hoặc giả mạo thủ công) → INVALID', () => {
      const service = new SignupProofService(
        jwtService,
        makeConfig('a-real-signup-secret-32-chars-min'),
      );
      const noJtiToken = jwtService.sign(
        { purpose: 'trial_signup_proof', email: 'owner@acme.com' },
        { secret: 'a-real-signup-secret-32-chars-min', expiresIn: '10m' },
      );

      expect(service.verifyProof(noJtiToken)).toEqual({ outcome: 'INVALID' });
    });

    it('JWT hợp lệ nhưng jti RỖNG → INVALID', () => {
      const service = new SignupProofService(
        jwtService,
        makeConfig('a-real-signup-secret-32-chars-min'),
      );
      const emptyJtiToken = jwtService.sign(
        { purpose: 'trial_signup_proof', email: 'owner@acme.com', jti: '' },
        { secret: 'a-real-signup-secret-32-chars-min', expiresIn: '10m' },
      );

      expect(service.verifyProof(emptyJtiToken)).toEqual({
        outcome: 'INVALID',
      });
    });

    it('proof bị chỉnh sửa jti sau khi ký (chữ ký không còn khớp) → INVALID', () => {
      const service = new SignupProofService(
        jwtService,
        makeConfig('a-real-signup-secret-32-chars-min'),
      );
      const token = service.signProof('owner@acme.com');
      const [header, , signature] = token.split('.');
      const tamperedPayload = Buffer.from(
        JSON.stringify({
          purpose: 'trial_signup_proof',
          email: 'owner@acme.com',
          jti: 'attacker-controlled-jti',
        }),
      ).toString('base64url');
      const tamperedToken = `${header}.${tamperedPayload}.${signature}`;

      expect(service.verifyProof(tamperedToken)).toEqual({
        outcome: 'INVALID',
      });
    });
  });
});
