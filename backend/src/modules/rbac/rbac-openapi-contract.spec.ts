import { readFileSync } from 'fs';
import { join } from 'path';

/**
 * T052.03C — regression proof for the "RolesController/PermissionsController never had
 * @ApiResponse decorators" gap discovered while auditing the generated frontend client (every
 * hook for GET /roles, GET /roles/:id, POST /roles, GET /permissions resolved to `void` because
 * `docs/api/openapi.json` had no response schema for them — confirmed a real, isolated gap: every
 * other controller sampled in this codebase, e.g. UserController, already had these decorators).
 * Reads the COMMITTED `docs/api/openapi.json` directly (same technique the "API Client Drift" CI
 * job already trusts as the source of truth) rather than booting Nest — fast, deterministic, no
 * new testing framework.
 */
describe('RBAC OpenAPI contract (T052.03C)', () => {
  const openapiPath = join(__dirname, '../../../../docs/api/openapi.json');
  const openapi = JSON.parse(readFileSync(openapiPath, 'utf-8')) as {
    paths: Record<
      string,
      Record<string, { responses: Record<string, unknown> }>
    >;
    components: { schemas: Record<string, unknown> };
  };

  function responseSchema(
    path: string,
    method: string,
    status: string,
  ): unknown {
    const response = openapi.paths[path]?.[method]?.responses?.[status] as
      { content?: { 'application/json'?: { schema?: unknown } } } | undefined;
    return response?.content?.['application/json']?.schema;
  }

  it('GET /roles returns an array of RoleResponseDto (not void)', () => {
    const schema = responseSchema('/api/v1/roles', 'get', '200') as
      { type?: string; items?: { $ref?: string } } | undefined;
    expect(schema).toBeDefined();
    expect(schema?.type).toBe('array');
    expect(schema?.items?.$ref).toBe('#/components/schemas/RoleResponseDto');
  });

  it('POST /roles returns RoleResponseDto (not void)', () => {
    const schema = responseSchema('/api/v1/roles', 'post', '201') as
      { $ref?: string } | undefined;
    expect(schema?.$ref).toBe('#/components/schemas/RoleResponseDto');
  });

  it('GET /roles/:id returns RoleWithPermissionsResponseDto (not void)', () => {
    const schema = responseSchema('/api/v1/roles/{id}', 'get', '200') as
      { $ref?: string } | undefined;
    expect(schema?.$ref).toBe(
      '#/components/schemas/RoleWithPermissionsResponseDto',
    );
  });

  it('POST /roles/:id/permissions returns RoleWithPermissionsResponseDto (not void)', () => {
    const schema = responseSchema(
      '/api/v1/roles/{id}/permissions',
      'post',
      '201',
    ) as { $ref?: string } | undefined;
    expect(schema?.$ref).toBe(
      '#/components/schemas/RoleWithPermissionsResponseDto',
    );
  });

  it('GET /permissions returns an array of PermissionResponseDto (not void)', () => {
    const schema = responseSchema('/api/v1/permissions', 'get', '200') as
      { type?: string; items?: { $ref?: string } } | undefined;
    expect(schema).toBeDefined();
    expect(schema?.type).toBe('array');
    expect(schema?.items?.$ref).toBe(
      '#/components/schemas/PermissionResponseDto',
    );
  });

  it('RoleResponseDto/RoleWithPermissionsResponseDto/PermissionResponseDto schemas match the entities exactly (no leaked/renamed field)', () => {
    const schemas = openapi.components.schemas as Record<
      string,
      { properties?: Record<string, unknown>; required?: string[] }
    >;

    expect(
      Object.keys(schemas.RoleResponseDto.properties ?? {}).sort(),
    ).toEqual(
      [
        'code',
        'description',
        'id',
        'isSystem',
        'name',
        'organizationId',
      ].sort(),
    );
    expect(
      Object.keys(
        schemas.RoleWithPermissionsResponseDto.properties ?? {},
      ).sort(),
    ).toEqual(
      [
        'code',
        'description',
        'id',
        'isSystem',
        'name',
        'organizationId',
        'permissionCodes',
      ].sort(),
    );
    expect(
      Object.keys(schemas.PermissionResponseDto.properties ?? {}).sort(),
    ).toEqual(['code', 'description', 'group', 'id'].sort());
  });

  it('POST /roles/assign and DELETE /roles/:roleId/users/:userId remain correctly void (RbacService returns void for both — not a gap)', () => {
    expect(
      responseSchema('/api/v1/roles/assign', 'post', '201'),
    ).toBeUndefined();
    expect(
      responseSchema('/api/v1/roles/{roleId}/users/{userId}', 'delete', '204'),
    ).toBeUndefined();
  });
});
