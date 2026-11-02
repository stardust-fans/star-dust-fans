import { describe, expect, it } from 'vitest';
import { ADMIN_GROUP_PRESETS } from '../src/shared/adminGroupPresets.js';
import { ADMIN_PERMISSION_KEYS, effectiveAdminPermissions } from '../src/shared/adminPermissions.js';

const permissionsFor = (...groupIds) => effectiveAdminPermissions({ groupIds }, ADMIN_GROUP_PRESETS);
const configuredGroups = ADMIN_GROUP_PRESETS.map(group =>
  group.id === 'regional' ? { ...group, permissions: ['songs:write'] } : group
);

describe('admin group presets', () => {
  it('defines unique groups with valid, unique permissions', () => {
    expect(ADMIN_GROUP_PRESETS.map(group => group.id)).toEqual(['ordinary', 'observers', 'regional', 'owners']);
    for (const group of ADMIN_GROUP_PRESETS) {
      expect(group.id).toMatch(/^[a-z][a-z0-9-]*$/);
      expect(group.name).toBeTruthy();
      expect(group.description).toBeTruthy();
      expect(new Set(group.permissions).size).toBe(group.permissions.length);
      expect(group.permissions.every(permission => ADMIN_PERMISSION_KEYS.includes(permission))).toBe(true);
    }
  });

  it('leaves ordinary and unconfigured regional members without backend permissions', () => {
    expect(permissionsFor('ordinary')).toEqual([]);
    expect(permissionsFor('regional')).toEqual([]);
  });

  it('grants a configured regional member only the assigned module', () => {
    expect(effectiveAdminPermissions({ groupIds: ['regional'] }, configuredGroups)).toEqual([
      'songs:read', 'songs:write',
    ]);
  });

  it('restricts observers to content reading', () => {
    expect(permissionsFor('observers')).toEqual([
      'songs:read', 'daily:read', 'fanart:read', 'shop:read', 'tags:read', 'thanks:read',
    ]);
  });

  it('grants owners every permission', () => {
    expect(permissionsFor('owners')).toEqual(ADMIN_PERMISSION_KEYS);
  });

  it('combines configured regional and observer grants', () => {
    expect(effectiveAdminPermissions({ groupIds: ['regional', 'observers'] }, configuredGroups)).toEqual([
      'songs:read', 'songs:write', 'daily:read', 'fanart:read', 'shop:read', 'tags:read', 'thanks:read',
    ]);
  });
});
