import { ApiProperty } from '@nestjs/swagger';
import { IsOptional, IsString, Length } from 'class-validator';

export class UpdateUnitDto {
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
}
