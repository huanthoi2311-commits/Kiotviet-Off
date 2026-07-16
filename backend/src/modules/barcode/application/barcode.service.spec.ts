import { NotFoundException } from '@nestjs/common';
import { AuditLogService } from '../../platform/audit-log/audit-log.service';
import { ProductDomainService } from '../../product/application/product-domain.service';
import { BarcodeEntity } from '../domain/entities/barcode.entity';
import { IBarcodeRepository } from '../domain/repositories/barcode.repository.interface';
import { ActorContext, BarcodeService } from './barcode.service';

describe('BarcodeService', () => {
  let service: BarcodeService;
  let barcodeRepository: jest.Mocked<IBarcodeRepository>;
  let productDomainService: jest.Mocked<Pick<ProductDomainService, 'findById'>>;
  let auditLogService: jest.Mocked<Pick<AuditLogService, 'log'>>;

  const actor: ActorContext = { userId: 'user-1', organizationId: 'org-1' };

  const makeBarcode = (
    overrides: Partial<BarcodeEntity> = {},
  ): BarcodeEntity => ({
    id: 'barcode-1',
    productId: 'product-1',
    unitId: null,
    code: '8938505970381',
    type: 'EAN13',
    isDefault: false,
    createdAt: new Date('2026-01-01'),
    updatedAt: new Date('2026-01-01'),
    deletedAt: null,
    ...overrides,
  });

  beforeEach(() => {
    barcodeRepository = {
      create: jest.fn(),
      findById: jest.fn(),
      listByProduct: jest.fn(),
      update: jest.fn(),
      softDelete: jest.fn(),
      setDefault: jest.fn(),
      existsByCode: jest.fn(),
      hasActiveBarcodesInUnit: jest.fn(),
    };
    productDomainService = {
      findById: jest.fn().mockResolvedValue({ id: 'product-1' }),
    };
    auditLogService = { log: jest.fn().mockResolvedValue(undefined) };

    service = new BarcodeService(
      barcodeRepository,
      productDomainService as unknown as ProductDomainService,
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
  });

  describe('update', () => {
    it('ném NotFoundException khi không tồn tại', async () => {
      barcodeRepository.findById.mockResolvedValue(null);
      await expect(
        service.update('missing', { code: 'x' }, actor),
      ).rejects.toThrow(NotFoundException);
    });

    it('cập nhật thành công, ghi audit log old/new', async () => {
      barcodeRepository.findById.mockResolvedValue(makeBarcode());
      barcodeRepository.update.mockResolvedValue(makeBarcode({ code: '999' }));
      const result = await service.update('barcode-1', { code: '999' }, actor);
      expect(result.code).toBe('999');
      expect(auditLogService.log).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'barcode.update' }),
      );
    });
  });

  describe('remove', () => {
    it('ném NotFoundException khi không tồn tại', async () => {
      barcodeRepository.findById.mockResolvedValue(null);
      await expect(service.remove('missing', actor)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('xóa mềm thành công', async () => {
      barcodeRepository.findById.mockResolvedValue(makeBarcode());
      await service.remove('barcode-1', actor);
      expect(barcodeRepository.softDelete).toHaveBeenCalledWith(
        'barcode-1',
        'user-1',
      );
    });
  });

  describe('setDefault', () => {
    it('ném NotFoundException khi không tồn tại', async () => {
      barcodeRepository.findById.mockResolvedValue(null);
      await expect(service.setDefault('missing', actor)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('đặt mã vạch làm mặc định và ghi audit log', async () => {
      barcodeRepository.findById.mockResolvedValue(makeBarcode());
      barcodeRepository.setDefault.mockResolvedValue(
        makeBarcode({ isDefault: true }),
      );
      const result = await service.setDefault('barcode-1', actor);
      expect(result.isDefault).toBe(true);
      expect(barcodeRepository.setDefault).toHaveBeenCalledWith(
        'barcode-1',
        'product-1',
        'user-1',
      );
      expect(auditLogService.log).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'barcode.set_default' }),
      );
    });
  });
});
