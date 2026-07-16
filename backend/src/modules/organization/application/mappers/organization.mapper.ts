import {
  OrganizationAggregate,
  OrganizationEntity,
} from '../../domain/entities/organization.entity';
import {
  OrganizationDetailResponseDto,
  OrganizationResponseDto,
} from '../dto/organization-response.dto';

export class OrganizationMapper {
  static toResponseDto(entity: OrganizationEntity): OrganizationResponseDto {
    return {
      id: entity.id,
      code: entity.code,
      displayName: entity.displayName,
      legalName: entity.legalName,
      slug: entity.slug,
      taxCode: entity.taxCode,
      email: entity.email,
      phone: entity.phone,
      website: entity.website,
      logoUrl: entity.logoUrl,
      address: entity.address,
      province: entity.province,
      district: entity.district,
      ward: entity.ward,
      countryCode: entity.countryCode,
      timezone: entity.timezone,
      currencyCode: entity.currencyCode,
      languageCode: entity.languageCode,
      status: entity.status,
      ownerUserId: entity.ownerUserId,
      createdAt: entity.createdAt,
      updatedAt: entity.updatedAt,
    };
  }

  static toDetailResponseDto(
    aggregate: OrganizationAggregate,
  ): OrganizationDetailResponseDto {
    return {
      ...OrganizationMapper.toResponseDto(aggregate.organization),
      settings: {
        allowNegativeInventory: aggregate.settings.allowNegativeInventory,
        allowBackDate: aggregate.settings.allowBackDate,
        decimalQuantity: aggregate.settings.decimalQuantity,
        decimalPrice: aggregate.settings.decimalPrice,
        defaultWarehouseId: aggregate.settings.defaultWarehouseId,
        defaultBranchId: aggregate.settings.defaultBranchId,
        defaultLanguage: aggregate.settings.defaultLanguage,
        defaultCurrency: aggregate.settings.defaultCurrency,
      },
      subscription: {
        plan: aggregate.subscription.plan,
        status: aggregate.subscription.status,
        startedAt: aggregate.subscription.startedAt,
        expiredAt: aggregate.subscription.expiredAt,
        maxBranch: aggregate.subscription.maxBranch,
        maxUser: aggregate.subscription.maxUser,
        maxWarehouse: aggregate.subscription.maxWarehouse,
        maxProduct: aggregate.subscription.maxProduct,
        maxCustomer: aggregate.subscription.maxCustomer,
        storageLimitGB: aggregate.subscription.storageLimitGB,
      },
    };
  }
}
