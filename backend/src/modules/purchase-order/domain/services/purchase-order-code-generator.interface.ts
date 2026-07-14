export interface IPurchaseOrderCodeGenerator {
  generate(organizationId: string): Promise<string>;
}

export const PURCHASE_ORDER_CODE_GENERATOR = Symbol(
  'PURCHASE_ORDER_CODE_GENERATOR',
);
