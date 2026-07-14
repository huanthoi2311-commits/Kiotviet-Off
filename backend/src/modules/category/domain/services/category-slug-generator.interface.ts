export interface ICategorySlugGenerator {
  generateUnique(
    organizationId: string,
    name: string,
    excludeId?: string,
  ): Promise<string>;
}

export const CATEGORY_SLUG_GENERATOR = Symbol('CATEGORY_SLUG_GENERATOR');
