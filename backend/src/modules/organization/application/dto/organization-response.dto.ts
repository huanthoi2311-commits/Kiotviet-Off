import { ApiProperty } from '@nestjs/swagger';

export class OrganizationSettingsResponseDto {
  @ApiProperty() allowNegativeInventory: boolean;
  @ApiProperty() allowBackDate: boolean;
  @ApiProperty() decimalQuantity: number;
  @ApiProperty() decimalPrice: number;
  @ApiProperty({ nullable: true }) defaultWarehouseId: string | null;
  @ApiProperty({ nullable: true }) defaultBranchId: string | null;
  @ApiProperty() defaultLanguage: string;
  @ApiProperty() defaultCurrency: string;
}

export class OrganizationSubscriptionResponseDto {
  @ApiProperty() plan: string;
  @ApiProperty() status: string;
  @ApiProperty() startedAt: Date;
  @ApiProperty({ nullable: true }) expiredAt: Date | null;
  @ApiProperty({ nullable: true }) maxBranch: number | null;
  @ApiProperty({ nullable: true }) maxUser: number | null;
  @ApiProperty({ nullable: true }) maxWarehouse: number | null;
  @ApiProperty({ nullable: true }) maxProduct: number | null;
  @ApiProperty({ nullable: true }) maxCustomer: number | null;
  @ApiProperty({ nullable: true }) storageLimitGB: number | null;
}

export class OrganizationResponseDto {
  @ApiProperty() id: string;
  @ApiProperty() code: string;
  @ApiProperty() displayName: string;
  @ApiProperty({ nullable: true }) legalName: string | null;
  @ApiProperty() slug: string;
  @ApiProperty({ nullable: true }) taxCode: string | null;
  @ApiProperty({ nullable: true }) email: string | null;
  @ApiProperty({ nullable: true }) phone: string | null;
  @ApiProperty({ nullable: true }) website: string | null;
  @ApiProperty({ nullable: true }) logoUrl: string | null;
  @ApiProperty({ nullable: true }) address: string | null;
  @ApiProperty({ nullable: true }) province: string | null;
  @ApiProperty({ nullable: true }) district: string | null;
  @ApiProperty({ nullable: true }) ward: string | null;
  @ApiProperty() countryCode: string;
  @ApiProperty() timezone: string;
  @ApiProperty() currencyCode: string;
  @ApiProperty() languageCode: string;
  @ApiProperty() status: string;
  @ApiProperty({ nullable: true }) ownerUserId: string | null;
  @ApiProperty() createdAt: Date;
  @ApiProperty() updatedAt: Date;
}

export class OrganizationDetailResponseDto extends OrganizationResponseDto {
  @ApiProperty({ type: OrganizationSettingsResponseDto })
  settings: OrganizationSettingsResponseDto;

  @ApiProperty({ type: OrganizationSubscriptionResponseDto })
  subscription: OrganizationSubscriptionResponseDto;
}

export class PaginatedOrganizationResponseDto {
  @ApiProperty({ type: [OrganizationResponseDto] })
  items: OrganizationResponseDto[];
  @ApiProperty() total: number;
  @ApiProperty() page: number;
  @ApiProperty() limit: number;
}
