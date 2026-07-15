import { ApiProperty } from '@nestjs/swagger';
import { InvoiceResponseDto } from '../../../invoice/application/dto/invoice-response.dto';
import { PaymentResponseDto } from '../../../payment/application/dto/payment-response.dto';

export class CheckoutResponseDto {
  @ApiProperty({ type: InvoiceResponseDto }) invoice: InvoiceResponseDto;
  @ApiProperty({ type: PaymentResponseDto }) payment: PaymentResponseDto;
}
