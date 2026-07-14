import { Module } from '@nestjs/common';
import { RbacModule } from '../rbac/rbac.module';
import { PurchaseReportService } from './application/purchase-report.service';
import { PURCHASE_REPORT_REPOSITORY } from './domain/repositories/purchase-report.repository.interface';
import { PURCHASE_REPORT_EXPORT_PORT } from './domain/services/purchase-report-export.interface';
import { PurchaseReportExportAdapter } from './infrastructure/export/purchase-report-export.adapter';
import { PrismaPurchaseReportRepository } from './infrastructure/persistence/prisma-purchase-report.repository';
import { PurchaseReportController } from './presentation/purchase-report.controller';

@Module({
  imports: [RbacModule],
  controllers: [PurchaseReportController],
  providers: [
    PurchaseReportService,
    {
      provide: PURCHASE_REPORT_REPOSITORY,
      useClass: PrismaPurchaseReportRepository,
    },
    {
      provide: PURCHASE_REPORT_EXPORT_PORT,
      useClass: PurchaseReportExportAdapter,
    },
  ],
})
export class PurchaseReportModule {}
