import { ApiProperty } from '@nestjs/swagger';

export class BrandResponseDto {
  @ApiProperty() id: string;
  @ApiProperty() code: string;
  @ApiProperty() name: string;
  @ApiProperty({ nullable: true }) logo: string | null;
  @ApiProperty({ nullable: true }) description: string | null;
  @ApiProperty({ nullable: true }) website: string | null;
  @ApiProperty({ nullable: true }) country: string | null;
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
