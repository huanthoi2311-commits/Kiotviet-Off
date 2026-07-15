import { ApiProperty } from '@nestjs/swagger';

export class PaymentResponseDto {
  @ApiProperty() id: string;
  @ApiProperty() branchId: string;
  @ApiProperty() invoiceId: string;
  @ApiProperty({ nullable: true }) customerId: string | null;
  @ApiProperty() method: string;
  @ApiProperty() amount: string;
  @ApiProperty() paidAt: Date;
  @ApiProperty() createdAt: Date;
}
