import { ApiProperty } from '@nestjs/swagger';

export class UnitResponseDto {
  @ApiProperty() id: string;
  @ApiProperty() code: string;
  @ApiProperty() name: string;
  @ApiProperty() symbol: string;
  @ApiProperty() status: string;
  @ApiProperty() version: number;
  @ApiProperty() createdAt: Date;
  @ApiProperty() updatedAt: Date;
}

export class PaginatedUnitResponseDto {
  @ApiProperty({ type: [UnitResponseDto] }) items: UnitResponseDto[];
  @ApiProperty() total: number;
  @ApiProperty() page: number;
  @ApiProperty() limit: number;
}
