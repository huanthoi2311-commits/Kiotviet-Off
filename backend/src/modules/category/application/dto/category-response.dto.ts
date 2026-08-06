import { ApiProperty } from '@nestjs/swagger';

export class CategoryResponseDto {
  @ApiProperty() id: string;
  // T033.03A — @nestjs/swagger's CLI plugin is not enabled (nest-cli.json), so
  // ApiProperty() relies on reflect-metadata alone; a union type (`string |
  // null`) emits `Object` at runtime, which produced a degenerate
  // `{ [key: string]: unknown } | null` OpenAPI/Orval type without this
  // explicit `type:` override. No runtime behavior change.
  @ApiProperty({ nullable: true, type: String }) parentId: string | null;
  @ApiProperty() code: string;
  @ApiProperty() name: string;
  @ApiProperty() slug: string;
  @ApiProperty({ nullable: true, type: String }) description: string | null;
  @ApiProperty({ nullable: true, type: String }) imageUrl: string | null;
  @ApiProperty() sortOrder: number;
  @ApiProperty() isActive: boolean;
  @ApiProperty() status: string;
  @ApiProperty({ description: 'Optimistic Lock — SPEC-CATEGORY-001 §7.1' })
  version: number;
  @ApiProperty() createdAt: Date;
  @ApiProperty() updatedAt: Date;
  @ApiProperty({ nullable: true, type: Date }) deletedAt: Date | null;
}

export class CategoryTreeResponseDto extends CategoryResponseDto {
  @ApiProperty({ type: () => [CategoryTreeResponseDto] })
  children: CategoryTreeResponseDto[];
}

export class PaginatedCategoryResponseDto {
  @ApiProperty({ type: [CategoryResponseDto] }) items: CategoryResponseDto[];
  @ApiProperty() total: number;
  @ApiProperty() page: number;
  @ApiProperty() limit: number;
}
