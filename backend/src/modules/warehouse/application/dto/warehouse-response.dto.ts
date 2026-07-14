import { ApiProperty } from '@nestjs/swagger';

export class WarehouseResponseDto {
  @ApiProperty() id: string;
  @ApiProperty() branchId: string;
  @ApiProperty({ nullable: true }) managerId: string | null;
  @ApiProperty() code: string;
  @ApiProperty() name: string;
  @ApiProperty() type: string;
  @ApiProperty({ nullable: true }) address: string | null;
  @ApiProperty({ nullable: true }) phone: string | null;
  @ApiProperty({ nullable: true }) email: string | null;
  @ApiProperty({ nullable: true }) description: string | null;
  @ApiProperty() status: string;
  @ApiProperty() createdAt: Date;
  @ApiProperty() updatedAt: Date;
  @ApiProperty({ nullable: true }) deletedAt: Date | null;
}

export class PaginatedWarehouseResponseDto {
  @ApiProperty({ type: [WarehouseResponseDto] }) items: WarehouseResponseDto[];
  @ApiProperty() total: number;
  @ApiProperty() page: number;
  @ApiProperty() limit: number;
}
