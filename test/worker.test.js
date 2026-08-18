import { env, createExecutionContext, waitOnExecutionContext, SELF } from 'cloudflare:test';
import { describe, it, expect, beforeAll } from 'vitest';
import worker from '../worker.js';

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
