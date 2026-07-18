export interface ISupplierCodeGenerator {
  generate(organizationId: string): Promise<string>;
}

export const SUPPLIER_CODE_GENERATOR = Symbol('SUPPLIER_CODE_GENERATOR');
