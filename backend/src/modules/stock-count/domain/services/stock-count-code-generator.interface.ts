export interface IStockCountCodeGenerator {
  generate(organizationId: string): Promise<string>;
}

export const STOCK_COUNT_CODE_GENERATOR = Symbol('STOCK_COUNT_CODE_GENERATOR');
