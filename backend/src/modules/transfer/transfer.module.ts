import { Module } from '@nestjs/common';
import { InventoryModule } from '../inventory/inventory.module';
import { RbacModule } from '../rbac/rbac.module';
import { TransferService } from './application/transfer.service';
import { TRANSFER_REPOSITORY } from './domain/repositories/transfer.repository.interface';
import { TRANSFER_CODE_GENERATOR } from './domain/services/transfer-code-generator.interface';
import { SequenceTransferCodeGenerator } from './infrastructure/generators/sequence-transfer-code.generator';
import { PrismaTransferRepository } from './infrastructure/persistence/prisma-transfer.repository';
import { TransferController } from './presentation/transfer.controller';

@Module({
  imports: [RbacModule, InventoryModule],
  controllers: [TransferController],
  providers: [
    TransferService,
    { provide: TRANSFER_REPOSITORY, useClass: PrismaTransferRepository },
    {
      provide: TRANSFER_CODE_GENERATOR,
      useClass: SequenceTransferCodeGenerator,
    },
  ],
  exports: [TRANSFER_REPOSITORY],
})
export class TransferModule {}
