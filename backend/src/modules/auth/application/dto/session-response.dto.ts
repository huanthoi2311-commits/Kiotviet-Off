import { ApiProperty } from '@nestjs/swagger';

export class SessionResponseDto {
  @ApiProperty() id: string;
  @ApiProperty({ nullable: true }) deviceName: string | null;
  @ApiProperty({ nullable: true }) browser: string | null;
  @ApiProperty({ nullable: true }) os: string | null;
  @ApiProperty({ enum: ['WEB', 'MOBILE'] }) clientType: string;
  @ApiProperty({ nullable: true }) ip: string | null;
  @ApiProperty({ nullable: true }) country: string | null;
  @ApiProperty({ nullable: true }) city: string | null;
  @ApiProperty({ nullable: true }) lastActivityAt: Date | null;
  @ApiProperty() createdAt: Date;
}
