import { JwtModule } from '@nestjs/jwt';
import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

/**
 * Chỉ cấu hình JwtService dùng chung (secret/expiry đọc từ ConfigService).
 * Guard/Strategy/Business flow (login, refresh, RBAC) thuộc module `modules/auth`.
 */
@Module({
  imports: [
    JwtModule.registerAsync({
      global: true,
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.get<string>('jwt.accessSecret'),
        signOptions: {
          expiresIn: config.get<string>(
            'jwt.accessExpiresIn',
          ) as `${number}${'s' | 'm' | 'h' | 'd'}`,
        },
      }),
    }),
  ],
  exports: [JwtModule],
})
export class JwtConfigModule {}
