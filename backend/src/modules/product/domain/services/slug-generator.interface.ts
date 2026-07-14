export interface ISlugGenerator {
  /** Sinh slug từ tên, tự thêm hậu tố (-2, -3...) nếu trùng trong Organization. */
  generateUnique(
    organizationId: string,
    name: string,
    excludeId?: string,
  ): Promise<string>;
}

export const SLUG_GENERATOR = Symbol('SLUG_GENERATOR');
