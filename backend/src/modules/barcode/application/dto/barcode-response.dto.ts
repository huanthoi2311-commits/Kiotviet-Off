import { ApiProperty } from '@nestjs/swagger';

export class BarcodeResponseDto {
  @ApiProperty() id: string;
  @ApiProperty() productId: string;
  @ApiProperty({ nullable: true }) unitId: string | null;
  @ApiProperty() code: string;
  @ApiProperty() type: string;
  @ApiProperty() isDefault: boolean;
  @ApiProperty() createdAt: Date;
  @ApiProperty() updatedAt: Date;
}
