import { Module } from '@nestjs/common';
import { USER_REPOSITORY } from './domain/repositories/user.repository.interface';
import { PrismaUserRepository } from './infrastructure/persistence/prisma-user.repository';

/**
 * T053.05C-2 — Hạ tầng thuần túy (cùng mẫu Persistence Module đã dùng cho Barcode ở T009, Decision
 * RPC01 — không lặp lại tên lớp cụ thể ở đây để tránh false-positive dạng text-scan, xem tiền lệ
 * T005/T006/T009). Registration owner DUY NHẤT của `USER_REPOSITORY`. Không chứa Controller/Application Service/
 * business rule. Không import module nghiệp vụ nào (không `BranchModule`, không `WarehouseModule`,
 * không `UserModule` đầy đủ) — điều kiện để `UserReferenceModule` (xây trên module này) có thể
 * import được từ `BranchModule` mà không tạo circular dependency (Branch→User→Branch, vì
 * `UserModule` đầy đủ đã import `BranchModule` từ T052.02).
 *
 * `UserModule` đầy đủ tiếp tục import module này thay vì tự đăng ký `USER_REPOSITORY` — KHÔNG
 * đổi hành vi, chỉ đổi nơi đăng ký (single source of truth, không nhân đôi provider).
 */
@Module({
  providers: [{ provide: USER_REPOSITORY, useClass: PrismaUserRepository }],
  exports: [USER_REPOSITORY],
})
export class UserPersistenceModule {}
