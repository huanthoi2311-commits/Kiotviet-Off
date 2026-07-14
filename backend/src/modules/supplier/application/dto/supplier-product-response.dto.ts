import { ApiProperty } from '@nestjs/swagger';

export class SupplierProductResponseDto {
  @ApiProperty() id: string;
  @ApiProperty() supplierId: string;
  @ApiProperty() productId: string;
  @ApiProperty({ nullable: true }) supplierSku: string | null;
  @ApiProperty({ nullable: true }) priority: number | null;
  @ApiProperty({ nullable: true }) defaultPrice: string | null;
  @ApiProperty({ nullable: true }) leadTime: number | null;
  @ApiProperty({ nullable: true }) minimumOrderQuantity: string | null;
  @ApiProperty() createdAt: Date;
  @ApiProperty() updatedAt: Date;
}
