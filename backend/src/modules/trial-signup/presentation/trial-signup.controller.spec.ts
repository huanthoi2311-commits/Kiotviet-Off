import { ConfigService } from '@nestjs/config';
import type { Request, Response } from 'express';
import { TrialSignupController } from './trial-signup.controller';
import { SignupOtpService } from '../application/signup-otp.service';
import { TrialSignupService } from '../application/trial-signup.service';

function makeReq(overrides: Partial<Request> = {}): Request {
  return {
    headers: { 'user-agent': 'jest' },
    ip: '127.0.0.1',
    ...overrides,
  } as unknown as Request;
}

function makeRes(): Response {
  return {
    cookie: jest.fn(),
  } as unknown as Response;
}

describe('TrialSignupController (T053.04 D14 — public, no guard)', () => {
  let signupOtpService: jest.Mocked<
    Pick<SignupOtpService, 'requestOtp' | 'verifyOtp'>
  >;
  let trialSignupService: jest.Mocked<Pick<TrialSignupService, 'finalize'>>;
  let controller: TrialSignupController;

  beforeEach(() => {
    signupOtpService = {
      requestOtp: jest.fn().mockResolvedValue(undefined),
      verifyOtp: jest.fn().mockResolvedValue({
        signupProofToken: 'proof',
        expiresAt: '2026-01-01T00:10:00.000Z',
      }),
    };
    trialSignupService = {
      finalize: jest.fn().mockResolvedValue({
        response: {
          accessToken: 'access-token',
          refreshToken: 'refresh-token-raw',
          userInfo: {
            id: 'user-1',
            email: 'owner@acme.com',
            username: 'owner',
            organizationId: 'org-1',
            branchId: null,
            permissions: [],
          },
        },
        refreshTokenExpiresAt: new Date('2026-12-31'),
      }),
    };
    controller = new TrialSignupController(
      signupOtpService as unknown as SignupOtpService,
      trialSignupService as unknown as TrialSignupService,
      { get: jest.fn().mockReturnValue(true) } as unknown as ConfigService,
    );
  });

  it('requestOtp() ủy quyền nguyên vẹn cho SignupOtpService', async () => {
    await controller.requestOtp({ email: 'a@b.com' });
    expect(signupOtpService.requestOtp).toHaveBeenCalledWith('a@b.com');
  });

  it('verifyOtp() ủy quyền nguyên vẹn, trả nguyên response', async () => {
    const result = await controller.verifyOtp({
      email: 'a@b.com',
      otp: '123456',
    });
    expect(signupOtpService.verifyOtp).toHaveBeenCalledWith(
      'a@b.com',
      '123456',
    );
    expect(result.signupProofToken).toBe('proof');
  });

  describe('finalize() — cookie delivery (mirror AuthController.login())', () => {
    const dto = {
      signupProofToken: 'proof',
      organization: { displayName: 'Acme', slug: 'acme' },
      owner: { fullName: 'Owner', password: 'SuperSecret123' },
    };

    it('WEB (mặc định) → set HttpOnly cookie refresh_token, response body KHÔNG chứa refreshToken', async () => {
      const req = makeReq();
      const res = makeRes();

      const result = await controller.finalize(dto, req, res);

      expect(res.cookie).toHaveBeenCalledWith(
        'refresh_token',
        'refresh-token-raw',
        expect.objectContaining({ httpOnly: true, path: '/' }),
      );
      expect(result.accessToken).toBe('access-token');
      expect(result).not.toHaveProperty('refreshToken');
    });

    it('Mobile (X-Client-Type: mobile) → refreshToken có trong body, KHÔNG set cookie', async () => {
      const req = makeReq({
        headers: { 'user-agent': 'jest', 'x-client-type': 'mobile' },
      });
      const res = makeRes();

      const result = await controller.finalize(dto, req, res);

      expect(res.cookie).not.toHaveBeenCalled();
      expect(result.refreshToken).toBe('refresh-token-raw');
    });

    it('truyền đúng ip/userAgent từ request vào TrialSignupService.finalize() làm auditContext', async () => {
      const req = makeReq();
      const res = makeRes();

      await controller.finalize(dto, req, res);

      expect(trialSignupService.finalize).toHaveBeenCalledWith(
        dto,
        { ip: '127.0.0.1', userAgent: 'jest' },
        expect.objectContaining({ ip: '127.0.0.1', userAgent: 'jest' }),
      );
    });
  });
});
