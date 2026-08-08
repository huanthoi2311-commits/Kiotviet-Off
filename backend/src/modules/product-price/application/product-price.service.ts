import {
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { AuditLogService } from '../../platform/audit-log/audit-log.service';
import { ErrorCode } from '../../../common/errors/error-codes';
import { withCode } from '../../../common/errors/with-code';
import { ProductDomainService } from '../../product/application/product-domain.service';
import { ProductPriceConcurrencyConflictError } from '../domain/errors/product-price.errors';
import {
  PRODUCT_PRICE_REPOSITORY,
  ProductPriceItemInput,
} from '../domain/repositories/product-price.repository.interface';
import type {
  IProductPriceRepository,
  ProductPriceSetResult,
} from '../domain/repositories/product-price.repository.interface';
import { ReplaceProductPriceSetDto } from './dto/replace-product-price-set.dto';
import { ProductPriceSetResponseDto } from './dto/product-price-response.dto';
import { ProductPriceMapper } from './mappers/product-price.mapper';

export interface ActorContext {
  userId: string;
  organizationId: string;
  ip?: string | null;
  userAgent?: string | null;
}

@Injectable()
export class ProductPriceService {
  constructor(
    @Inject(PRODUCT_PRICE_REPOSITORY)
    private readonly productPriceRepository: IProductPriceRepository,
    private readonly productDomainService: ProductDomainService,
    private readonly auditLogService: AuditLogService,
  ) {}

  async findSet(
    productId: string,
    organizationId: string,
  ): Promise<ProductPriceSetResponseDto> {
    await this.assertProductExists(productId, organizationId);
    const set = await this.productPriceRepository.findSetByProductId(productId);
    if (!set) throw this.notFound();
    return ProductPriceMapper.toResponseDto(productId, set);
  }

  async replaceSet(
    productId: string,
    dto: ReplaceProductPriceSetDto,
    actor: ActorContext,
  ): Promise<ProductPriceSetResponseDto> {
    await this.assertProductExists(productId, actor.organizationId);

    this.assertNoDuplicatePriceTypes(dto.prices);
    this.assertHasRetailPrice(dto.prices);

    const oldSet =
      await this.productPriceRepository.findSetByProductId(productId);

    const input: ProductPriceItemInput[] = dto.prices.map((p) => ({
      type: p.type,
      price: p.price,
    }));

    let updated: ProductPriceSetResult;
    try {
      updated = await this.productPriceRepository.replaceSet(
        productId,
        dto.priceVersion,
        input,
        actor.userId,
      );
    } catch (error) {
      if (error instanceof ProductPriceConcurrencyConflictError) {
        throw new ConflictException(
          withCode(ErrorCode.PRODUCT_PRICE_VERSION_CONFLICT, error.message),
        );
      }
      throw error;
    }

    await this.auditLogService.log({
      organizationId: actor.organizationId,
      userId: actor.userId,
      action: 'product-price.update',
      entityType: 'ProductPrice',
      entityId: productId,
      oldValue: oldSet ?? null,
      newValue: updated,
      ip: actor.ip,
      userAgent: actor.userAgent,
    });

    return ProductPriceMapper.toResponseDto(productId, updated);
  }

  private async assertProductExists(
    productId: string,
    organizationId: string,
  ): Promise<void> {
    const product = await this.productDomainService.findById(
      productId,
      organizationId,
    );
    if (!product) throw this.notFound();
  }

  private assertNoDuplicatePriceTypes(
    prices: ReplaceProductPriceSetDto['prices'],
  ): void {
    const seen = new Set<string>();
    for (const p of prices) {
      if (seen.has(p.type)) {
        throw new UnprocessableEntityException(
          withCode(
            ErrorCode.PRODUCT_PRICE_DUPLICATE_TYPE,
            `Loại giá "${p.type}" xuất hiện nhiều hơn 1 lần trong price set`,
          ),
        );
      }
      seen.add(p.type);
    }
  }

  private assertHasRetailPrice(
    prices: ReplaceProductPriceSetDto['prices'],
  ): void {
    const hasRetail = prices.some((p) => p.type === 'RETAIL');
    if (!hasRetail) {
      throw new UnprocessableEntityException(
        withCode(
          ErrorCode.PRODUCT_MISSING_RETAIL_PRICE,
          'Sản phẩm phải có ít nhất 1 mức giá RETAIL',
        ),
      );
    }
  }

  private notFound(): NotFoundException {
    return new NotFoundException(
      withCode(ErrorCode.PRODUCT_NOT_FOUND, 'Không tìm thấy sản phẩm'),
    );
  }
}
