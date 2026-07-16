import { ApiProperty } from '@nestjs/swagger';

export class CategoryResponseDto {
  @ApiProperty() id: string;
  @ApiProperty({ nullable: true }) parentId: string | null;
  @ApiProperty() code: string;
  @ApiProperty() name: string;
  @ApiProperty() slug: string;
  @ApiProperty({ nullable: true }) description: string | null;
  @ApiProperty({ nullable: true }) imageUrl: string | null;
  @ApiProperty() sortOrder: number;
  @ApiProperty() isActive: boolean;
  @ApiProperty() status: string;
  @ApiProperty({ description: 'Optimistic Lock — SPEC-CATEGORY-001 §7.1' })
  version: number;
  @ApiProperty() createdAt: Date;
  @ApiProperty() updatedAt: Date;
  @ApiProperty({ nullable: true }) deletedAt: Date | null;
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
