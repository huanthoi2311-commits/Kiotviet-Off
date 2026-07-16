import { ApiProperty } from '@nestjs/swagger';
import { IsIn, IsInt, IsOptional, IsString, Length } from 'class-validator';

const UNIT_UPDATE_STATUSES = ['ACTIVE', 'INACTIVE'] as const;

export class UpdateUnitDto {
  @ApiProperty({ description: 'Version hiện tại — Optimistic Lock, bắt buộc' })
  @IsInt()
  version: number;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @Length(1, 50)
  code?: string;

  @ApiProperty({ required: false, minLength: 1, maxLength: 255 })
  @IsOptional()
  @IsString()
  @Length(1, 255)
  name?: string;

  @ApiProperty({ required: false, minLength: 1, maxLength: 20 })
  @IsOptional()
  @IsString()
  @Length(1, 20)
  symbol?: string;

  @ApiProperty({
    required: false,
    enum: UNIT_UPDATE_STATUSES,
    description: 'Không cho set ARCHIVED qua route này — chỉ qua DELETE',
  })
  @IsOptional()
  @IsIn(UNIT_UPDATE_STATUSES)
  status?: (typeof UNIT_UPDATE_STATUSES)[number];
}
