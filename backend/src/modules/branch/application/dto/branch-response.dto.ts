import { ApiProperty } from '@nestjs/swagger';

export class BranchResponseDto {
  @ApiProperty() id: string;
  @ApiProperty({ nullable: true }) managerUserId: string | null;
  @ApiProperty({ nullable: true }) defaultWarehouseId: string | null;
  @ApiProperty() code: string;
  @ApiProperty() name: string;
  @ApiProperty({ nullable: true }) email: string | null;
  @ApiProperty({ nullable: true }) address: string | null;
  @ApiProperty({ nullable: true }) province: string | null;
  @ApiProperty({ nullable: true }) district: string | null;
  @ApiProperty({ nullable: true }) ward: string | null;
  @ApiProperty({ nullable: true }) phone: string | null;
  @ApiProperty({ nullable: true }) invoicePrefix: string | null;
  @ApiProperty({ nullable: true }) receiptPrefix: string | null;
  @ApiProperty() timezone: string;
  @ApiProperty() currencyCode: string;
  @ApiProperty() isMain: boolean;
  @ApiProperty() status: string;
  @ApiProperty() createdAt: Date;
  @ApiProperty() updatedAt: Date;
}

export class PaginatedBranchResponseDto {
  @ApiProperty({ type: [BranchResponseDto] }) items: BranchResponseDto[];
  @ApiProperty() total: number;
  @ApiProperty() page: number;
  @ApiProperty() limit: number;
}
