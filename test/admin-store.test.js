import { afterEach, describe, expect, it, vi } from 'vitest';
import { ADMIN_PERMISSION_KEYS } from '../src/shared/adminPermissions.js';
import { readAdminStore, writeAdminStore } from '../src/worker/admin-store.js';

const validStore = {
    nextId: 3,
    groups: [
        { id: 'owners', name: 'Owners', permissions: ADMIN_PERMISSION_KEYS },
        { id: 'reviewers', name: 'Reviewers', permissions: ['review:read', 'review:write'] },
    ],
    accounts: [
        { id: 1, username: 'root', password_hash: 'hash-one', groupIds: ['owners'], created_at: '2026-11-01T00:00:00.000Z' },
        { id: 2, username: 'reviewer', password_hash: 'hash-two', groupIds: ['reviewers'], created_at: '2026-11-01T00:00:00.000Z' },
    ],
};

afterEach(() => vi.unstubAllGlobals());

describe('admin secret store', () => {
    it('reads administrator accounts, groups, and stable nextId from ADMIN_ACCOUNTS', () => {
        expect(readAdminStore({ ADMIN_ACCOUNTS: JSON.stringify(validStore) })).toEqual(validStore);
    });

    it.each([
        undefined,
        '{broken',
        JSON.stringify({ ...validStore, nextId: 2 }),
        JSON.stringify({ ...validStore, accounts: validStore.accounts.map((account, index) => index === 1 ? { ...account, groupIds: null } : account) }),
        JSON.stringify({ ...validStore, accounts: validStore.accounts.map((account, index) => index === 1 ? { ...account, groupIds: ['missing'] } : account) }),
        JSON.stringify({ ...validStore, accounts: validStore.accounts.map((account, index) => index === 1 ? { ...account, groupIds: ['reviewers', 'reviewers'] } : account) }),
        JSON.stringify({ ...validStore, groups: validStore.groups.map((group, index) => index === 1 ? { ...group, permissions: ['review:read', 'unknown:read'] } : group) }),
        JSON.stringify({ ...validStore, groups: validStore.groups.map((group, index) => index === 1 ? { ...group, permissions: ['review:read', 'review:read'] } : group) }),
        JSON.stringify({ ...validStore, accounts: validStore.accounts.map(account => ({ ...account, groupIds: ['reviewers'] })) }),
        JSON.stringify({ ...validStore, accounts: validStore.accounts.map(({ groupIds, ...account }) => account) }),
        JSON.stringify({ ...validStore, groups: validStore.groups.map(({ permissions, ...group }) => group) }),
    ])('rejects missing or invalid secret configuration', (secret) => {
        let failure;
        try {
            readAdminStore({ ADMIN_ACCOUNTS: secret });
        } catch (error) {
            failure = error;
        }
        expect(failure).toMatchObject({ status: 503 });
    });

    it('rejects legacy direct account permissions and role fields', () => {
        const legacy = {
            ...validStore,
            accounts: validStore.accounts.map((account, index) => index === 0
                ? { ...account, role: 'super', permissions: [] }
                : account),
        };
        expect(() => readAdminStore({ ADMIN_ACCOUNTS: JSON.stringify(legacy) })).toThrow();
    });

    it('writes the whole store as a Workers secret and does not mutate the environment', async () => {
        const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ success: true }), { status: 200 }));
        vi.stubGlobal('fetch', fetchMock);
        const env = { ADMIN_ACCOUNTS: JSON.stringify(validStore), CF_API_TOKEN: 'token-value', CF_ACCOUNT_ID: 'account-value', WORKER_NAME: 'worker-value' };

        await writeAdminStore(env, validStore);

        expect(fetchMock).toHaveBeenCalledOnce();
        const [url, init] = fetchMock.mock.calls[0];
        expect(url).toBe('https://api.cloudflare.com/client/v4/accounts/account-value/workers/scripts/worker-value/secrets');
        expect(init.method).toBe('PUT');
        expect(init.headers.Authorization).toBe('Bearer token-value');
        expect(JSON.parse(init.body)).toEqual({ name: 'ADMIN_ACCOUNTS', type: 'secret_text', text: JSON.stringify(validStore) });
        expect(env.ADMIN_ACCOUNTS).toBe(JSON.stringify(validStore));
    });

    it('reports upstream failure without exposing credentials or account data', async () => {
        vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ success: false, errors: [{ message: 'rejected' }] }), { status: 400 })));
        const env = { CF_API_TOKEN: 'private-token', CF_ACCOUNT_ID: 'private-account', WORKER_NAME: 'private-worker' };

        let failure;
        try {
            await writeAdminStore(env, validStore);
        } catch (error) {
            failure = error;
        }
        expect(failure).toMatchObject({ status: 502 });
        expect(failure.message).not.toContain('private-token');
        expect(failure.message).not.toContain('private-account');
        expect(failure.message).not.toContain('hash-one');
    });

    it('rejects writes when Cloudflare credentials are incomplete', async () => {
        const fetchMock = vi.fn();
        vi.stubGlobal('fetch', fetchMock);
        await expect(writeAdminStore({ CF_API_TOKEN: 'token-value' }, validStore)).rejects.toMatchObject({ status: 503 });
        expect(fetchMock).not.toHaveBeenCalled();
    });
});
