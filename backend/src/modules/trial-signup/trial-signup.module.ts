import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { OrganizationModule } from '../organization/organization.module';
import { SIGNUP_OTP_REPOSITORY } from './domain/repositories/signup-otp.repository.interface';
import { TRIAL_SIGNUP_FINALIZATION_REPOSITORY } from './domain/repositories/trial-signup-finalization.repository.interface';
import { RedisSignupOtpRepository } from './infrastructure/persistence/redis-signup-otp.repository';
import { PrismaTrialSignupFinalizationRepository } from './infrastructure/persistence/prisma-trial-signup-finalization.repository';
import { SignupProofService } from './infrastructure/security/signup-proof.service';
import { SignupOtpService } from './application/signup-otp.service';
import { TrialSignupService } from './application/trial-signup.service';
import { TrialSignupController } from './presentation/trial-signup.controller';

/**
 * T053.04 — module lá về mặt kiến trúc: chỉ đi XUỐNG (`OrganizationModule`, `AuthModule`), không
 * module nào import ngược lại `TrialSignupModule` — zero rủi ro vòng lặp (đã xác nhận qua
 * `madge --circular`, xem báo cáo cuối). `PrismaService`/`REDIS_CLIENT`/`JwtService` đều đã
 * `@Global()`, không cần import module riêng cho từng cái.
 */
@Module({
  imports: [OrganizationModule, AuthModule],
  controllers: [TrialSignupController],
  providers: [
    SignupOtpService,
    TrialSignupService,
    SignupProofService,
    { provide: SIGNUP_OTP_REPOSITORY, useClass: RedisSignupOtpRepository },
    {
      provide: TRIAL_SIGNUP_FINALIZATION_REPOSITORY,
      useClass: PrismaTrialSignupFinalizationRepository,
    },
  ],
})
export class TrialSignupModule {}
