import { env, createExecutionContext, waitOnExecutionContext } from 'cloudflare:test';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import worker from '../worker.js';

const groups = [
    { id: 'owners', name: 'Owners', permissions: ['manage:read', 'manage:write'] },
    { id: 'reviewers', name: 'Reviewers', permissions: ['review:read', 'review:write'] },
    { id: 'readers', name: 'Readers', permissions: ['manage:read'] },
    { id: 'song-editors', name: 'Song Editors', permissions: ['songs:write'] },
    { id: 'backup-managers', name: 'Backup Managers', permissions: ['manage:write'] },
];

const accounts = [
    { id: 9201, username: 'owner', password_hash: 'unused', groupIds: ['owners'], created_at: '2026-11-01T00:00:00.000Z' },
    { id: 9202, username: 'reviewer', password_hash: 'unused', groupIds: ['reviewers'], created_at: '2026-11-01T00:00:00.000Z' },
    { id: 9203, username: 'reader', password_hash: 'unused', groupIds: ['readers'], created_at: '2026-11-01T00:00:00.000Z' },
    { id: 9204, username: 'song-editor', password_hash: 'unused', groupIds: ['song-editors', 'backup-managers'], created_at: '2026-11-01T00:00:00.000Z' },
];

const makeStore = (overrides = {}) => ({ nextId: 9205, groups, accounts, ...overrides });
const encode = (value) => btoa(String.fromCharCode(...new TextEncoder().encode(value)))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const encodeBytes = (bytes) => btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

async function token(sub) {
    const body = encode(JSON.stringify({ sub, role: 'admin', exp: Date.now() + 60_000 }));
    const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(env.TOKEN_SECRET), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
    const signature = encodeBytes(new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(body))));
    return `${body}.${signature}`;
}

async function req(path, { method = 'GET', body, accountId, store = makeStore() } = {}) {
    const headers = new Headers();
    if (body !== undefined) headers.set('Content-Type', 'application/json');
    if (accountId !== undefined) headers.set('Authorization', `Bearer ${await token(accountId)}`);
    const request = new Request(`http://localhost${path}`, {
        method,
        headers,
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    const requestEnv = { ...env, ADMIN_ACCOUNTS: JSON.stringify(store) };
    const ctx = createExecutionContext();
    const response = await worker.fetch(request, requestEnv, ctx);
    await waitOnExecutionContext(ctx);
    return response;
}

beforeAll(() => {
    env.TOKEN_SECRET = 'test-secret';
    env.CF_API_TOKEN = 'test-cloudflare-token';
    env.CF_ACCOUNT_ID = 'test-account';
    env.WORKER_NAME = 'test-worker';
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ success: true }), { status: 200 })));
});

afterEach(() => vi.clearAllMocks());

describe('permission group protected routes', () => {
    it('returns current groups and the union of permissions in the admin profile', async () => {
        const response = await req('/api/admin/me', { accountId: 9201 });
        expect(response.status).toBe(200);
        expect(await response.json()).toMatchObject({
            id: 9201,
            username: 'owner',
            groupIds: ['owners'],
            groups: [{ id: 'owners', name: 'Owners' }],
            permissions: ['manage:read', 'manage:write'],
        });
    });

    it('uses group membership from the current environment for an already issued token', async () => {
        const tokenValue = await token(9202);
        const fetchWith = async (store) => {
            const request = new Request('http://localhost/api/admin/me', { headers: { Authorization: `Bearer ${tokenValue}` } });
            const ctx = createExecutionContext();
            const response = await worker.fetch(request, { ...env, ADMIN_ACCOUNTS: JSON.stringify(store) }, ctx);
            await waitOnExecutionContext(ctx);
            return response.json();
        };

        const before = await fetchWith(makeStore());
        const after = await fetchWith(makeStore({
            accounts: accounts.map(account => account.id === 9202 ? { ...account, groupIds: ['reviewers', 'owners'] } : account),
        }));
        expect(before.permissions).toEqual(expect.arrayContaining(['review:read', 'review:write']));
        expect(before.permissions).not.toContain('manage:write');
        expect(after.permissions).toEqual(expect.arrayContaining(['review:read', 'review:write', 'manage:write']));
        expect(after.permissions).not.toContain('comments:write');
    });

    it('allows management reads to read accounts and groups but rejects every mutation', async () => {
        expect((await req('/api/admin/admins', { accountId: 9203 })).status).toBe(200);
        expect((await req('/api/admin/groups', { accountId: 9203 })).status).toBe(200);

        const mutations = [
            ['/api/admin/admins', 'POST', { username: 'new-user', password: 'password', groupIds: ['reviewers'] }],
            ['/api/admin/admins/9202', 'PUT', { groupIds: ['reviewers'] }],
            ['/api/admin/admins/9202', 'DELETE'],
            ['/api/admin/groups', 'POST', { id: 'new-group', name: 'New Group', permissions: ['review:read'] }],
            ['/api/admin/groups/reviewers', 'PUT', { name: 'Reviewers', permissions: ['review:read'] }],
            ['/api/admin/groups/reviewers', 'DELETE'],
        ];
        for (const [path, method, body] of mutations) {
            const response = await req(path, { method, body, accountId: 9203 });
            expect(response.status, `${method} ${path}`).toBe(403);
        }
        expect(fetch).not.toHaveBeenCalled();
    });

    it('requires manage:write for group mutation even when a manager has no song permissions', async () => {
        const denied = await req('/api/admin/songs', { accountId: 9201 });
        expect(denied.status).toBe(403);
        const allowed = await req('/api/admin/groups', {
            method: 'POST',
            body: { id: 'new-group', name: 'New Group', permissions: ['review:read'] },
            accountId: 9201,
        });
        expect(allowed.status).toBe(200);
    });

    it('requires the content permission for moderated comments', async () => {
        const response = await req('/api/comments/1', { method: 'DELETE', accountId: 9201 });
        expect(response.status).toBe(403);
    });

    it('rejects malformed account group references and unknown group permissions', async () => {
        const unknownAccountGroup = await req('/api/admin/admins', {
            method: 'POST',
            body: { username: 'new-user', password: 'password', groupIds: ['missing'] },
            accountId: 9201,
        });
        expect(unknownAccountGroup.status).toBeGreaterThanOrEqual(400);
        expect(unknownAccountGroup.status).toBeLessThan(500);

        const unknownPermission = await req('/api/admin/groups', {
            method: 'POST',
            body: { id: 'new-group', name: 'New Group', permissions: ['unknown:write'] },
            accountId: 9201,
        });
        expect(unknownPermission.status).toBeGreaterThanOrEqual(400);
        expect(unknownPermission.status).toBeLessThan(500);
    });

    it('preserves at least one effective manager when group edits or removals would remove the last one', async () => {
        const noOtherManager = makeStore({
            groups: groups.filter(group => group.id !== 'readers'),
            accounts: accounts.slice(0, 2),
        });
        const edit = await req('/api/admin/groups/owners', {
            method: 'PUT', body: { name: 'Owners', permissions: ['manage:read'] }, accountId: 9201, store: noOtherManager,
        });
        const remove = await req('/api/admin/groups/owners', { method: 'DELETE', accountId: 9201, store: noOtherManager });
        const moveLastManager = await req('/api/admin/admins/9201', {
            method: 'PUT', body: { groupIds: ['reviewers'] }, accountId: 9201, store: noOtherManager,
        });
        for (const response of [edit, remove, moveLastManager]) {
            expect(response.status).toBeGreaterThanOrEqual(400);
            expect(response.status).toBeLessThan(500);
        }
    });

    it('strips a deleted group from accounts and removes its grants on subsequent requests', async () => {
        const initial = makeStore({ accounts: accounts.map(account => account.id === 9202
            ? { ...account, groupIds: ['reviewers', 'owners'] }
            : account) });
        const deleted = await req('/api/admin/groups/owners', { method: 'DELETE', accountId: 9201, store: initial });
        expect(deleted.status).toBe(200);

        const savedStore = JSON.parse(vi.mocked(fetch).mock.calls.at(-1)[1].body).text;
        const afterStore = JSON.parse(savedStore);
        expect(afterStore.groups.some(group => group.id === 'owners')).toBe(false);
        expect(afterStore.accounts.find(account => account.id === 9202).groupIds).toEqual(['reviewers']);
        const response = await req('/api/admin/me', { accountId: 9202, store: afterStore });
        expect(response.status).toBe(200);
        expect(await response.json()).toMatchObject({ groupIds: ['reviewers'], permissions: expect.not.arrayContaining(['manage:write']) });
    });

    it('rejects unauthenticated requests across administrator APIs', async () => {
        const routes = [
            ['/api/admin/me', 'GET'],
            ['/api/admin/groups', 'GET'],
            ['/api/admin/groups', 'POST'],
            ['/api/admin/admins', 'GET'],
            ['/api/admin/admins', 'POST'],
            ['/api/admin/songs', 'GET'],
            ['/api/admin/tags', 'POST'],
        ];
        for (const [path, method] of routes) {
            expect((await req(path, { method })).status, `${method} ${path}`).toBe(401);
        }
    });
});
