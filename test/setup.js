import { env } from 'cloudflare:test';
import { beforeAll } from 'vitest';
import schema from '../tool/schema.sql?raw';

beforeAll(async () => {
    const statements = schema
        .split(';')
        .map(s => s.trim())
        .filter(s => s.length > 0);
    for (const sql of statements) {
        await env.DB.prepare(sql).run();
    }
});
