import { Global, Module } from '@nestjs/common';
import { PrismaService } from './prisma.service';
import { SequenceCodeGeneratorService } from './sequence-code-generator.service';

@Global()
@Module({
  providers: [PrismaService, SequenceCodeGeneratorService],
  exports: [PrismaService, SequenceCodeGeneratorService],
})
export class PrismaModule {}
