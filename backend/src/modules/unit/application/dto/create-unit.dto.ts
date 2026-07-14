import { ApiProperty } from '@nestjs/swagger';
import { IsString, Length } from 'class-validator';

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
}
