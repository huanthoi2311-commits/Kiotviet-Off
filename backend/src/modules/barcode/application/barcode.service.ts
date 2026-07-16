import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { AuditLogService } from '../../platform/audit-log/audit-log.service';
import { ErrorCode } from '../../../common/errors/error-codes';
import { withCode } from '../../../common/errors/with-code';
import { ProductDomainService } from '../../product/application/product-domain.service';
import { BarcodeEntity } from '../domain/entities/barcode.entity';
import { BARCODE_REPOSITORY } from '../domain/repositories/barcode.repository.interface';
import type { IBarcodeRepository } from '../domain/repositories/barcode.repository.interface';
import { BarcodeResponseDto } from './dto/barcode-response.dto';
import { CreateBarcodeDto } from './dto/create-barcode.dto';
import { UpdateBarcodeDto } from './dto/update-barcode.dto';
import { BarcodeMapper } from './mappers/barcode.mapper';

export interface ActorContext {
  userId: string;
  organizationId: string;
  ip?: string | null;
  userAgent?: string | null;
}

@Injectable()
export class BarcodeService {
  constructor(
    @Inject(BARCODE_REPOSITORY)
    private readonly barcodeRepository: IBarcodeRepository,
    private readonly productDomainService: ProductDomainService,
    private readonly auditLogService: AuditLogService,
  ) {}

  async listByProduct(
    productId: string,
    organizationId: string,
  ): Promise<BarcodeResponseDto[]> {
    await this.assertProductExists(productId, organizationId);
    const barcodes = await this.barcodeRepository.listByProduct(
      productId,
      organizationId,
    );
    return barcodes.map((barcode) => BarcodeMapper.toResponseDto(barcode));
  }

  async create(
    productId: string,
    dto: CreateBarcodeDto,
    actor: ActorContext,
  ): Promise<BarcodeResponseDto> {
    await this.assertProductExists(productId, actor.organizationId);

    const created = await this.barcodeRepository.create({
      productId,
      organizationId: actor.organizationId,
      unitId: dto.unitId ?? null,
      code: dto.code,
      type: dto.type,
      isDefault: dto.isDefault,
      createdBy: actor.userId,
    });

    await this.auditLogService.log({
      organizationId: actor.organizationId,
      userId: actor.userId,
      action: 'barcode.create',
      entityType: 'Barcode',
      entityId: created.id,
      newValue: this.toAuditSnapshot(created),
      ip: actor.ip,
      userAgent: actor.userAgent,
    });

    return BarcodeMapper.toResponseDto(created);
  }

  async update(
    id: string,
    dto: UpdateBarcodeDto,
    actor: ActorContext,
  ): Promise<BarcodeResponseDto> {
    const existing = await this.barcodeRepository.findById(
      id,
      actor.organizationId,
    );
    if (!existing) throw this.notFound();

    const updated = await this.barcodeRepository.update(id, {
      ...dto,
      updatedBy: actor.userId,
    });

    await this.auditLogService.log({
      organizationId: actor.organizationId,
      userId: actor.userId,
      action: 'barcode.update',
      entityType: 'Barcode',
      entityId: id,
      oldValue: this.toAuditSnapshot(existing),
      newValue: this.toAuditSnapshot(updated),
      ip: actor.ip,
      userAgent: actor.userAgent,
    });

    return BarcodeMapper.toResponseDto(updated);
  }

  async remove(id: string, actor: ActorContext): Promise<void> {
    const existing = await this.barcodeRepository.findById(
      id,
      actor.organizationId,
    );
    if (!existing) throw this.notFound();

    await this.barcodeRepository.softDelete(id, actor.userId);

    await this.auditLogService.log({
      organizationId: actor.organizationId,
      userId: actor.userId,
      action: 'barcode.delete',
      entityType: 'Barcode',
      entityId: id,
      oldValue: this.toAuditSnapshot(existing),
      ip: actor.ip,
      userAgent: actor.userAgent,
    });
  }

  async setDefault(
    id: string,
    actor: ActorContext,
  ): Promise<BarcodeResponseDto> {
    const existing = await this.barcodeRepository.findById(
      id,
      actor.organizationId,
    );
    if (!existing) throw this.notFound();

    const updated = await this.barcodeRepository.setDefault(
      id,
      existing.productId,
      actor.userId,
    );

    await this.auditLogService.log({
      organizationId: actor.organizationId,
      userId: actor.userId,
      action: 'barcode.set_default',
      entityType: 'Barcode',
      entityId: id,
      oldValue: this.toAuditSnapshot(existing),
      newValue: this.toAuditSnapshot(updated),
      ip: actor.ip,
      userAgent: actor.userAgent,
    });

    return BarcodeMapper.toResponseDto(updated);
  }

  private async assertProductExists(
    productId: string,
    organizationId: string,
  ): Promise<void> {
    const product = await this.productDomainService.findById(
      productId,
      organizationId,
    );
    if (!product) {
      throw new NotFoundException(
        withCode(
          ErrorCode.BARCODE_PRODUCT_NOT_FOUND,
          'Không tìm thấy sản phẩm',
        ),
      );
    }
  }

  private notFound(): NotFoundException {
    return new NotFoundException(
      withCode(ErrorCode.BARCODE_NOT_FOUND, 'Không tìm thấy mã vạch'),
    );
  }

  private toAuditSnapshot(barcode: BarcodeEntity): Record<string, unknown> {
    return {
      productId: barcode.productId,
      code: barcode.code,
      type: barcode.type,
      isDefault: barcode.isDefault,
    };
  }
}
