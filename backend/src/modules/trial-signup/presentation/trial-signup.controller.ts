import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  Res,
} from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { ConfigService } from '@nestjs/config';
import { Throttle } from '@nestjs/throttler';
import type { Request, Response } from 'express';
import { ApiCommonErrors } from '../../../common/swagger/api-common-errors.decorator';
import { LoginResponseDto } from '../../auth/application/dto/login-response.dto';
import { IssuedSession } from '../../auth/application/auth.service';
import { DeviceContext } from '../../auth/domain/value-objects/device-context';
import { RequestSignupOtpDto } from '../application/dto/request-signup-otp.dto';
import { VerifySignupOtpDto } from '../application/dto/verify-signup-otp.dto';
import { SignupProofResponseDto } from '../application/dto/signup-proof-response.dto';
import { FinalizeTrialSignupDto } from '../application/dto/finalize-trial-signup.dto';
import { SignupOtpService } from '../application/signup-otp.service';
import { TrialSignupService } from '../application/trial-signup.service';

const REFRESH_COOKIE_NAME = 'refresh_token';
const REFRESH_COOKIE_PATH = '/';

/**
 * T053.04 D14 — TOÀN BỘ 3 route ở đây KHÔNG có `JwtAuthGuard`/bất kỳ guard nào (public, giống hệt
 * `POST /auth/login`) — đây CHÍNH LÀ điểm vào công khai đầu tiên của hệ thống (Architect Decision
 * D14). `finalize` (`POST /trial-signup`) mirror NGUYÊN VẸN cookie-delivery logic của
 * `AuthController.login()` (Web nhận refresh token qua HttpOnly Cookie, Mobile nhận trong body) —
 * để khách hàng "đăng nhập bình thường" ngay sau khi đăng ký (mục tiêu #9 của T053.04), không cần
 * gọi `POST /auth/login` riêng.
 */
@ApiTags('Trial Signup')
@Controller('trial-signup')
export class TrialSignupController {
  constructor(
    private readonly signupOtpService: SignupOtpService,
    private readonly trialSignupService: TrialSignupService,
    private readonly config: ConfigService,
  ) {}

  @Post('request-otp')
  @HttpCode(HttpStatus.NO_CONTENT)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @ApiOperation({
    summary:
      'Gửi OTP xác thực email đăng ký dùng thử (cooldown 60s, tối đa 5 lần/giờ)',
  })
  @ApiCommonErrors()
  async requestOtp(@Body() dto: RequestSignupOtpDto): Promise<void> {
    await this.signupOtpService.requestOtp(dto.email);
  }

  @Post('verify-otp')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @ApiOperation({
    summary: 'Xác thực OTP, nhận signup proof (hiệu lực 10 phút)',
  })
  @ApiResponse({ status: 200, type: SignupProofResponseDto })
  @ApiCommonErrors()
  async verifyOtp(
    @Body() dto: VerifySignupOtpDto,
  ): Promise<SignupProofResponseDto> {
    return this.signupOtpService.verifyOtp(dto.email, dto.otp);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @ApiOperation({
    summary:
      'Hoàn tất đăng ký dùng thử — tạo Organization (TRIAL) + Owner, đăng nhập ngay',
  })
  @ApiResponse({ status: 201, type: LoginResponseDto })
  @ApiCommonErrors()
  async finalize(
    @Body() dto: FinalizeTrialSignupDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<LoginResponseDto> {
    const device = this.buildDeviceContext(req);
    const issued = await this.trialSignupService.finalize(
      dto,
      { ip: device.ip, userAgent: device.userAgent },
      device,
    );
    return this.deliver(issued, device.clientType, res);
  }

  // ---------------------------------------------------------------------
  // T053.04 — mirror NGUYÊN VẸN AuthController's cookie helpers (private, scope trong controller
  // này) để hành vi cookie giống HỆT `POST /auth/login` — không tái cấu trúc AuthController để
  // dùng chung (giữ ranh giới module, tránh phụ thuộc chéo không cần thiết cho ~20 dòng ổn định).

  private getClientType(req: Request): DeviceContext['clientType'] {
    const header = (
      req.headers['x-client-type'] as string | undefined
    )?.toLowerCase();
    return header === 'mobile' ? 'MOBILE' : 'WEB';
  }

  private buildDeviceContext(req: Request): DeviceContext {
    return {
      userAgent: req.headers['user-agent'] ?? null,
      ip: req.ip ?? null,
      clientType: this.getClientType(req),
      deviceName: null,
    };
  }

  private deliver(
    issued: IssuedSession,
    clientType: DeviceContext['clientType'],
    res: Response,
  ): LoginResponseDto {
    if (clientType === 'MOBILE') {
      return issued.response;
    }

    res.cookie(REFRESH_COOKIE_NAME, issued.response.refreshToken, {
      httpOnly: true,
      secure: this.config.get<boolean>('auth.cookieSecure') ?? true,
      sameSite: 'lax',
      path: REFRESH_COOKIE_PATH,
      expires: issued.refreshTokenExpiresAt,
    });

    return {
      accessToken: issued.response.accessToken,
      userInfo: issued.response.userInfo,
    };
  }
}
