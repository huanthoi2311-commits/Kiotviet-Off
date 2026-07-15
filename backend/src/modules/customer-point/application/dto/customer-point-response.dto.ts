import { ApiProperty } from '@nestjs/swagger';

export class CustomerPointLedgerResponseDto {
  @ApiProperty() id: string;
  @ApiProperty() customerId: string;
  @ApiProperty({ nullable: true }) referenceType: string | null;
  @ApiProperty({ nullable: true }) referenceId: string | null;
  @ApiProperty() point: number;
  @ApiProperty() balance: number;
  @ApiProperty({ nullable: true }) expiredAt: Date | null;
  @ApiProperty() createdAt: Date;
}

export class PaginatedCustomerPointLedgerResponseDto {
  @ApiProperty({ type: [CustomerPointLedgerResponseDto] })
  items: CustomerPointLedgerResponseDto[];
  @ApiProperty() total: number;
  @ApiProperty() page: number;
  @ApiProperty() limit: number;
}
