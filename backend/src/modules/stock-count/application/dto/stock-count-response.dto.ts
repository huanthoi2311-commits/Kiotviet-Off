import { ApiProperty } from '@nestjs/swagger';

export class StockCountItemResponseDto {
  @ApiProperty() id: string;
  @ApiProperty() productId: string;
  @ApiProperty() systemQty: string;
  @ApiProperty({ nullable: true }) actualQty: string | null;
  @ApiProperty({ nullable: true }) difference: string | null;
  @ApiProperty({ nullable: true }) remark: string | null;
}

export class StockCountResponseDto {
  @ApiProperty() id: string;
  @ApiProperty() warehouseId: string;
  @ApiProperty() code: string;
  @ApiProperty() status: string;
  @ApiProperty({ nullable: true }) note: string | null;
  @ApiProperty({ type: [StockCountItemResponseDto] })
  items: StockCountItemResponseDto[];
  @ApiProperty() createdAt: Date;
  @ApiProperty() updatedAt: Date;
}

export class PaginatedStockCountResponseDto {
  @ApiProperty({ type: [StockCountResponseDto] })
  items: StockCountResponseDto[];
  @ApiProperty() total: number;
  @ApiProperty() page: number;
  @ApiProperty() limit: number;
}
