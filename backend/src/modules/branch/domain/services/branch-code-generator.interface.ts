export interface IBranchCodeGenerator {
  generate(organizationId: string): Promise<string>;
}

export const BRANCH_CODE_GENERATOR = Symbol('BRANCH_CODE_GENERATOR');
