import { ApiProperty } from '@nestjs/swagger';

export class CustomerResponseDto {
  @ApiProperty() id: string;
  @ApiProperty() code: string;
  @ApiProperty() customerType: string;
  @ApiProperty() fullName: string;
  @ApiProperty() phone: string;
  @ApiProperty({ nullable: true }) email: string | null;
  @ApiProperty({ nullable: true }) birthday: Date | null;
  @ApiProperty({ nullable: true }) gender: string | null;
  @ApiProperty({ nullable: true }) taxCode: string | null;
  @ApiProperty({ nullable: true }) companyName: string | null;
  @ApiProperty({ nullable: true }) address: string | null;
  @ApiProperty({ nullable: true }) province: string | null;
  @ApiProperty({ nullable: true }) district: string | null;
  @ApiProperty({ nullable: true }) ward: string | null;
  @ApiProperty({ nullable: true }) avatar: string | null;
  @ApiProperty({ nullable: true }) note: string | null;
  @ApiProperty({ nullable: true }) creditLimit: string | null;
  @ApiProperty() currentDebt: string;
  @ApiProperty() totalRevenue: string;
  @ApiProperty() totalOrder: number;
  @ApiProperty() totalPoint: number;
  @ApiProperty() status: string;
  @ApiProperty() createdAt: Date;
  @ApiProperty() updatedAt: Date;
  @ApiProperty({ nullable: true }) deletedAt: Date | null;
}

export class PaginatedCustomerResponseDto {
  @ApiProperty({ type: [CustomerResponseDto] }) items: CustomerResponseDto[];
  @ApiProperty() total: number;
  @ApiProperty() page: number;
  @ApiProperty() limit: number;
}
