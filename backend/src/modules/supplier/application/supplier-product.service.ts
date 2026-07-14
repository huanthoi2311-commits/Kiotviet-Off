import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { AuditLogService } from '../../platform/audit-log/audit-log.service';
import { ErrorCode } from '../../../common/errors/error-codes';
import { withCode } from '../../../common/errors/with-code';
import { SUPPLIER_REPOSITORY } from '../domain/repositories/supplier.repository.interface';
import type { ISupplierRepository } from '../domain/repositories/supplier.repository.interface';
import { SUPPLIER_PRODUCT_REPOSITORY } from '../domain/repositories/supplier-product.repository.interface';
import type { ISupplierProductRepository } from '../domain/repositories/supplier-product.repository.interface';
import { ActorContext } from './supplier.service';
import { SupplierProductResponseDto } from './dto/supplier-product-response.dto';
import { UpsertSupplierProductDto } from './dto/upsert-supplier-product.dto';
import { SupplierMapper } from './mappers/supplier.mapper';

@Injectable()
export class SupplierProductService {
  constructor(
    @Inject(SUPPLIER_PRODUCT_REPOSITORY)
    private readonly supplierProductRepository: ISupplierProductRepository,
    @Inject(SUPPLIER_REPOSITORY)
    private readonly supplierRepository: ISupplierRepository,
    private readonly auditLogService: AuditLogService,
  ) {}

  async listBySupplier(
    supplierId: string,
    organizationId: string,
  ): Promise<SupplierProductResponseDto[]> {
    await this.assertSupplierExists(supplierId, organizationId);
    const mappings = await this.supplierProductRepository.listBySupplier(
      supplierId,
      organizationId,
    );
    return mappings.map((mapping) =>
      SupplierMapper.toSupplierProductResponseDto(mapping),
    );
  }

  async upsert(
    supplierId: string,
    dto: UpsertSupplierProductDto,
    actor: ActorContext,
  ): Promise<SupplierProductResponseDto> {
    await this.assertSupplierExists(supplierId, actor.organizationId);

    const mapping = await this.supplierProductRepository.upsert({
      supplierId,
      productId: dto.productId,
      supplierSku: dto.supplierSku,
      priority: dto.priority,
      defaultPrice: dto.defaultPrice,
      leadTime: dto.leadTime,
      minimumOrderQuantity: dto.minimumOrderQuantity,
      actorId: actor.userId,
    });

    await this.auditLogService.log({
      organizationId: actor.organizationId,
      userId: actor.userId,
      action: 'supplier.product.upsert',
      entityType: 'SupplierProduct',
      entityId: mapping.id,
      newValue: {
        supplierId,
        productId: dto.productId,
        supplierSku: dto.supplierSku ?? null,
      },
      ip: actor.ip,
      userAgent: actor.userAgent,
    });

    return SupplierMapper.toSupplierProductResponseDto(mapping);
  }

  async remove(
    supplierId: string,
    productId: string,
    actor: ActorContext,
  ): Promise<void> {
    await this.assertSupplierExists(supplierId, actor.organizationId);

    const existing = await this.supplierProductRepository.findOne(
      supplierId,
      productId,
      actor.organizationId,
    );
    if (!existing) {
      throw new NotFoundException(
        withCode(
          ErrorCode.SUPPLIER_PRODUCT_NOT_FOUND,
          'Sản phẩm chưa được gán cho nhà cung cấp này',
        ),
      );
    }

    await this.supplierProductRepository.remove(
      supplierId,
      productId,
      actor.userId,
    );

    await this.auditLogService.log({
      organizationId: actor.organizationId,
      userId: actor.userId,
      action: 'supplier.product.remove',
      entityType: 'SupplierProduct',
      entityId: existing.id,
      oldValue: { supplierId, productId },
      ip: actor.ip,
      userAgent: actor.userAgent,
    });
  }

  private async assertSupplierExists(
    supplierId: string,
    organizationId: string,
  ): Promise<void> {
    const supplier = await this.supplierRepository.findById(
      supplierId,
      organizationId,
    );
    if (!supplier) {
      throw new NotFoundException(
        withCode(ErrorCode.SUPPLIER_NOT_FOUND, 'Không tìm thấy nhà cung cấp'),
      );
    }
  }
}
