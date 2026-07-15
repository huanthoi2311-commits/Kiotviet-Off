import { ApiProperty } from '@nestjs/swagger';
import {
  IsDateString,
  IsInt,
  IsOptional,
  IsPositive,
  IsString,
  IsUUID,
} from 'class-validator';

export class AddPointDto {
  @ApiProperty()
  @IsUUID()
  customerId: string;

  @ApiProperty({ example: 100, description: 'Số điểm cộng (luôn dương)' })
  @IsInt()
  @IsPositive()
  point: number;

  @ApiProperty({
    required: false,
    example: 'ORDER',
    description: 'Nguồn phát sinh điểm (vd: ORDER, MANUAL, PROMOTION)',
  })
  @IsOptional()
  @IsString()
  referenceType?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsUUID()
  referenceId?: string;

  @ApiProperty({ required: false, description: 'Ngày hết hạn của số điểm này' })
  @IsOptional()
  @IsDateString()
  expiredAt?: string;
}
