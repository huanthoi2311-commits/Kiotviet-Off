import {
  Inject,
  Injectable,
  UnprocessableEntityException,
} from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { AuditLogService } from '../../platform/audit-log/audit-log.service';
import { ErrorCode } from '../../../common/errors/error-codes';
import { withCode } from '../../../common/errors/with-code';
import { SUPPLIER_REPOSITORY } from '../domain/repositories/supplier.repository.interface';
import type {
  ImportSupplierRow,
  ISupplierRepository,
} from '../domain/repositories/supplier.repository.interface';
import { SUPPLIER_EXCEL_PORT } from '../domain/services/supplier-excel.interface';
import type { ISupplierExcelPort } from '../domain/services/supplier-excel.interface';
import { CreateSupplierDto } from './dto/create-supplier.dto';
import { SupplierQueryDto } from './dto/supplier-query.dto';
import { ActorContext, SupplierService } from './supplier.service';

export interface SupplierImportSummary {
  createdCount: number;
  updatedCount: number;
}

export interface SupplierRowError {
  row: number;
  errors: string[];
}

@Injectable()
export class SupplierExcelService {
  constructor(
    @Inject(SUPPLIER_REPOSITORY)
    private readonly supplierRepository: ISupplierRepository,
    @Inject(SUPPLIER_EXCEL_PORT) private readonly excelPort: ISupplierExcelPort,
    private readonly supplierService: SupplierService,
    private readonly auditLogService: AuditLogService,
  ) {}

  async exportToExcel(
    query: SupplierQueryDto,
    actor: ActorContext,
  ): Promise<Buffer> {
    const fullParams = this.supplierService.toSearchParams(
      query,
      actor.organizationId,
    );
    const suppliers = await this.supplierRepository.findAllForExport({
      organizationId: fullParams.organizationId,
      search: fullParams.search,
      status: fullParams.status,
      province: fullParams.province,
      sortBy: fullParams.sortBy,
      sortOrder: fullParams.sortOrder,
    });
    const buffer = await this.excelPort.buildWorkbookBuffer(suppliers);

    await this.auditLogService.log({
      organizationId: actor.organizationId,
      userId: actor.userId,
      action: 'supplier.export',
      entityType: 'Supplier',
      newValue: { exportedCount: suppliers.length },
      ip: actor.ip,
      userAgent: actor.userAgent,
    });

    return buffer;
  }

  /** Toàn bộ file được validate xong xuôi trước khi ghi bất kỳ dòng nào — nếu có lỗi, không dòng nào được ghi (rollback). */
  async importFromExcel(
    fileBuffer: Buffer,
    actor: ActorContext,
  ): Promise<SupplierImportSummary> {
    const rawRows = await this.excelPort.parseRows(fileBuffer);
    if (rawRows.length === 0) {
      throw new UnprocessableEntityException(
        withCode(
          ErrorCode.SUPPLIER_IMPORT_INVALID_FILE,
          'File Excel không có dữ liệu để nhập',
        ),
      );
    }

    const validRows: ImportSupplierRow[] = [];
    const rowErrors: SupplierRowError[] = [];

    for (const raw of rawRows) {
      const rowNumber = Number(raw.__rowNumber);
      const dto = plainToInstance(CreateSupplierDto, raw, {
        excludeExtraneousValues: false,
      });
      const errors = await validate(dto, { whitelist: true });
      const messages = errors.flatMap((e) =>
        Object.values(e.constraints ?? {}),
      );

      // T012 (Decision SR04/§0.8) — Import Excel tiếp tục yêu cầu `code` bắt buộc dù
      // `CreateSupplierDto.code` đã đổi thành optional cho API tạo thường (Decision SR07).
      if (!dto.code) {
        messages.push('code là bắt buộc khi nhập từ Excel');
      }

      if (messages.length > 0) {
        rowErrors.push({ row: rowNumber, errors: messages });
        continue;
      }

      validRows.push({
        rowNumber,
        // dto.code đã được xác nhận không rỗng ở check phía trên (continue nếu thiếu).
        code: dto.code as string,
        taxCode: dto.taxCode ?? null,
        companyName: dto.companyName,
        contactName: dto.contactName ?? null,
        phone: dto.phone ?? null,
        email: dto.email ?? null,
        website: dto.website ?? null,
        address: dto.address ?? null,
        province: dto.province ?? null,
        district: dto.district ?? null,
        ward: dto.ward ?? null,
        bankName: dto.bankName ?? null,
        bankAccount: dto.bankAccount ?? null,
        paymentTerm: dto.paymentTerm ?? null,
        creditLimit: dto.creditLimit ?? null,
        status: dto.status,
        note: dto.note ?? null,
      });
    }

    if (rowErrors.length > 0) {
      const messages = rowErrors.flatMap((rowError) =>
        rowError.errors.map((message) => `Dòng ${rowError.row}: ${message}`),
      );
      throw new UnprocessableEntityException({
        errorCode: ErrorCode.SUPPLIER_IMPORT_VALIDATION_FAILED,
        message: messages,
      });
    }

    const result = await this.supplierRepository.importBatch(
      actor.organizationId,
      validRows,
      actor.userId,
    );

    await this.auditLogService.log({
      organizationId: actor.organizationId,
      userId: actor.userId,
      action: 'supplier.import',
      entityType: 'Supplier',
      newValue: result,
      ip: actor.ip,
      userAgent: actor.userAgent,
    });

    return result;
  }
}
