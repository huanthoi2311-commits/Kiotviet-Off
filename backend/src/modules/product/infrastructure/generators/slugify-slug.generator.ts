import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../../prisma/prisma.service';
import { ISlugGenerator } from '../../domain/services/slug-generator.interface';
import { slugify } from './slugify.util';

const MAX_ATTEMPTS = 100;

@Injectable()
export class SlugifySlugGenerator implements ISlugGenerator {
  constructor(private readonly prisma: PrismaService) {}

  async generateUnique(
    organizationId: string,
    name: string,
    excludeId?: string,
  ): Promise<string> {
    const base = slugify(name) || 'san-pham';

    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
      const candidate = attempt === 0 ? base : `${base}-${attempt + 1}`;
      const existing = await this.prisma.product.findFirst({
        where: {
          organizationId,
          slug: candidate,
          deletedAt: null,
          ...(excludeId ? { id: { not: excludeId } } : {}),
        },
        select: { id: true },
      });
      if (!existing) return candidate;
    }

    throw new Error(
      `Không sinh được slug duy nhất cho "${name}" sau ${MAX_ATTEMPTS} lần thử`,
    );
  }
}
