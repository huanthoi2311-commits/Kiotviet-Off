import { ApiProperty } from '@nestjs/swagger';

export class SupplierResponseDto {
  @ApiProperty() id: string;
  @ApiProperty() code: string;
  @ApiProperty({ nullable: true }) taxCode: string | null;
  @ApiProperty() companyName: string;
  @ApiProperty({ nullable: true }) contactName: string | null;
  @ApiProperty({ nullable: true }) phone: string | null;
  @ApiProperty({ nullable: true }) email: string | null;
  @ApiProperty({ nullable: true }) website: string | null;
  @ApiProperty({ nullable: true }) address: string | null;
  @ApiProperty({ nullable: true }) province: string | null;
  @ApiProperty({ nullable: true }) district: string | null;
  @ApiProperty({ nullable: true }) ward: string | null;
  @ApiProperty({ nullable: true }) bankName: string | null;
  @ApiProperty({ nullable: true }) bankAccount: string | null;
  @ApiProperty({ nullable: true }) paymentTerm: number | null;
  @ApiProperty({ nullable: true }) creditLimit: string | null;
  @ApiProperty() status: string;
  @ApiProperty({ nullable: true }) note: string | null;
  @ApiProperty() createdAt: Date;
  @ApiProperty() updatedAt: Date;
  @ApiProperty({ nullable: true }) deletedAt: Date | null;
}

export class PaginatedSupplierResponseDto {
  @ApiProperty({ type: [SupplierResponseDto] }) items: SupplierResponseDto[];
  @ApiProperty() total: number;
  @ApiProperty() page: number;
  @ApiProperty() limit: number;
}
