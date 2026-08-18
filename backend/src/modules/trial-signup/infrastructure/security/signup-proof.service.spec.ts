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
});
