import { ApiProperty } from '@nestjs/swagger';
import { IsUUID } from 'class-validator';

export class TransferOwnerDto {
  @ApiProperty({
    description: 'Phải là User đã thuộc Organization này (Rule 1)',
  })
  @IsUUID()
  newOwnerUserId: string;
}
