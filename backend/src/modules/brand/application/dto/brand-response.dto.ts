import { ApiProperty } from '@nestjs/swagger';

export class BrandResponseDto {
  @ApiProperty() id: string;
  @ApiProperty() code: string;
  @ApiProperty() name: string;
  // T033.03A — see category-response.dto.ts for the full root-cause note:
  // @nestjs/swagger's CLI plugin is not enabled, so a union type (`string |
  // null`) needs an explicit `type:` override or it emits a degenerate
  // OpenAPI/Orval type. No runtime behavior change.
  @ApiProperty({ nullable: true, type: String }) logo: string | null;
  @ApiProperty({ nullable: true, type: String }) description: string | null;
  @ApiProperty({ nullable: true, type: String }) website: string | null;
  @ApiProperty({ nullable: true, type: String }) country: string | null;
  @ApiProperty() status: string;
  @ApiProperty() version: number;
  @ApiProperty() createdAt: Date;
  @ApiProperty() updatedAt: Date;
}

export class PaginatedBrandResponseDto {
  @ApiProperty({ type: [BrandResponseDto] }) items: BrandResponseDto[];
  @ApiProperty() total: number;
  @ApiProperty() page: number;
  @ApiProperty() limit: number;
}
