import { ApiProperty } from '@nestjs/swagger';
import {
  IsInt,
  IsOptional,
  IsPositive,
  IsString,
  IsUUID,
} from 'class-validator';

export class UsePointDto {
  @ApiProperty()
  @IsUUID()
  customerId: string;

  @ApiProperty({ example: 50, description: 'Số điểm muốn dùng (luôn dương)' })
  @IsInt()
  @IsPositive()
  point: number;

  @ApiProperty({
    required: false,
    example: 'ORDER',
    description: 'Nguồn phát sinh việc dùng điểm (vd: ORDER, MANUAL)',
  })
  @IsOptional()
  @IsString()
  referenceType?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsUUID()
  referenceId?: string;
}
