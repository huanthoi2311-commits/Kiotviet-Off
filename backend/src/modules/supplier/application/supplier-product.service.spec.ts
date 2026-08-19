import { NotFoundException } from '@nestjs/common';
import { AuditLogService } from '../../platform/audit-log/audit-log.service';
import { ProductDomainService } from '../../product/application/product-domain.service';
import {
  SupplierEntity,
  SupplierProductEntity,
} from '../domain/entities/supplier.entity';
import { ISupplierProductRepository } from '../domain/repositories/supplier-product.repository.interface';
import { ISupplierRepository } from '../domain/repositories/supplier.repository.interface';
import { SupplierProductService } from './supplier-product.service';
import { ActorContext } from './supplier.service';

describe('SupplierProductService', () => {
  let service: SupplierProductService;
  let supplierProductRepository: jest.Mocked<ISupplierProductRepository>;
  let supplierRepository: jest.Mocked<Pick<ISupplierRepository, 'findById'>>;
  let productDomainService: jest.Mocked<Pick<ProductDomainService, 'findById'>>;
  let auditLogService: jest.Mocked<Pick<AuditLogService, 'log'>>;

  const actor: ActorContext = { userId: 'user-1', organizationId: 'org-1' };

  const makeSupplier = (): SupplierEntity =>
    ({ id: 'sup-1', organizationId: 'org-1' }) as SupplierEntity;

  const makeMapping = (
    overrides: Partial<SupplierProductEntity> = {},
  ): SupplierProductEntity => ({
    id: 'sp-1',
    supplierId: 'sup-1',
    productId: 'product-1',
    supplierSku: null,
    priority: 0,
    defaultPrice: null,
    leadTime: null,
    minimumOrderQuantity: null,
    createdAt: new Date('2026-01-01'),
    updatedAt: new Date('2026-01-01'),
    ...overrides,
  });

  beforeEach(() => {
    supplierProductRepository = {
      upsert: jest.fn(),
      listBySupplier: jest.fn(),
      findOne: jest.fn(),
      remove: jest.fn(),
    };
    supplierRepository = {
      findById: jest.fn().mockResolvedValue(makeSupplier()),
    };
    productDomainService = {
      findById: jest
        .fn()
        .mockResolvedValue({ id: 'product-1', organizationId: 'org-1' }),
    };
    auditLogService = { log: jest.fn().mockResolvedValue(undefined) };

    service = new SupplierProductService(
      supplierProductRepository,
      supplierRepository as unknown as ISupplierRepository,
      productDomainService as unknown as ProductDomainService,
      auditLogService as unknown as AuditLogService,
    );
  });

  describe('listBySupplier', () => {
    it('ném NotFoundException khi supplier không tồn tại', async () => {
      supplierRepository.findById.mockResolvedValue(null);
      await expect(service.listBySupplier('sup-1', 'org-1')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('trả về danh sách mapping', async () => {
      supplierProductRepository.listBySupplier.mockResolvedValue([
        makeMapping(),
      ]);
      const result = await service.listBySupplier('sup-1', 'org-1');
      expect(result).toHaveLength(1);
    });
  });

  describe('upsert', () => {
    it('SP-U6 (= ném NotFoundException khi supplier không tồn tại) — hành vi validate supplierId có sẵn giữ nguyên, productDomainService không được gọi khi supplier đã bị từ chối trước', async () => {
      supplierRepository.findById.mockResolvedValue(null);
      await expect(
        service.upsert('sup-1', { productId: 'product-1' }, actor),
      ).rejects.toThrow(NotFoundException);
      expect(productDomainService.findById).not.toHaveBeenCalled();
      expect(supplierProductRepository.upsert).not.toHaveBeenCalled();
    });

    it('SP-U1: same-tenant Product được chấp nhận — findById gọi đúng (productId, organizationId)', async () => {
      supplierProductRepository.upsert.mockResolvedValue(makeMapping());
      const result = await service.upsert(
        'sup-1',
        { productId: 'product-1' },
        actor,
      );
      expect(productDomainService.findById).toHaveBeenCalledWith(
        'product-1',
        'org-1',
      );
      expect(result.productId).toBe('product-1');
      expect(supplierProductRepository.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          supplierId: 'sup-1',
          productId: 'product-1',
          actorId: 'user-1',
        }),
      );
      expect(auditLogService.log).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'supplier.product.upsert' }),
      );
    });

    it('SP-U2/SP-U4: Product không tồn tại — PRODUCT_001, repository upsert không được gọi', async () => {
      productDomainService.findById.mockResolvedValue(null);
      await expect(
        service.upsert('sup-1', { productId: 'product-nonexistent' }, actor),
      ).rejects.toThrow(NotFoundException);
      expect(supplierProductRepository.upsert).not.toHaveBeenCalled();
    });

    it('SP-U3/SP-U4: Product thuộc tổ chức khác (cross-tenant) — CÙNG NotFoundException như trường hợp không tồn tại (ProductDomainService.findById trả null cho cả 2 trường hợp — đã xác nhận non-disclosing ở ADR-0010), repository upsert không được gọi', async () => {
      productDomainService.findById.mockResolvedValue(null);
      await expect(
        service.upsert('sup-1', { productId: 'product-other-org' }, actor),
      ).rejects.toThrow(NotFoundException);
      expect(supplierProductRepository.upsert).not.toHaveBeenCalled();
    });

    it('SP-U5: repository.upsert không được gọi khi Product bị từ chối (đối chiếu SP-U1 CÓ gọi để chứng minh assertion thật, không phải luôn-pass)', async () => {
      productDomainService.findById.mockResolvedValueOnce(null);
      await expect(
        service.upsert('sup-1', { productId: 'product-rejected' }, actor),
      ).rejects.toThrow(NotFoundException);
      expect(supplierProductRepository.upsert).not.toHaveBeenCalled();

      productDomainService.findById.mockResolvedValueOnce({
        id: 'product-accepted',
        organizationId: 'org-1',
      } as never);
      supplierProductRepository.upsert.mockResolvedValue(
        makeMapping({ productId: 'product-accepted' }),
      );
      await service.upsert('sup-1', { productId: 'product-accepted' }, actor);
      expect(supplierProductRepository.upsert).toHaveBeenCalled();
    });
  });

  describe('remove', () => {
    it('ném NotFoundException khi mapping không tồn tại', async () => {
      supplierProductRepository.findOne.mockResolvedValue(null);
      await expect(service.remove('sup-1', 'product-1', actor)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('SP-U7: xóa thành công và ghi audit log — hành vi remove() không đổi, tiếp tục không phụ thuộc ProductDomainService (đã tự org-scope qua supplierProductRepository.findOne)', async () => {
      supplierProductRepository.findOne.mockResolvedValue(makeMapping());
      await service.remove('sup-1', 'product-1', actor);
      expect(supplierProductRepository.remove).toHaveBeenCalledWith(
        'sup-1',
        'product-1',
        'user-1',
      );
      expect(auditLogService.log).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'supplier.product.remove' }),
      );
      expect(productDomainService.findById).not.toHaveBeenCalled();
    });
  });
});
