import { Module } from '@nestjs/common';
import { RbacModule } from '../rbac/rbac.module';
import { UsageLimitModule } from '../usage-limit/usage-limit.module';
import { UserReferenceModule } from '../user/user-reference.module';
import { WarehouseReferenceModule } from '../warehouse/warehouse-reference.module';
import { BranchService } from './application/branch.service';
import { BRANCH_REPOSITORY } from './domain/repositories/branch.repository.interface';
import { BRANCH_CODE_GENERATOR } from './domain/services/branch-code-generator.interface';
import { SequenceBranchCodeGenerator } from './infrastructure/generators/sequence-branch-code.generator';
import { PrismaBranchRepository } from './infrastructure/persistence/prisma-branch.repository';
import { BranchController } from './presentation/branch.controller';

// T053.05C-2 — UserReferenceModule/WarehouseReferenceModule (module lá, chỉ export
// UserReferenceService/WarehouseReferenceService, KHÔNG import BranchModule) để BranchService xác
// minh managerUserId/defaultWarehouseId (foreign id tenant-owned) thuộc actor.organizationId TRƯỚC
// khi ghi — cùng pattern WarehouseService.assertManagerInOrganization() đã có từ T053.05A, KHÔNG
// import UserModule/WarehouseModule đầy đủ (cả hai đều đã import BranchModule — import ngược lại
// sẽ tạo circular dependency Branch→User→Branch / Branch→Warehouse→Branch).
@Module({
  imports: [
    RbacModule,
    UsageLimitModule,
    UserReferenceModule,
    WarehouseReferenceModule,
  ],
  controllers: [BranchController],
  providers: [
    BranchService,
    { provide: BRANCH_REPOSITORY, useClass: PrismaBranchRepository },
    { provide: BRANCH_CODE_GENERATOR, useClass: SequenceBranchCodeGenerator },
  ],
  // T051.06A — BranchService export thêm để Checkout xác minh Branch thuộc actor.organizationId
  // trước khi dùng branchId trong bất kỳ business write nào (Invoice/Payment/CheckoutOperation).
  // Tái dùng đúng port công khai đã có (getById(id, actor) → NotFoundException nếu sai
  // organizationId), không tạo repository abstraction thứ hai.
  exports: [BRANCH_REPOSITORY, BranchService],
})
export class BranchModule {}
