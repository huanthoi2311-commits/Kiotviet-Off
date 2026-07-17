import { ConflictException, NotFoundException } from '@nestjs/common';
import { AuditLogService } from '../../platform/audit-log/audit-log.service';
import { ProductDomainService } from '../../product/application/product-domain.service';
import { UnitDomainService } from '../../unit/application/unit-domain.service';
import { BarcodeEntity } from '../domain/entities/barcode.entity';
import { BarcodeConcurrencyConflictError } from '../domain/errors/barcode.errors';
import type { IBarcodeRepository } from '../domain/repositories/barcode.repository.interface';
import { ActorContext, BarcodeService } from './barcode.service';

describe('BarcodeService', () => {
  let service: BarcodeService;
  let barcodeRepository: jest.Mocked<IBarcodeRepository>;
  let productDomainService: jest.Mocked<Pick<ProductDomainService, 'findById'>>;
  let unitDomainService: jest.Mocked<
    Pick<UnitDomainService, 'findByIdForReference'>
  >;
  let auditLogService: jest.Mocked<Pick<AuditLogService, 'log'>>;

  const actor: ActorContext = {
    userId: 'user-1',
    organizationId: 'org-1',
    ip: '127.0.0.1',
    userAgent: 'jest',
  };

  const makeBarcode = (
    overrides: Partial<BarcodeEntity> = {},
  ): BarcodeEntity => ({
    id: 'barcode-1',
    organizationId: 'org-1',
    productId: 'product-1',
    unitId: null,
    code: '8938505970381',
    type: 'EAN13',
    isDefault: false,
    status: 'ACTIVE',
    version: 1,
    createdAt: new Date('2026-01-01'),
    updatedAt: new Date('2026-01-01'),
    deletedAt: null,
    ...overrides,
  });

  beforeEach(() => {
    barcodeRepository = {
      create: jest.fn(),
      findById: jest.fn(),
      findByIdIncludingDeleted: jest.fn(),
      listByProduct: jest.fn(),
      search: jest.fn(),
      update: jest.fn(),
      softDelete: jest.fn(),
      restore: jest.fn(),
      setDefault: jest.fn(),
      existsByCode: jest.fn(),
      hasActiveBarcodesInUnit: jest.fn(),
    };
    productDomainService = {
      findById: jest
        .fn()
        .mockResolvedValue({ id: 'product-1', status: 'ACTIVE' }),
    };
    unitDomainService = { findByIdForReference: jest.fn() };
    auditLogService = { log: jest.fn().mockResolvedValue(undefined) };
    barcodeRepository.existsByCode.mockResolvedValue(false);

    service = new BarcodeService(
      barcodeRepository,
      productDomainService as unknown as ProductDomainService,
      unitDomainService as unknown as UnitDomainService,
      auditLogService as unknown as AuditLogService,
    );
  });

  describe('listByProduct', () => {
    it('ném NotFoundException khi sản phẩm không tồn tại trong tổ chức', async () => {
      productDomainService.findById.mockResolvedValue(null);
      await expect(service.listByProduct('product-1', 'org-1')).rejects.toThrow(
        NotFoundException,
      );
      expect(barcodeRepository.listByProduct).not.toHaveBeenCalled();
    });

    it('trả về danh sách mã vạch của sản phẩm', async () => {
      barcodeRepository.listByProduct.mockResolvedValue([makeBarcode()]);
      const result = await service.listByProduct('product-1', 'org-1');
      expect(result).toHaveLength(1);
      expect(result[0].code).toBe('8938505970381');
    });
  });

  describe('search — tra cứu org-wide (SPEC-BARCODE-001 §4.2)', () => {
    it('ủy quyền cho repository.search với default page/limit/sort (Decision SB08)', async () => {
      barcodeRepository.search.mockResolvedValue({
        items: [makeBarcode()],
        total: 1,
        page: 1,
        limit: 20,
      });
      const result = await service.search({}, 'org-1');
      expect(result.total).toBe(1);
      expect(barcodeRepository.search).toHaveBeenCalledWith(
        expect.objectContaining({
          organizationId: 'org-1',
          page: 1,
          limit: 20,
          sortBy: 'createdAt',
          sortOrder: 'desc',
        }),
      );
    });
  });

  describe('create', () => {
    it('ném NotFoundException khi sản phẩm không tồn tại trong tổ chức', async () => {
      productDomainService.findById.mockResolvedValue(null);
      await expect(
        service.create('product-1', { code: 'X', type: 'CUSTOM' }, actor),
      ).rejects.toThrow(NotFoundException);
      expect(barcodeRepository.create).not.toHaveBeenCalled();
    });

    it('tạo mã vạch thành công và ghi audit log', async () => {
      barcodeRepository.create.mockResolvedValue(makeBarcode());
      const result = await service.create(
        'product-1',
        { code: '8938505970381', type: 'EAN13' },
        actor,
      );
      expect(result.code).toBe('8938505970381');
      expect(barcodeRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          productId: 'product-1',
          createdBy: 'user-1',
        }),
      );
      expect(auditLogService.log).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'barcode.create' }),
      );
    });

    it('ném Conflict khi code đã tồn tại (existsByCode pre-check, Decision BQ6)', async () => {
      barcodeRepository.existsByCode.mockResolvedValue(true);
      await expect(
        service.create('product-1', { code: 'X', type: 'CUSTOM' }, actor),
      ).rejects.toThrow(ConflictException);
      expect(barcodeRepository.create).not.toHaveBeenCalled();
    });

    it('ném lỗi khi unitId khác tổ chức hoặc không tồn tại (Decision BQ11)', async () => {
      unitDomainService.findByIdForReference.mockResolvedValue(null);
      await expect(
        service.create(
          'product-1',
          { code: 'X', type: 'CUSTOM', unitId: 'unit-x' },
          actor,
        ),
      ).rejects.toThrow('Đơn vị tính không tồn tại');
    });

    it('ném lỗi khi unitId đã ARCHIVED (Decision BQ11)', async () => {
      unitDomainService.findByIdForReference.mockResolvedValue({
        id: 'unit-x',
        status: 'ARCHIVED',
      } as never);
      await expect(
        service.create(
          'product-1',
          { code: 'X', type: 'CUSTOM', unitId: 'unit-x' },
          actor,
        ),
      ).rejects.toThrow('Đơn vị tính không tồn tại');
    });

    it('tạo thành công khi unitId hợp lệ (cùng tổ chức, chưa Archive)', async () => {
      unitDomainService.findByIdForReference.mockResolvedValue({
        id: 'unit-x',
        status: 'ACTIVE',
      } as never);
      barcodeRepository.create.mockResolvedValue(
        makeBarcode({ unitId: 'unit-x' }),
      );
      const result = await service.create(
        'product-1',
        { code: 'X', type: 'CUSTOM', unitId: 'unit-x' },
        actor,
      );
      expect(result.id).toBe('barcode-1');
    });
  });

  describe('update (Optimistic Lock — Decision BQ10/SB02)', () => {
    it('ném NotFoundException khi không tồn tại', async () => {
      barcodeRepository.findById.mockResolvedValue(null);
      await expect(
        service.update('missing', { version: 1, code: 'x' }, actor),
      ).rejects.toThrow(NotFoundException);
    });

    it('cập nhật thành công, ghi audit log old/new', async () => {
      barcodeRepository.findById.mockResolvedValue(makeBarcode());
      barcodeRepository.update.mockResolvedValue(makeBarcode({ code: '999' }));
      const result = await service.update(
        'barcode-1',
        { version: 1, code: '999' },
        actor,
      );
      expect(result.code).toBe('999');
      expect(auditLogService.log).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'barcode.update' }),
      );
    });

    it('ném Conflict (409) khi version không khớp', async () => {
      barcodeRepository.findById.mockResolvedValue(makeBarcode());
      barcodeRepository.update.mockRejectedValue(
        new BarcodeConcurrencyConflictError('barcode-1'),
      );
      await expect(
        service.update('barcode-1', { version: 1, code: '999' }, actor),
      ).rejects.toThrow(ConflictException);
    });

    it('chỉ kiểm tra trùng code khi code thực sự đổi', async () => {
      const existing = makeBarcode();
      barcodeRepository.findById.mockResolvedValue(existing);
      barcodeRepository.update.mockResolvedValue(existing);
      await service.update(
        'barcode-1',
        { version: 1, code: existing.code },
        actor,
      );
      expect(barcodeRepository.existsByCode).not.toHaveBeenCalled();
    });
  });

  describe('remove — Delete Guard (Decision BQ2/IP04, 4 case bắt buộc, cả 2 chiều)', () => {
    it('FAIL: chặn khi isDefault=true và Product đang ACTIVE', async () => {
      barcodeRepository.findById.mockResolvedValue(
        makeBarcode({ isDefault: true }),
      );
      productDomainService.findById.mockResolvedValue({
        id: 'product-1',
        status: 'ACTIVE',
      } as never);
      await expect(service.remove('barcode-1', 1, actor)).rejects.toThrow(
        'Không thể xóa mã vạch mặc định',
      );
      expect(barcodeRepository.softDelete).not.toHaveBeenCalled();
    });

    it('SUCCESS: cho phép khi isDefault=false dù Product đang ACTIVE', async () => {
      barcodeRepository.findById.mockResolvedValue(
        makeBarcode({ isDefault: false }),
      );
      productDomainService.findById.mockResolvedValue({
        id: 'product-1',
        status: 'ACTIVE',
      } as never);
      await service.remove('barcode-1', 1, actor);
      expect(barcodeRepository.softDelete).toHaveBeenCalledWith(
        'barcode-1',
        'org-1',
        1,
        'user-1',
      );
    });

    it('SUCCESS: cho phép khi isDefault=true nhưng Product không còn ACTIVE', async () => {
      barcodeRepository.findById.mockResolvedValue(
        makeBarcode({ isDefault: true }),
      );
      productDomainService.findById.mockResolvedValue({
        id: 'product-1',
        status: 'INACTIVE',
      } as never);
      await service.remove('barcode-1', 1, actor);
      expect(barcodeRepository.softDelete).toHaveBeenCalled();
    });

    it('SUCCESS: sau khi đổi mã khác làm mặc định, mã cũ (không còn default) có thể xóa', async () => {
      barcodeRepository.findById.mockResolvedValue(
        makeBarcode({ isDefault: false }),
      );
      productDomainService.findById.mockResolvedValue({
        id: 'product-1',
        status: 'ACTIVE',
      } as never);
      await service.remove('barcode-1', 1, actor);
      expect(barcodeRepository.softDelete).toHaveBeenCalled();
    });

    it('ném NotFoundException khi không tồn tại', async () => {
      barcodeRepository.findById.mockResolvedValue(null);
      await expect(service.remove('missing', 1, actor)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('ném Conflict (409) khi version không khớp lúc xóa', async () => {
      barcodeRepository.findById.mockResolvedValue(makeBarcode());
      barcodeRepository.softDelete.mockRejectedValue(
        new BarcodeConcurrencyConflictError('barcode-1'),
      );
      await expect(service.remove('barcode-1', 1, actor)).rejects.toThrow(
        ConflictException,
      );
    });
  });

  describe('restore (Decision BQ3/IP07)', () => {
    it('khôi phục thành công, trả status luôn về INACTIVE, không tự động ACTIVE', async () => {
      barcodeRepository.findByIdIncludingDeleted.mockResolvedValue(
        makeBarcode({ deletedAt: new Date('2026-01-02') }),
      );
      barcodeRepository.findById.mockResolvedValue(
        makeBarcode({ status: 'INACTIVE', deletedAt: null }),
      );
      const result = await service.restore('barcode-1', 1, actor);
      expect(result.status).toBe('INACTIVE');
      expect(auditLogService.log).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'barcode.restore' }),
      );
    });

    it('ném lỗi khi Barcode chưa bị xóa', async () => {
      barcodeRepository.findByIdIncludingDeleted.mockResolvedValue(
        makeBarcode(),
      );
      await expect(service.restore('barcode-1', 1, actor)).rejects.toThrow(
        'chưa bị xóa',
      );
    });

    it('ném Conflict (409) khi version không khớp', async () => {
      barcodeRepository.findByIdIncludingDeleted.mockResolvedValue(
        makeBarcode({ deletedAt: new Date('2026-01-02') }),
      );
      barcodeRepository.restore.mockRejectedValue(
        new BarcodeConcurrencyConflictError('barcode-1'),
      );
      await expect(service.restore('barcode-1', 1, actor)).rejects.toThrow(
        ConflictException,
      );
    });

    it('ném NotFoundException khi Barcode không tồn tại (kể cả đã xóa)', async () => {
      barcodeRepository.findByIdIncludingDeleted.mockResolvedValue(null);
      await expect(service.restore('missing', 1, actor)).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('setDefault (chỉ 1 default mỗi Product — Decision IP07)', () => {
    it('ném NotFoundException khi không tồn tại', async () => {
      barcodeRepository.findById.mockResolvedValue(null);
      await expect(service.setDefault('missing', 1, actor)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('đặt mã vạch làm mặc định và ghi audit log', async () => {
      barcodeRepository.findById.mockResolvedValue(makeBarcode());
      barcodeRepository.setDefault.mockResolvedValue(
        makeBarcode({ isDefault: true }),
      );
      const result = await service.setDefault('barcode-1', 1, actor);
      expect(result.isDefault).toBe(true);
      expect(barcodeRepository.setDefault).toHaveBeenCalledWith(
        'barcode-1',
        'org-1',
        'product-1',
        1,
        'user-1',
      );
      expect(auditLogService.log).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'barcode.set_default' }),
      );
    });

    it('ném Conflict (409) khi version không khớp', async () => {
      barcodeRepository.findById.mockResolvedValue(makeBarcode());
      barcodeRepository.setDefault.mockRejectedValue(
        new BarcodeConcurrencyConflictError('barcode-1'),
      );
      await expect(service.setDefault('barcode-1', 1, actor)).rejects.toThrow(
        ConflictException,
      );
    });
  });
});
