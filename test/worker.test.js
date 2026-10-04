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

// 与 worker.js 的 hashPassword 输出同一格式：pbkdf2-sha256$迭代$盐$哈希
async function passwordHash(password, iterations = 50000) {
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const keyMaterial = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), { name: 'PBKDF2' }, false, ['deriveBits']);
    const bits = new Uint8Array(await crypto.subtle.deriveBits({ name: 'PBKDF2', salt, iterations, hash: 'SHA-256' }, keyMaterial, 256));
    const b64 = (bytes) => btoa(String.fromCharCode(...bytes));
    return `pbkdf2-sha256$${iterations}$${b64(salt)}$${b64(bits)}`;
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

    it('keeps an existing session valid after the login name changes', async () => {
        await env.DB.prepare("INSERT OR IGNORE INTO users (id, username, display_name, email, password_hash) VALUES (9902, 'user_9902', '原公开称呼', 'renamed@example.test', 'unused')").run();
        const oldToken = await token({ sub: 9902, username: '旧用户名', role: 'user' });
        const response = await req('/api/user/profile', { headers: { Authorization: `Bearer ${oldToken}` } });
        expect(response.status).toBe(200);
        expect(await response.json()).toMatchObject({ username: 'user_9902', display_name: '原公开称呼' });
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

describe('Shop purchase links', () => {
    let userToken;
    let adminToken;

    beforeAll(async () => {
        userToken = await token({ sub: 9001, username: 'test-user', role: 'user' });
        adminToken = await token({ sub: 9002, username: 'test-admin', role: 'admin' });
    });

    const contribute = (body) => req('/api/contributions/shop', {
        method: 'POST',
        headers: {
            Authorization: `Bearer ${userToken}`,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            title: '链接校验测试',
            price: '¥1',
            images: ['https://example.com/a.png'],
            ship_time: '2026-12-01T00:00',
            ...body,
        }),
    });

    it('accepts a contribution that only fills the xianyu link', async () => {
        const res = await contribute({ xianyu_url: 'https://www.goofish.com/item/1' });
        expect(res.status).toBe(201);
    });

    it('accepts a contribution that only fills the other-platform link', async () => {
        const res = await contribute({ other_url: 'https://item.taobao.com/item.htm?id=1' });
        expect(res.status).toBe(201);

        const { id } = await res.json();
        const row = await env.DB.prepare('SELECT xianyu_url, other_url FROM shop WHERE id = ?').bind(id).first();
        expect(row.xianyu_url).toBe(null);
        expect(row.other_url).toBe('https://item.taobao.com/item.htm?id=1');
    });

    it('rejects a contribution that fills neither link', async () => {
        const res = await contribute({});
        expect(res.status).toBe(400);
        expect((await res.json()).error).toContain('至少填写一个');
    });

    it('stores the other-platform link on admin-created entries', async () => {
        const created = await req('/api/admin/shop', {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${adminToken}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                title: 'admin other link',
                other_url: 'https://weidian.com/item.html?itemID=1',
                status: 'waiting',
            }),
        });
        expect(created.status).toBe(200);

        const { id } = await created.json();
        const row = await env.DB.prepare('SELECT other_url FROM shop WHERE id = ?').bind(id).first();
        expect(row.other_url).toBe('https://weidian.com/item.html?itemID=1');
    });
});

describe('User profile avatar', () => {
    let userToken;

    beforeAll(async () => {
        userToken = await token({ sub: 9001, username: 'test-user', role: 'user' });
        await env.DB.prepare('UPDATE users SET avatar_url = NULL WHERE id = 9001').run();
    });

    const putAvatar = (body, withAuth = true) => req('/api/user/profile', {
        method: 'PUT',
        headers: {
            'Content-Type': 'application/json',
            ...(withAuth ? { Authorization: `Bearer ${userToken}` } : {}),
        },
        body: JSON.stringify(body),
    });

    it('requires authentication', async () => {
        const res = await putAvatar({ avatar_url: '/uploads/9001/a.webp' }, false);
        expect(res.status).toBe(401);
    });

    it('accepts an own-upload path and exposes it on the profile', async () => {
        const res = await putAvatar({ avatar_url: '/uploads/9001/123_abc.webp' });
        expect(res.status).toBe(200);
        expect((await res.json()).avatar_url).toBe('/uploads/9001/123_abc.webp');

        const profile = await (await req('/api/user/profile', {
            headers: { Authorization: `Bearer ${userToken}` },
        })).json();
        expect(profile.avatar_url).toBe('/uploads/9001/123_abc.webp');
    });

    it('accepts an https link', async () => {
        expect((await putAvatar({ avatar_url: 'https://example.com/a.png' })).status).toBe(200);
    });

    it('rejects unsafe schemes', async () => {
        const res = await putAvatar({ avatar_url: 'javascript:alert(1)' });
        expect(res.status).toBe(400);
    });

    it('rejects a non-string value', async () => {
        const res = await putAvatar({ avatar_url: 12345 });
        expect(res.status).toBe(400);
    });

    it('clears the avatar when given null', async () => {
        const res = await putAvatar({ avatar_url: null });
        expect(res.status).toBe(200);
        expect((await res.json()).avatar_url).toBe(null);

        const row = await env.DB.prepare('SELECT avatar_url FROM users WHERE id = 9001').first();
        expect(row.avatar_url).toBe(null);
    });
});

describe('User settings', () => {
    const PASSWORD = 'origin-pass-123';
    let userToken;

    beforeAll(async () => {
        await env.DB.prepare(
            `INSERT OR REPLACE INTO users (id, username, display_name, email, password_hash)
             VALUES (9010, 'settings-user', '设置用户', 'settings@example.com', ?)`
        ).bind(await passwordHash(PASSWORD)).run();
        userToken = await token({ sub: 9010, username: 'settings-user', role: 'user' });
    });

    const authHeaders = () => ({
        'Content-Type': 'application/json',
        Authorization: `Bearer ${userToken}`,
    });
    const put = (path, body) => req(path, { method: 'PUT', headers: authHeaders(), body: JSON.stringify(body) });
    const del = (path, body) => req(path, { method: 'DELETE', headers: authHeaders(), body: JSON.stringify(body) });

    it('updates bio and display name', async () => {
        const res = await put('/api/user/profile', { bio: '一句话简介', display_name: '小星尘' });
        expect(res.status).toBe(200);
        const saved = await res.json();
        expect(saved.bio).toBe('一句话简介');
        expect(saved.display_name).toBe('小星尘');

        const profile = await (await req('/api/user/profile', { headers: authHeaders() })).json();
        expect(profile.bio).toBe('一句话简介');
        expect(profile.display_name).toBe('小星尘');
    });

    it('clears the bio when given an empty string', async () => {
        expect((await put('/api/user/profile', { bio: '' })).status).toBe(200);
        expect((await env.DB.prepare('SELECT bio FROM users WHERE id = 9010').first()).bio).toBe(null);
    });

    it('rejects an over-long bio', async () => {
        expect((await put('/api/user/profile', { bio: 'x'.repeat(201) })).status).toBe(400);
    });

    it('renames the account from the settings flow', async () => {
        const res = await put('/api/user/username', { username: 'settings-renamed' });
        expect(res.status).toBe(200);
        expect((await env.DB.prepare('SELECT username FROM users WHERE id = 9010').first()).username).toBe('settings-renamed');
    });

    it('rejects renaming to the current username', async () => {
        expect((await put('/api/user/username', { username: 'settings-renamed' })).status).toBe(400);
    });

    it('changes the password and accepts the new one on login', async () => {
        expect((await put('/api/user/password', { current_password: 'wrong', new_password: 'brand-new-123' })).status).toBe(401);
        expect((await put('/api/user/password', { current_password: PASSWORD, new_password: 'short' })).status).toBe(400);

        expect((await put('/api/user/password', { current_password: PASSWORD, new_password: 'brand-new-123' })).status).toBe(200);

        const login = await req('/api/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username: 'settings-renamed', password: 'brand-new-123' }),
        });
        expect(login.status).toBe(200);
    });

    it('deletes the account, releases the identity and invalidates the token', async () => {
        expect((await del('/api/user/account', {})).status).toBe(400);
        expect((await del('/api/user/account', { password: 'nope' })).status).toBe(401);
        expect((await del('/api/user/account', { password: 'brand-new-123' })).status).toBe(200);

        const row = await env.DB.prepare('SELECT username, email, avatar_url, bio, deleted_at FROM users WHERE id = 9010').first();
        expect(row.username).toBe('deleted_9010');
        expect(row.email).toBe('deleted_9010@deleted.invalid');
        expect(row.deleted_at).toBeTruthy();

        // 旧 token 立即失效
        expect((await req('/api/user/profile', { headers: authHeaders() })).status).toBe(401);

        // 用户名被释放，可以被重新使用
        expect(await env.DB.prepare("SELECT id FROM users WHERE username = 'settings-renamed'").first()).toBe(null);

        // 已注销账号无法登录
        const login = await req('/api/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username: 'deleted_9010', password: 'brand-new-123' }),
        });
        expect(login.status).toBe(401);
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
