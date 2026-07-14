import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../../prisma/prisma.service';
import { slugify } from '../../../../common/utils/slugify.util';
import { ICategorySlugGenerator } from '../../domain/services/category-slug-generator.interface';

const MAX_ATTEMPTS = 100;

@Injectable()
export class CategorySlugifySlugGenerator implements ICategorySlugGenerator {
  constructor(private readonly prisma: PrismaService) {}

  async generateUnique(
    organizationId: string,
    name: string,
    excludeId?: string,
  ): Promise<string> {
    const base = slugify(name) || 'danh-muc';

    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
      const candidate = attempt === 0 ? base : `${base}-${attempt + 1}`;
      const existing = await this.prisma.category.findFirst({
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
