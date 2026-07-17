import { ApiProperty } from '@nestjs/swagger';

export class BarcodeResponseDto {
  @ApiProperty() id: string;
  @ApiProperty() productId: string;
  @ApiProperty({ nullable: true }) unitId: string | null;
  @ApiProperty() code: string;
  @ApiProperty() type: string;
  @ApiProperty() isDefault: boolean;
  @ApiProperty() status: string;
  @ApiProperty() version: number;
  @ApiProperty() createdAt: Date;
  @ApiProperty() updatedAt: Date;
}

export class PaginatedBarcodeResponseDto {
  @ApiProperty({ type: [BarcodeResponseDto] }) items: BarcodeResponseDto[];
  @ApiProperty() total: number;
  @ApiProperty() page: number;
  @ApiProperty() limit: number;
}
