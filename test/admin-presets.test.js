import { describe, expect, it } from 'vitest';
import { ADMIN_GROUP_PRESETS } from '../src/shared/adminGroupPresets.js';
import { ADMIN_PERMISSION_KEYS, effectiveAdminPermissions } from '../src/shared/adminPermissions.js';

const permissionsFor = (...groupIds) => effectiveAdminPermissions({ groupIds }, ADMIN_GROUP_PRESETS);

describe('admin group presets', () => {
  it('defines unique groups with valid, unique permissions', () => {
    expect(ADMIN_GROUP_PRESETS).toHaveLength(13);
    expect(new Set(ADMIN_GROUP_PRESETS.map(group => group.id)).size).toBe(13);
    for (const group of ADMIN_GROUP_PRESETS) {
      expect(group.id).toMatch(/^[a-z][a-z0-9-]*$/);
      expect(group.name).toBeTruthy();
      expect(group.description).toBeTruthy();
      expect(new Set(group.permissions).size).toBe(group.permissions.length);
      expect(group.permissions.every(permission => ADMIN_PERMISSION_KEYS.includes(permission))).toBe(true);
    }
    expect(permissionsFor('owners')).toEqual(ADMIN_PERMISSION_KEYS);
  });

  it('leaves ordinary users without backend permissions', () => {
    expect(permissionsFor('ordinary')).toEqual([]);
  });

  it.each([
    ['songs-admins', 'songs'], ['daily-admins', 'daily'],
    ['fanart-admins', 'fanart'], ['shop-admins', 'shop'],
  ])('limits %s to its own module', (groupId, resource) => {
    expect(permissionsFor(groupId)).toEqual([`${resource}:read`, `${resource}:write`]);
  });

  it('restricts observers to content reading', () => {
    expect(permissionsFor('observers')).toEqual([
      'songs:read', 'daily:read', 'fanart:read', 'shop:read', 'tags:read', 'thanks:read',
    ]);
  });

  it('combines grants across groups', () => {
    expect(permissionsFor('songs-admins', 'reviewers')).toEqual([
      'songs:read', 'songs:write', 'review:read', 'review:write',
    ]);
  });
});
