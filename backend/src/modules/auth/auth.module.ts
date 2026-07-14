import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { PassportModule } from '@nestjs/passport';
import { RbacModule } from '../rbac/rbac.module';
import { AuthService } from './application/auth.service';
import { ForgotPasswordService } from './application/forgot-password.service';
import { AUTH_USER_REPOSITORY } from './domain/repositories/auth-user.repository.interface';
import { OTP_REPOSITORY } from './domain/repositories/otp.repository.interface';
import { SESSION_REPOSITORY } from './domain/repositories/session.repository.interface';
import { DEVICE_INFO_RESOLVER } from './domain/services/device-info-resolver.interface';
import { PASSWORD_HASHER } from './domain/services/password-hasher.interface';
import { DeviceInfoResolver } from './infrastructure/device/device-info.resolver';
import { MAIL_QUEUE } from './infrastructure/mail/mail.constants';
import { MailProcessor } from './infrastructure/mail/mail.processor';
import { MailService } from './infrastructure/mail/mail.service';
import { PrismaAuthUserRepository } from './infrastructure/persistence/prisma-auth-user.repository';
import { PrismaSessionRepository } from './infrastructure/persistence/prisma-session.repository';
import { RedisOtpRepository } from './infrastructure/persistence/redis-otp.repository';
import { Argon2PasswordHasher } from './infrastructure/security/argon2-password-hasher';
import { TokenService } from './infrastructure/security/token.service';
import { AuthController } from './presentation/auth.controller';
import { JwtAccessStrategy } from './presentation/strategies/jwt-access.strategy';

@Module({
  imports: [
    PassportModule,
    BullModule.registerQueue({ name: MAIL_QUEUE }),
    RbacModule,
  ],
  controllers: [AuthController],
  providers: [
    AuthService,
    ForgotPasswordService,
    TokenService,
    MailService,
    MailProcessor,
    JwtAccessStrategy,
    { provide: AUTH_USER_REPOSITORY, useClass: PrismaAuthUserRepository },
    { provide: SESSION_REPOSITORY, useClass: PrismaSessionRepository },
    { provide: OTP_REPOSITORY, useClass: RedisOtpRepository },
    { provide: PASSWORD_HASHER, useClass: Argon2PasswordHasher },
    { provide: DEVICE_INFO_RESOLVER, useClass: DeviceInfoResolver },
  ],
  exports: [AuthService],
})
export class AuthModule {}
