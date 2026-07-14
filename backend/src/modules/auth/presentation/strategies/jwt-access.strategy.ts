import { Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ErrorCode } from '../../../../common/errors/error-codes';
import { withCode } from '../../../../common/errors/with-code';
import { JwtAccessPayload } from '../../../../common/types/jwt-payload.type';
import { AUTH_USER_REPOSITORY } from '../../domain/repositories/auth-user.repository.interface';
import type { IAuthUserRepository } from '../../domain/repositories/auth-user.repository.interface';

@Injectable()
export class JwtAccessStrategy extends PassportStrategy(Strategy, 'jwt') {
  constructor(
    config: ConfigService,
    @Inject(AUTH_USER_REPOSITORY)
    private readonly userRepository: IAuthUserRepository,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: config.get<string>('jwt.accessSecret')!,
    });
  }

  async validate(payload: JwtAccessPayload): Promise<JwtAccessPayload> {
    // Quyền có thể đã đổi kể từ lúc access token được ký (role/permission bị sửa) —
    // đối chiếu permissionVersion hiện tại trong DB, lệch nhau thì bắt đăng nhập lại.
    const user = await this.userRepository.findById(payload.sub);
    if (!user || user.status !== 'ACTIVE') {
      throw new UnauthorizedException(
        withCode(ErrorCode.AUTH_ACCOUNT_NOT_ACTIVE, 'Tài khoản không khả dụng'),
      );
    }
    if (user.permissionVersion !== payload.permissionVersion) {
      throw new UnauthorizedException(
        withCode(
          ErrorCode.AUTH_PERMISSION_VERSION_MISMATCH,
          'Quyền truy cập đã thay đổi, vui lòng đăng nhập lại',
        ),
      );
    }
    return payload;
  }
}
