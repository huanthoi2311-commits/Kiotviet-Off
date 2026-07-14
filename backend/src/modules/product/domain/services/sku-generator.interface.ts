export interface ISkuGenerator {
  /** Sinh SKU tự động, duy nhất trong phạm vi Organization. VD: SP000001, SP000002. */
  generate(organizationId: string): Promise<string>;
}

export const SKU_GENERATOR = Symbol('SKU_GENERATOR');
