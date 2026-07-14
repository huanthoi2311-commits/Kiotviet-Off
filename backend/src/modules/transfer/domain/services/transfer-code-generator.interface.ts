export interface ITransferCodeGenerator {
  generate(organizationId: string): Promise<string>;
}

export const TRANSFER_CODE_GENERATOR = Symbol('TRANSFER_CODE_GENERATOR');
