import { Inject, Injectable } from '@nestjs/common';
import { PurchaseReportGroupBy } from '../domain/entities/purchase-report.entity';
import {
  PURCHASE_REPORT_REPOSITORY,
  PurchaseReportFilterParams,
} from '../domain/repositories/purchase-report.repository.interface';
import type { IPurchaseReportRepository } from '../domain/repositories/purchase-report.repository.interface';
import { PURCHASE_REPORT_EXPORT_PORT } from '../domain/services/purchase-report-export.interface';
import type { IPurchaseReportExportPort } from '../domain/services/purchase-report-export.interface';
import {
  PurchaseReportBreakdownQueryDto,
  PurchaseReportExportQueryDto,
  PurchaseReportFilterDto,
} from './dto/purchase-report-query.dto';
import {
  PaginatedPurchaseReportBreakdownResponseDto,
  PurchaseReportDashboardResponseDto,
} from './dto/purchase-report-response.dto';
import { PurchaseReportMapper } from './mappers/purchase-report.mapper';

export interface PurchaseReportExportResult {
  buffer: Buffer;
  contentType: string;
  fileExtension: string;
}

const EXPORT_MAX_ROWS = 100_000;
/** BOM UTF-8 — bắt buộc để Excel nhận diện đúng mã hóa UTF-8 khi mở file CSV có dấu tiếng Việt. */
const UTF8_BOM = String.fromCharCode(0xfeff);

const GROUP_BY_LABEL: Record<PurchaseReportGroupBy, string> = {
  SUPPLIER: 'Nhà cung cấp',
  PRODUCT: 'Sản phẩm',
  WAREHOUSE: 'Kho',
  MONTH: 'Tháng',
  USER: 'Người tạo',
  CATEGORY: 'Ngành hàng',
};

@Injectable()
export class PurchaseReportService {
  constructor(
    @Inject(PURCHASE_REPORT_REPOSITORY)
    private readonly purchaseReportRepository: IPurchaseReportRepository,
    @Inject(PURCHASE_REPORT_EXPORT_PORT)
    private readonly exportPort: IPurchaseReportExportPort,
  ) {}

  async getDashboard(
    query: PurchaseReportFilterDto,
    organizationId: string,
  ): Promise<PurchaseReportDashboardResponseDto> {
    const dashboard = await this.purchaseReportRepository.getDashboard(
      this.toFilterParams(query, organizationId),
    );
    return PurchaseReportMapper.toDashboardResponseDto(dashboard);
  }

  async getBreakdown(
    query: PurchaseReportBreakdownQueryDto,
    organizationId: string,
  ): Promise<PaginatedPurchaseReportBreakdownResponseDto> {
    const result = await this.purchaseReportRepository.getBreakdown({
      ...this.toFilterParams(query, organizationId),
      groupBy: query.groupBy,
      page: query.page ?? 1,
      limit: query.limit ?? 20,
    });

    return {
      items: result.items.map((item) =>
        PurchaseReportMapper.toBreakdownItemResponseDto(item),
      ),
      total: result.total,
      page: result.page,
      limit: result.limit,
    };
  }

  async exportReport(
    query: PurchaseReportExportQueryDto,
    organizationId: string,
  ): Promise<PurchaseReportExportResult> {
    const result = await this.purchaseReportRepository.getBreakdown({
      ...this.toFilterParams(query, organizationId),
      groupBy: query.groupBy,
      page: 1,
      limit: EXPORT_MAX_ROWS,
    });
    const title = `Báo cáo nhập hàng theo ${GROUP_BY_LABEL[query.groupBy]}`;

    switch (query.format) {
      case 'EXCEL': {
        const buffer = await this.exportPort.buildExcel(title, result.items);
        return {
          buffer,
          contentType:
            'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          fileExtension: 'xlsx',
        };
      }
      case 'CSV': {
        const csv = this.exportPort.buildCsv(result.items);
        return {
          buffer: Buffer.from(`${UTF8_BOM}${csv}`, 'utf-8'),
          contentType: 'text/csv; charset=utf-8',
          fileExtension: 'csv',
        };
      }
      case 'PDF': {
        const buffer = await this.exportPort.buildPdf(title, result.items);
        return {
          buffer,
          contentType: 'application/pdf',
          fileExtension: 'pdf',
        };
      }
    }
  }

  private toFilterParams(
    query: PurchaseReportFilterDto,
    organizationId: string,
  ): PurchaseReportFilterParams {
    return {
      organizationId,
      dateFrom: query.dateFrom ? new Date(query.dateFrom) : undefined,
      dateTo: query.dateTo ? new Date(query.dateTo) : undefined,
    };
  }
}
