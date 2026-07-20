export interface IInvoiceCodeGenerator {
  generate(organizationId: string, branchId: string): Promise<string>;
}

export const INVOICE_CODE_GENERATOR = Symbol('INVOICE_CODE_GENERATOR');
