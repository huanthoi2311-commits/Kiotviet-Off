import { UnprocessableEntityException } from '@nestjs/common';
import { AuditLogService } from '../../platform/audit-log/audit-log.service';
import { SupplierEntity } from '../domain/entities/supplier.entity';
import { ISupplierRepository } from '../domain/repositories/supplier.repository.interface';
import { ISupplierExcelPort } from '../domain/services/supplier-excel.interface';
import { SupplierExcelService } from './supplier-excel.service';
import { ActorContext, SupplierService } from './supplier.service';

describe('SupplierExcelService', () => {
  let service: SupplierExcelService;
  let supplierRepository: jest.Mocked<
    Pick<ISupplierRepository, 'findAllForExport' | 'importBatch'>
  >;
  let excelPort: jest.Mocked<ISupplierExcelPort>;
  let supplierService: jest.Mocked<Pick<SupplierService, 'toSearchParams'>>;
  let auditLogService: jest.Mocked<Pick<AuditLogService, 'log'>>;

  const actor: ActorContext = { userId: 'user-1', organizationId: 'org-1' };

  const makeSupplier = (): SupplierEntity =>
    ({ id: 'sup-1', code: 'NCC001', companyName: 'A' }) as SupplierEntity;

  beforeEach(() => {
    supplierRepository = {
      findAllForExport: jest.fn(),
      importBatch: jest.fn(),
    };
    excelPort = { buildWorkbookBuffer: jest.fn(), parseRows: jest.fn() };
    supplierService = {
      toSearchParams: jest.fn().mockReturnValue({
        organizationId: 'org-1',
        page: 1,
        limit: 20,
        sortBy: 'createdAt',
        sortOrder: 'desc',
      }),
    };
    auditLogService = { log: jest.fn().mockResolvedValue(undefined) };

    service = new SupplierExcelService(
      supplierRepository as unknown as ISupplierRepository,
      excelPort,
      supplierService as unknown as SupplierService,
      auditLogService as unknown as AuditLogService,
    );
  });

  describe('exportToExcel', () => {
    it('build buffer từ danh sách supplier và ghi audit log', async () => {
      supplierRepository.findAllForExport.mockResolvedValue([makeSupplier()]);
      excelPort.buildWorkbookBuffer.mockResolvedValue(Buffer.from('fake-xlsx'));

      const buffer = await service.exportToExcel({}, actor);

      expect(buffer.toString()).toBe('fake-xlsx');
      expect(excelPort.buildWorkbookBuffer).toHaveBeenCalledWith([
        makeSupplier(),
      ]);
      expect(auditLogService.log).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'supplier.export',
          newValue: { exportedCount: 1 },
        }),
      );
    });
  });

  describe('importFromExcel', () => {
    it('ném UnprocessableEntityException khi file rỗng', async () => {
      excelPort.parseRows.mockResolvedValue([]);
      await expect(
        service.importFromExcel(Buffer.from(''), actor),
      ).rejects.toThrow(UnprocessableEntityException);
      expect(supplierRepository.importBatch).not.toHaveBeenCalled();
    });

    it('ném UnprocessableEntityException kèm lỗi theo dòng khi có dữ liệu không hợp lệ', async () => {
      excelPort.parseRows.mockResolvedValue([
        { __rowNumber: 2, code: 'NCC001', companyName: 'Công ty A' },
        { __rowNumber: 3, code: '', companyName: 'x' },
      ]);

      await expect(
        service.importFromExcel(Buffer.from('x'), actor),
      ).rejects.toThrow(UnprocessableEntityException);
      expect(supplierRepository.importBatch).not.toHaveBeenCalled();
    });

    it('từ chối dòng thiếu code hoàn toàn (Decision SR04/§0.8 — Import vẫn bắt buộc code dù CreateSupplierDto.code đã optional)', async () => {
      excelPort.parseRows.mockResolvedValue([
        { __rowNumber: 2, companyName: 'Không có mã' },
      ]);

      await expect(
        service.importFromExcel(Buffer.from('x'), actor),
      ).rejects.toThrow(UnprocessableEntityException);
      expect(supplierRepository.importBatch).not.toHaveBeenCalled();
    });

    it('gọi importBatch khi toàn bộ dòng hợp lệ, ghi audit log', async () => {
      excelPort.parseRows.mockResolvedValue([
        { __rowNumber: 2, code: 'NCC001', companyName: 'Công ty A' },
        { __rowNumber: 3, code: 'NCC002', companyName: 'Công ty B' },
      ]);
      supplierRepository.importBatch.mockResolvedValue({
        createdCount: 2,
        updatedCount: 0,
      });

      const result = await service.importFromExcel(Buffer.from('x'), actor);

      expect(result).toEqual({ createdCount: 2, updatedCount: 0 });
      expect(supplierRepository.importBatch).toHaveBeenCalledWith(
        'org-1',
        [
          expect.objectContaining({
            rowNumber: 2,
            code: 'NCC001',
            companyName: 'Công ty A',
          }),
          expect.objectContaining({
            rowNumber: 3,
            code: 'NCC002',
            companyName: 'Công ty B',
          }),
        ],
        'user-1',
      );
      expect(auditLogService.log).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'supplier.import' }),
      );
    });

    it('không ghi dòng nào nếu chỉ 1 dòng trong nhiều dòng bị lỗi (rollback toàn bộ)', async () => {
      excelPort.parseRows.mockResolvedValue([
        { __rowNumber: 2, code: 'NCC001', companyName: 'Công ty A' },
        { __rowNumber: 3, code: 'NCC002', companyName: 'Công ty B' },
        { __rowNumber: 4, code: 'NCC003', companyName: 'a' },
      ]);

      await expect(
        service.importFromExcel(Buffer.from('x'), actor),
      ).rejects.toThrow(UnprocessableEntityException);
      expect(supplierRepository.importBatch).not.toHaveBeenCalled();
    });
  });
});
