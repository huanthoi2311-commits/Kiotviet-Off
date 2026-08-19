import { Module } from '@nestjs/common';
import { UserPersistenceModule } from './user-persistence.module';
import { UserReferenceService } from './application/user-reference.service';

/**
 * T053.05C-2 — Read-only reference capability cho module khác (cùng pattern
 * `BarcodeReferenceModule`). Chỉ export `UserReferenceService` — không export `USER_REPOSITORY`,
 * không chứa `UserService`/write use case/Controller nào. Import `UserPersistenceModule` để có
 * `USER_REPOSITORY` — KHÔNG import `BranchModule`/`AuthModule`/`OrganizationModule`/
 * `EntitlementModule`/`RbacModule` (điều kiện tránh circular dependency — `UserModule` đầy đủ đã
 * import `BranchModule`, nên `BranchModule` không thể import lại bất kỳ thứ gì kéo theo nó).
 */
@Module({
  imports: [UserPersistenceModule],
  providers: [UserReferenceService],
  exports: [UserReferenceService],
})
export class UserReferenceModule {}
