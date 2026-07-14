export interface IInventoryAdjustmentCodeGenerator {
  generate(organizationId: string): Promise<string>;
}

export const INVENTORY_ADJUSTMENT_CODE_GENERATOR = Symbol(
  'INVENTORY_ADJUSTMENT_CODE_GENERATOR',
);
