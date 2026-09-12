import { env, createExecutionContext, waitOnExecutionContext, SELF } from 'cloudflare:test';
import { describe, it, expect, beforeAll } from 'vitest';
import worker from '../worker.js';

const encode = (value) => btoa(String.fromCharCode(...new TextEncoder().encode(value)))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const encodeBytes = (bytes) => btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

async function token(payload) {
    const body = encode(JSON.stringify({ ...payload, exp: Date.now() + 60_000 }));
    const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(env.TOKEN_SECRET), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
    const signature = encodeBytes(new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(body))));
    return `${body}.${signature}`;
}

beforeAll(async () => {
    env.TOKEN_SECRET = 'test-secret';
    await env.DB.prepare("INSERT OR IGNORE INTO users (id, username, email, password_hash) VALUES (9001, 'test-user', 'test-user@example.com', 'unused')").run();
    await env.DB.prepare("INSERT OR IGNORE INTO admins (id, username, password_hash) VALUES (9002, 'test-admin', 'unused')").run();
});

async function req(path, options = {}) {
    const request = new Request(`http://localhost${path}`, options);
    const ctx = createExecutionContext();
    const response = await worker.fetch(request, env, ctx);
    await waitOnExecutionContext(ctx);
    return response;
}

describe('CORS', () => {
    it('OPTIONS preflight returns 200 with CORS headers', async () => {
        const res = await req('/api/songs', { method: 'OPTIONS' });
        expect(res.status).toBe(200);
        expect(res.headers.get('Access-Control-Allow-Origin')).toBe('*');
    });

    it('GET responses include CORS headers', async () => {
        const res = await req('/api/songs');
        expect(res.headers.get('Access-Control-Allow-Origin')).toBe('*');
    });
});

describe('Public API', () => {
    it('GET /api/songs returns 200 with array', async () => {
        const res = await req('/api/songs');
        expect(res.status).toBe(200);
        const data = await res.json();
        expect(Array.isArray(data)).toBe(true);
    });

    it('GET /api/songs?limit=N caps the batch size', async () => {
        const res = await req('/api/songs?limit=1');
        expect(res.status).toBe(200);
        const data = await res.json();
        expect(Array.isArray(data)).toBe(true);
        expect(data.length).toBeLessThanOrEqual(1);
    });

    it('GET /api/songs clamps limit to the 1000 hard cap', async () => {
        const res = await req('/api/songs?limit=99999');
        expect(res.status).toBe(200);
        const data = await res.json();
        expect(Array.isArray(data)).toBe(true);
        expect(data.length).toBeLessThanOrEqual(1000);
    });

    it('GET /api/songs tolerates malformed limit/offset', async () => {
        for (const qs of ['?limit=abc', '?offset=-5', '?limit=0', '?limit=-1&offset=abc']) {
            const res = await req(`/api/songs${qs}`);
            expect(res.status).toBe(200);
            expect(Array.isArray(await res.json())).toBe(true);
        }
    });

    it('GET /api/daily returns 200 with array', async () => {
        const res = await req('/api/daily');
        expect(res.status).toBe(200);
        const data = await res.json();
        expect(Array.isArray(data)).toBe(true);
    });

    it('GET /api/fanart returns 200 with array', async () => {
        const res = await req('/api/fanart');
        expect(res.status).toBe(200);
        const data = await res.json();
        expect(Array.isArray(data)).toBe(true);
    });

    it('GET /api/shop returns 200 with array', async () => {
        const res = await req('/api/shop');
        expect(res.status).toBe(200);
        const data = await res.json();
        expect(Array.isArray(data)).toBe(true);
    });
});

describe('Admin auth guard', () => {
    const ADMIN_PATHS = [
        ['POST', '/api/admin/songs'],
        ['GET', '/api/admin/daily'],
        ['POST', '/api/admin/daily'],
        ['GET', '/api/admin/fanart'],
        ['POST', '/api/admin/fanart'],
        ['GET', '/api/admin/shop'],
        ['POST', '/api/admin/shop'],
        ['GET', '/api/admin/admins'],
        ['POST', '/api/admin/admins'],
        ['GET', '/api/admin/audit-logs'],
    ];

    it.each(ADMIN_PATHS)('%s %s rejects without token', async (method, path) => {
        const res = await req(path, { method, headers: { 'Content-Type': 'application/json' }, body: method !== 'GET' ? '{}' : undefined });
        expect(res.status).toBe(401);
    });
});

describe('User auth guard', () => {
    it.each(['/api/user/profile', '/api/user/fanart', '/api/user/shop'])('GET %s rejects missing or malformed credentials', async (path) => {
        const res = await req(path, {
            headers: {
                Authorization: 'Bearer definitely-not-a-token',
                Cookie: 'authToken=%25invalid',
            },
        });
        expect(res.status).toBe(401);
    });

    it('rejects an admin token while accepting a user token', async () => {
        const adminToken = await token({ sub: 9002, username: 'test-admin', role: 'admin' });
        const userToken = await token({ sub: 9001, username: 'test-user', role: 'user' });
        expect((await req('/api/user/profile', { headers: { Authorization: `Bearer ${adminToken}` } })).status).toBe(401);
        expect((await req('/api/user/profile', { headers: { Authorization: `Bearer ${userToken}` } })).status).toBe(200);
    });

    it('rejects a user token while accepting an admin token', async () => {
        const adminToken = await token({ sub: 9002, username: 'test-admin', role: 'admin' });
        const userToken = await token({ sub: 9001, username: 'test-user', role: 'user' });
        expect((await req('/api/admin/admins', { headers: { Authorization: `Bearer ${userToken}` } })).status).toBe(401);
        expect((await req('/api/admin/admins', { headers: { Authorization: `Bearer ${adminToken}` } })).status).toBe(200);
    });
});

describe('Shop status lifecycle', () => {
    let adminToken;

    beforeAll(async () => {
        adminToken = await token({ sub: 9002, username: 'test-admin', role: 'admin' });
        await env.DB.prepare("INSERT OR IGNORE INTO users (id, username, email, password_hash) VALUES (9003, 'shop-owner', '', 'unused')").run();
        await env.DB.prepare("INSERT OR REPLACE INTO shop (id, title, status, user_id) VALUES (9301, 'pending shop', 'pending', 9003)").run();
        await env.DB.prepare("INSERT OR REPLACE INTO shop (id, title, status, user_id) VALUES (9302, 'shipped shop', 'shipped', 9003)").run();
        await env.DB.prepare("INSERT OR REPLACE INTO fanart (id, title, status, user_id) VALUES (9401, 'pending fanart', 'pending', 9003)").run();
    });

    it('moves an approved shop from pending to waiting and exposes it publicly', async () => {
        const approved = await req('/api/admin/pending/shop/9301', {
            method: 'PUT',
            headers: { Authorization: `Bearer ${adminToken}` },
        });
        expect(approved.status).toBe(200);
        expect((await env.DB.prepare('SELECT status FROM shop WHERE id = 9301').first()).status).toBe('waiting');

        const list = await (await req('/api/shop')).json();
        expect(list.some(item => item.id === 9301 && item.status === 'waiting')).toBe(true);
        expect((await req('/api/shop/9301')).status).toBe(200);
        expect((await req('/api/shop/9302')).status).toBe(200);
    });

    it('keeps pending shops private while fanart approval still publishes', async () => {
        await env.DB.prepare("INSERT OR REPLACE INTO shop (id, title, status, user_id) VALUES (9303, 'still pending', 'pending', 9003)").run();
        expect((await req('/api/shop/9303')).status).toBe(404);

        const approved = await req('/api/admin/pending/fanart/9401', {
            method: 'PUT',
            headers: { Authorization: `Bearer ${adminToken}` },
        });
        expect(approved.status).toBe(200);
        expect((await env.DB.prepare('SELECT status FROM fanart WHERE id = 9401').first()).status).toBe('published');
    });

    it('creates admin shop entries with the correct link fields', async () => {
        const created = await req('/api/admin/shop', {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${adminToken}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                title: 'admin shop',
                bilibili_url: 'https://www.bilibili.com/video/test',
                xianyu_url: 'https://www.goofish.com/item/test',
                status: 'waiting',
            }),
        });
        expect(created.status).toBe(200);
        const { id } = await created.json();
        const row = await env.DB.prepare('SELECT bilibili_url, xianyu_url, status FROM shop WHERE id = ?').bind(id).first();
        expect(row).toEqual({
            bilibili_url: 'https://www.bilibili.com/video/test',
            xianyu_url: 'https://www.goofish.com/item/test',
            status: 'waiting',
        });
    });
});

describe('Auth endpoint', () => {
    it('POST /api/admin/verify with wrong credentials returns 401', async () => {
        const res = await req('/api/admin/verify', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username: 'nobody', password: 'wrongpassword' }),
        });
        expect(res.status).toBe(401);
    });

    it('POST /api/admin/verify with missing body returns 400', async () => {
        const res = await req('/api/admin/verify', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: 'not json',
        });
        expect(res.status).toBe(400);
    });
});
