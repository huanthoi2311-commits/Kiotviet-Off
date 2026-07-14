export interface IPurchaseReturnCodeGenerator {
  generate(organizationId: string): Promise<string>;
}

export const PURCHASE_RETURN_CODE_GENERATOR = Symbol(
  'PURCHASE_RETURN_CODE_GENERATOR',
);
