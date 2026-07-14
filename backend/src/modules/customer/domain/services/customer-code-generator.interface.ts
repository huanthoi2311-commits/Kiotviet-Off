export interface ICustomerCodeGenerator {
  generate(organizationId: string): Promise<string>;
}

export const CUSTOMER_CODE_GENERATOR = Symbol('CUSTOMER_CODE_GENERATOR');
