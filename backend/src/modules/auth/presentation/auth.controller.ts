import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Req,
  Res,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import type { Request, Response } from 'express';
import { ApiCommonErrors } from '../../../common/swagger/api-common-errors.decorator';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { ErrorCode } from '../../../common/errors/error-codes';
import { withCode } from '../../../common/errors/with-code';
import type { JwtAccessPayload } from '../../../common/types/jwt-payload.type';
import { AuthService, IssuedSession } from '../application/auth.service';
import { ForgotPasswordDto } from '../application/dto/forgot-password.dto';
import { LoginDto } from '../application/dto/login.dto';
import { LoginResponseDto } from '../application/dto/login-response.dto';
import { RefreshTokenDto } from '../application/dto/refresh-token.dto';
import { ResetPasswordDto } from '../application/dto/reset-password.dto';
import { SessionResponseDto } from '../application/dto/session-response.dto';
import { VerifyOtpDto } from '../application/dto/verify-otp.dto';
import { ForgotPasswordService } from '../application/forgot-password.service';
import { SessionEntity } from '../domain/entities/session.entity';
import { DeviceContext } from '../domain/value-objects/device-context';
import { JwtAuthGuard } from './guards/jwt-auth.guard';

const REFRESH_COOKIE_NAME = 'refresh_token';
const REFRESH_COOKIE_PATH = '/api/v1/auth';

@ApiTags('Auth')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly forgotPasswordService: ForgotPasswordService,
  ) {}

  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Đăng nhập bằng organizationSlug + email + mật khẩu',
  })
  @ApiResponse({ status: 200, type: LoginResponseDto })
  @ApiCommonErrors()
  async login(
    @Body() dto: LoginDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<LoginResponseDto> {
    const device = this.buildDeviceContext(req, dto.deviceName);
    const issued = await this.authService.login(
      dto.organizationSlug,
      dto.email,
      dto.password,
      device,
    );
    return this.deliver(issued, device.clientType, res);
  }

  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Cấp lại access/refresh token (refresh token rotation)',
  })
  @ApiResponse({ status: 200, type: LoginResponseDto })
  @ApiCommonErrors()
  async refresh(
    @Body() dto: RefreshTokenDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<LoginResponseDto> {
    const device = this.buildDeviceContext(req, dto.deviceName);
    const rawToken = this.extractRefreshToken(req, dto, device.clientType);
    const issued = await this.authService.refreshToken(rawToken, device);
    return this.deliver(issued, device.clientType, res);
  }

  @Post('logout')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Đăng xuất thiết bị hiện tại (thu hồi 1 session)' })
  @ApiCommonErrors()
  async logout(
    @Body() dto: RefreshTokenDto,
    @CurrentUser() user: JwtAccessPayload,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<void> {
    const clientType = this.getClientType(req);
    const rawToken = this.extractRefreshToken(req, dto, clientType, {
      optional: true,
    });
    if (rawToken) {
      await this.authService.logout(rawToken, user.sub);
    }
    if (clientType === 'WEB') {
      res.clearCookie(REFRESH_COOKIE_NAME, { path: REFRESH_COOKIE_PATH });
    }
  }

  @Post('logout-all')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Đăng xuất toàn bộ thiết bị (thu hồi mọi session)' })
  @ApiCommonErrors()
  async logoutAll(
    @CurrentUser() user: JwtAccessPayload,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<void> {
    await this.authService.logoutAll(user.sub);
    if (this.getClientType(req) === 'WEB') {
      res.clearCookie(REFRESH_COOKIE_NAME, { path: REFRESH_COOKIE_PATH });
    }
  }

  @Get('sessions')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Danh sách phiên đăng nhập đang hoạt động (theo thiết bị)',
  })
  @ApiResponse({ status: 200, type: [SessionResponseDto] })
  @ApiCommonErrors()
  async listSessions(
    @CurrentUser() user: JwtAccessPayload,
  ): Promise<SessionResponseDto[]> {
    const sessions = await this.authService.listSessions(user.sub);
    return sessions.map((s) => this.toSessionResponse(s));
  }

  @Delete('sessions/:id')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Đăng xuất một thiết bị cụ thể từ danh sách phiên' })
  @ApiCommonErrors()
  async revokeSession(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: JwtAccessPayload,
  ): Promise<void> {
    await this.authService.revokeSession(user.sub, id);
  }

  @Post('forgot-password')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary:
      'Gửi OTP đặt lại mật khẩu qua email (cooldown 60s, tối đa 5 lần/giờ)',
  })
  @ApiCommonErrors()
  async forgotPassword(@Body() dto: ForgotPasswordDto): Promise<void> {
    await this.forgotPasswordService.requestOtp(
      dto.organizationSlug,
      dto.email,
    );
  }

  @Post('verify-otp')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Xác thực OTP (hiệu lực 5 phút)' })
  @ApiCommonErrors()
  async verifyOtp(@Body() dto: VerifyOtpDto): Promise<void> {
    await this.forgotPasswordService.verifyOtp(
      dto.organizationSlug,
      dto.email,
      dto.otp,
    );
  }

  @Post('reset-password')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Đặt lại mật khẩu sau khi OTP đã được xác thực' })
  @ApiCommonErrors()
  async resetPassword(@Body() dto: ResetPasswordDto): Promise<void> {
    await this.forgotPasswordService.resetPassword(
      dto.organizationSlug,
      dto.email,
      dto.newPassword,
    );
  }

  // ---------------------------------------------------------------------

  private getClientType(req: Request): DeviceContext['clientType'] {
    const header = (
      req.headers['x-client-type'] as string | undefined
    )?.toLowerCase();
    return header === 'mobile' ? 'MOBILE' : 'WEB';
  }

  private buildDeviceContext(
    req: Request,
    deviceName?: string | null,
  ): DeviceContext {
    return {
      userAgent: req.headers['user-agent'] ?? null,
      ip: req.ip ?? null,
      clientType: this.getClientType(req),
      deviceName: deviceName ?? null,
    };
  }

  /** Web: refresh token nằm trong HttpOnly cookie. Mobile: nằm trong JSON body. */
  private extractRefreshToken(
    req: Request,
    dto: RefreshTokenDto,
    clientType: DeviceContext['clientType'],
    options?: { optional: boolean },
  ): string {
    const token =
      clientType === 'WEB'
        ? (req.cookies as Record<string, string> | undefined)?.[
            REFRESH_COOKIE_NAME
          ]
        : dto.refreshToken;

    if (!token) {
      if (options?.optional) return '';
      throw new UnauthorizedException(
        withCode(ErrorCode.AUTH_REFRESH_TOKEN_INVALID, 'Thiếu refresh token'),
      );
    }
    return token;
  }

  /** Web: set HttpOnly cookie, KHÔNG trả refreshToken trong body. Mobile: trả trong body, không set cookie. */
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
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: REFRESH_COOKIE_PATH,
      expires: issued.refreshTokenExpiresAt,
    });

    return {
      accessToken: issued.response.accessToken,
      userInfo: issued.response.userInfo,
    };
  }

  private toSessionResponse(session: SessionEntity): SessionResponseDto {
    return {
      id: session.id,
      deviceName: session.deviceName,
      browser: session.browser,
      os: session.os,
      clientType: session.clientType,
      ip: session.ip,
      country: session.country,
      city: session.city,
      lastActivityAt: session.lastActivityAt,
      createdAt: session.createdAt,
    };
  }
}
