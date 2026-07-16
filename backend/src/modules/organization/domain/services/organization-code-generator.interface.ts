export interface IOrganizationCodeGenerator {
  generate(): Promise<string>;
}

export const ORGANIZATION_CODE_GENERATOR = Symbol(
  'ORGANIZATION_CODE_GENERATOR',
);
