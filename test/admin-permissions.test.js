import { describe, expect, it } from 'vitest';
import {
    ADMIN_PERMISSION_KEYS,
    adminGroups,
    adminHasPermission,
    effectiveAdminPermissions,
} from '../src/shared/adminPermissions.js';

describe('permission group evaluation', () => {
    it('combines grants from all assigned groups and includes read when write is granted', () => {
        const groups = [
            { id: 'reviewers', name: 'Reviewers', permissions: ['review:write'] },
            { id: 'writers', name: 'Writers', permissions: ['songs:write'] },
        ];
        const account = { groupIds: ['reviewers', 'writers'] };

        expect(effectiveAdminPermissions(account, groups)).toEqual([
            'songs:read', 'songs:write', 'review:read', 'review:write',
        ]);
    });

    it('returns no grants for empty or unknown group membership', () => {
        const groups = [{ id: 'reviewers', name: 'Reviewers', permissions: ['review:write'] }];
        expect(effectiveAdminPermissions({ groupIds: [] }, groups)).toEqual([]);
        expect(effectiveAdminPermissions({ groupIds: ['missing'] }, groups)).toEqual([]);
        expect(adminGroups({ groupIds: ['missing'] }, groups)).toEqual([]);
    });

    it('exposes only assigned group names in account profiles', () => {
        const groups = [
            { id: 'reviewers', name: 'Reviewers', permissions: ['review:read'] },
            { id: 'writers', name: 'Writers', permissions: ['songs:write'] },
        ];
        expect(adminGroups({ groupIds: ['writers'] }, groups)).toEqual([{ id: 'writers', name: 'Writers' }]);
    });

    it('rejects unknown permissions and keeps manage grants separate from content permissions', () => {
        expect(adminHasPermission({ permissions: ['manage:write'] }, 'manage:read')).toBe(true);
        expect(adminHasPermission({ permissions: ['manage:write'] }, 'songs:read')).toBe(false);
        expect(adminHasPermission({ permissions: ['songs:write'] }, 'songs:read')).toBe(true);
        expect(adminHasPermission({ permissions: ['songs:read'] }, 'songs:write')).toBe(false);
        expect(adminHasPermission({ permissions: ['unknown:write'] }, 'unknown:read')).toBe(false);
        expect(adminHasPermission({ permissions: ['songs:write'] }, 'not-a-permission')).toBe(false);
    });

    it('defines permission keys for each supported resource and action', () => {
        expect(ADMIN_PERMISSION_KEYS).toContain('manage:read');
        expect(ADMIN_PERMISSION_KEYS).toContain('manage:write');
        expect(ADMIN_PERMISSION_KEYS).toContain('audit:read');
        expect(ADMIN_PERMISSION_KEYS).not.toContain('audit:write');
    });
});
