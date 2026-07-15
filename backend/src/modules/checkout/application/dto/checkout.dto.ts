import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsOptional,
  IsPositive,
  IsString,
  IsUUID,
  ValidateNested,
} from 'class-validator';
import { ManualDiscountDto } from './manual-discount.dto';

const PAYMENT_METHODS = ['CASH', 'BANK_TRANSFER', 'CARD', 'E_WALLET'] as const;

export class CheckoutDto {
  @ApiProperty()
  @IsUUID()
  branchId: string;

  @ApiProperty()
  @IsUUID()
  warehouseId: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsUUID()
  customerId?: string;

  @ApiProperty({ enum: PAYMENT_METHODS })
  @IsIn(PAYMENT_METHODS)
  paymentMethod: (typeof PAYMENT_METHODS)[number];

  @ApiProperty({ required: false, description: 'Mã voucher áp dụng (nếu có)' })
  @IsOptional()
  @IsString()
  voucherCode?: string;

  @ApiProperty({
    required: false,
    description: 'Số điểm tích lũy muốn dùng — 1 điểm = 1 đồng',
  })
  @IsOptional()
  @IsInt()
  @IsPositive()
  pointsToUse?: number;

  @ApiProperty({ required: false, type: ManualDiscountDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => ManualDiscountDto)
  manualDiscount?: ManualDiscountDto;
}
