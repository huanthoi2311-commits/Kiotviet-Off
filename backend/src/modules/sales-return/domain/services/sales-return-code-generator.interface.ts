export interface ISalesReturnCodeGenerator {
  generate(organizationId: string): Promise<string>;
}

export const SALES_RETURN_CODE_GENERATOR = Symbol(
  'SALES_RETURN_CODE_GENERATOR',
);
