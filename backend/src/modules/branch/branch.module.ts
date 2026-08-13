import { Module } from '@nestjs/common';
import { RbacModule } from '../rbac/rbac.module';
import { BranchService } from './application/branch.service';
import { BRANCH_REPOSITORY } from './domain/repositories/branch.repository.interface';
import { BRANCH_CODE_GENERATOR } from './domain/services/branch-code-generator.interface';
import { SequenceBranchCodeGenerator } from './infrastructure/generators/sequence-branch-code.generator';
import { PrismaBranchRepository } from './infrastructure/persistence/prisma-branch.repository';
import { BranchController } from './presentation/branch.controller';

@Module({
  imports: [RbacModule],
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
