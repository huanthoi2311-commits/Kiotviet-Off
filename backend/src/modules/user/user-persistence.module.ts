import { Module } from '@nestjs/common';
import { UsageLimitModule } from '../usage-limit/usage-limit.module';
import { USER_REPOSITORY } from './domain/repositories/user.repository.interface';
import { PrismaUserRepository } from './infrastructure/persistence/prisma-user.repository';

/**
 * T053.05C-2 — Hạ tầng thuần túy (cùng mẫu Persistence Module đã dùng cho Barcode ở T009, Decision
 * RPC01 — không lặp lại tên lớp cụ thể ở đây để tránh false-positive dạng text-scan, xem tiền lệ
 * T005/T006/T009). Registration owner DUY NHẤT của `USER_REPOSITORY`. Không chứa Controller/Application Service/
 * business rule. Import `UsageLimitModule` (module lá, T053.05B) vì `PrismaUserRepository` tự nó
 * cần `UsageLimitService` (khoá/đọc hạn mức maxUser trước khi create()) — provider chỉ resolve
 * được dependency trong phạm vi module ĐĂNG KÝ nó, không phải module import module đó (bug đã bắt
 * được qua verification thủ công `NestFactory.create()` thật trước PR — Nest báo
 * `UnknownDependenciesException` cho `UsageLimitService` khi thiếu import này). KHÔNG import module
 * nghiệp vụ nào khác (không `BranchModule`, không `WarehouseModule`, không `UserModule` đầy đủ) —
 * điều kiện để `UserReferenceModule` (xây trên module này) có thể import được từ `BranchModule` mà
 * không tạo circular dependency (Branch→User→Branch, vì `UserModule` đầy đủ đã import `BranchModule`
 * từ T052.02).
 *
 * `UserModule` đầy đủ tiếp tục import module này thay vì tự đăng ký `USER_REPOSITORY` — KHÔNG
 * đổi hành vi, chỉ đổi nơi đăng ký (single source of truth, không nhân đôi provider).
 */
@Module({
  imports: [UsageLimitModule],
  providers: [{ provide: USER_REPOSITORY, useClass: PrismaUserRepository }],
  exports: [USER_REPOSITORY],
})
export class UserPersistenceModule {}
