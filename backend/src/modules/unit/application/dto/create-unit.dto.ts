import { ApiProperty } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString, Length } from 'class-validator';

const UNIT_CREATE_STATUSES = ['ACTIVE', 'INACTIVE'] as const;

export class CreateUnitDto {
  @ApiProperty({ example: 'CAI' })
  @IsString()
  @Length(1, 50)
  code: string;

  @ApiProperty({ example: 'Cái', minLength: 1, maxLength: 255 })
  @IsString()
  @Length(1, 255)
  name: string;

  @ApiProperty({ example: 'cái', minLength: 1, maxLength: 20 })
  @IsString()
  @Length(1, 20)
  symbol: string;

  @ApiProperty({
    required: false,
    enum: UNIT_CREATE_STATUSES,
    example: 'ACTIVE',
    description: 'Không tạo trực tiếp ở ARCHIVED',
  })
  @IsOptional()
  @IsIn(UNIT_CREATE_STATUSES)
  status?: (typeof UNIT_CREATE_STATUSES)[number];
}
