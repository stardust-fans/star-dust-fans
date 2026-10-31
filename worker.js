// worker.js
import { handleOidcRequest } from "./src/worker/oidc.js";
import { handleSamlRequest } from "./src/worker/saml.js";
import { handleScimRequest } from "./src/worker/scim.js";
import { isValidDisplayName, isValidUsername, normalizeDisplayName, normalizeUsername, usernameCandidate } from "./src/shared/username.js";
import {
    adminHasPermission,
    adminIsSuper,
    normalizeAdminRole,
    parseAdminPermissions,
    serializeAdminPermissions,
} from "./src/shared/adminPermissions.js";
// ===== 附件白名单 =====
const ATTACHMENT_ALLOWED_EXT = new Set([
  'zip', '7z', 'rar', 'tar', 'gz', 'bz2', 'xz', 'zst',
  'pdf', 'txt', 'md', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx',
  'mp3', 'wav', 'flac', 'ogg', 'm4a',
  'mp4', 'webm', 'mov', 'mkv', 'avi',
  'psd', 'clip', 'sai2', 'kra', 'procreate', 'ai', 'sketch',
  'aseprite', 'aup3', 'flp', 'als',
]);
const ATTACHMENT_MAX_SIZE = 500 * 1024 * 1024;
const ATTACHMENT_MAX_COUNT = 3;
// 大文件走 R2 multipart 分片上传：单个请求体远小于 Worker 的请求体/内存上限
const ATTACHMENT_PART_SIZE = 8 * 1024 * 1024;
const ATTACHMENT_MAX_PARTS = 256;
const ATTACHMENT_LIMIT_TEXT = `${Math.round(ATTACHMENT_MAX_SIZE / 1024 / 1024)}MB`;

// 解析 Range 头："bytes=0-1023" / "bytes=1024-" / "bytes=-1024"
function parseRangeHeader(value) {
    const match = /^bytes=(\d*)-(\d*)$/.exec(String(value || '').trim());
    if (!match) return null;
    const [, rawStart, rawEnd] = match;
    if (rawStart === '' && rawEnd === '') return null;
    if (rawStart === '') return { suffix: Number(rawEnd) };
    const offset = Number(rawStart);
    if (rawEnd === '') return { offset };
    const end = Number(rawEnd);
    if (end < offset) return null;
    return { offset, length: end - offset + 1 };
}

// ===== R2 直传：S3 兼容接口的 SigV4 预签名 =====
// 浏览器拿到签名 URL 后直接 PUT 到 R2，字节不经过 Worker，
// 因此不受 Worker 请求体（100MB）与内存（128MB）限制。
const R2_S3_REGION = 'auto';
const R2_PRESIGN_EXPIRES = 15 * 60;

function toHex(buffer) {
    return Array.from(new Uint8Array(buffer)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

async function sha256Hex(value) {
    const data = typeof value === 'string' ? new TextEncoder().encode(value) : value;
    return toHex(await crypto.subtle.digest('SHA-256', data));
}

async function hmacSha256(key, value) {
    const cryptoKey = await crypto.subtle.importKey(
        'raw', key, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
    );
    return new Uint8Array(await crypto.subtle.sign('HMAC', cryptoKey, new TextEncoder().encode(value)));
}

async function presignR2Put({ accountId, accessKeyId, secretAccessKey, bucket, key, expiresIn = R2_PRESIGN_EXPIRES }) {
    const host = `${accountId}.r2.cloudflarestorage.com`;
    const canonicalUri = `/${bucket}/${key.split('/').map((seg) => encodeURIComponent(seg)).join('/')}`;
    const amzDate = new Date().toISOString().replace(/[:-]|\.\d{3}/g, '');
    const dateStamp = amzDate.slice(0, 8);
    const scope = `${dateStamp}/${R2_S3_REGION}/s3/aws4_request`;

    const query = {
        'X-Amz-Algorithm': 'AWS4-HMAC-SHA256',
        'X-Amz-Credential': `${accessKeyId}/${scope}`,
        'X-Amz-Date': amzDate,
        'X-Amz-Expires': String(expiresIn),
        'X-Amz-SignedHeaders': 'host',
    };
    const canonicalQuery = Object.keys(query)
        .sort()
        .map((k) => `${encodeURIComponent(k)}=${encodeURIComponent(query[k])}`)
        .join('&');

    const canonicalRequest = [
        'PUT',
        canonicalUri,
        canonicalQuery,
        `host:${host}\n`,
        'host',
        'UNSIGNED-PAYLOAD',
    ].join('\n');

    const stringToSign = [
        'AWS4-HMAC-SHA256',
        amzDate,
        scope,
        await sha256Hex(canonicalRequest),
    ].join('\n');

    const kDate = await hmacSha256(new TextEncoder().encode(`AWS4${secretAccessKey}`), dateStamp);
    const kRegion = await hmacSha256(kDate, R2_S3_REGION);
    const kService = await hmacSha256(kRegion, 's3');
    const kSigning = await hmacSha256(kService, 'aws4_request');
    const signature = toHex(await hmacSha256(kSigning, stringToSign));

    return `https://${host}${canonicalUri}?${canonicalQuery}&X-Amz-Signature=${signature}`;
}

function songFilter(searchParams, includeUnpublished) {
    const conditions = [includeUnpublished ? "status != 'deleted'" : "status = 'published'"];
    const params = [];
    const query = (searchParams.get('q') || '').trim().slice(0, 200);
    if (query) {
        conditions.push(`(
            instr(lower(coalesce(title, '')), lower(?)) > 0
            OR instr(lower(coalesce(bvid, '')), lower(?)) > 0
            OR instr(lower(coalesce(owner_name, '')), lower(?)) > 0
        )`);
        params.push(query, query, query);
    }
    return { where: conditions.join(' AND '), params };
}

const SONG_SORT_ORDERS = Object.freeze({
    latest: 'coalesce(pubdate, 0) DESC, id DESC',
    oldest: 'coalesce(pubdate, 0) ASC, id ASC',
    'view-desc': 'coalesce(stat_view, 0) DESC, id DESC',
    'view-asc': 'coalesce(stat_view, 0) ASC, id ASC',
});

export default {
    async fetch(request, env, ctx) {
        try {
            return await handleRequest(request, env, ctx);
        } catch (error) {
            const url = new URL(request.url);
            console.error('❌ Worker 顶层未捕获错误:', {
                path: url.pathname,
                method: request.method,
                error: error?.message,
                stack: error?.stack,
            });

            // API 请求 → JSON 500，前端 api.js 会拦截跳 fallback
            if (url.pathname.startsWith('/api/')) {
                return Response.json(
                    { error: 'server_error' },
                    {
                        status: 500,
                        headers: {
                            'Access-Control-Allow-Origin': '*',
                            'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
                            'Access-Control-Allow-Headers': 'Content-Type, Authorization',
                        },
                    }
                );
            }

            // 其他（页面、协议端点等）→ 直接 500
            return new Response('服务器内部错误', { status: 500 });
        }
    },
};

async function handleRequest(request, env, ctx) {
    const url = new URL(request.url);
    const path = url.pathname;
    const method = request.method;

    // ===== CORS 预检 =====
    if (method === 'OPTIONS') {
        return new Response(null, {
            headers: {
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
                'Access-Control-Allow-Headers': 'Content-Type, Authorization',
            }
        });
    }

    // ===== CORS 响应包装函数 =====
    function jsonResponse(data, status = 200) {
        return Response.json(data, {
            status,
            headers: {
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
                'Access-Control-Allow-Headers': 'Content-Type, Authorization',
            }
        });
    }

    // ===== 管理员权限校验 =====
    // admin 是 getAuthenticatedUser 返回的管理员身份：{ sub, username, role, permissions }
    // role: 'super' | 'admin'；permissions: string[] | null（null = 旧账号，全权）
    function requirePermission(admin, scope) {
        if (!admin) return jsonResponse({ error: '未授权' }, 401);
        if (!adminHasPermission(admin, scope)) {
            return jsonResponse({ error: '没有该模块的操作权限', scope }, 403);
        }
        return null;
    }

    // 返回给前端的管理员档案（登录 / /api/admin/me 共用）
    function adminProfile(admin) {
        return {
            id: admin.sub,
            username: admin.username,
            role: admin.role,
            permissions: admin.permissions,
            isSuper: adminIsSuper(admin),
            allAccess: admin.role === 'super' || admin.permissions === null,
        };
    }

    const oidcResponse = await handleOidcRequest(
        request,
        env,
        ctx,
        () => getAuthenticatedUser(request, env, 'user')
    );
    if (oidcResponse) return oidcResponse;

    const samlResponse = await handleSamlRequest(
        request,
        env,
        ctx,
        () => getAuthenticatedUser(request, env, 'user')
    );
    if (samlResponse) return samlResponse;

    const scimResponse = await handleScimRequest(request, env, ctx);
    if (scimResponse) return scimResponse;

    const isAdmin = await getAuthenticatedUser(request, env, 'admin');

    // ===== 1. GET /api/songs =====
    if ((path === '/api/songs' || path === '/api/admin/songs') && method === 'GET') {
        const adminList = path === '/api/admin/songs';
        if (adminList) {
            const denied = requirePermission(isAdmin, 'songs');
            if (denied) return denied;
        }
        try {
            const { where, params } = songFilter(url.searchParams, adminList);
            const sort = url.searchParams.get('sort') || 'latest';
            const order = Object.hasOwn(SONG_SORT_ORDERS, sort) ? SONG_SORT_ORDERS[sort] : SONG_SORT_ORDERS.latest;
            const limit = parseInt(url.searchParams.get('limit') || '1000');
            const offset = parseInt(url.searchParams.get('offset') || '0');
            const safeLimit = Number.isNaN(limit) ? 1000 : Math.min(Math.max(limit, 1), 1000);
            const safeOffset = Number.isNaN(offset) ? 0 : Math.max(offset, 0);

            const stmt = env.DB.prepare(`
                SELECT id, bvid, title, cover_url, description, duration, pubdate,
                       owner_name, owner_mid, owner_face,
                       stat_view, stat_danmaku, stat_reply, stat_favorite, stat_coin, stat_share, stat_like,
                       is_masterpiece, is_national_team, is_gods_descend, is_legend,
                       special_tags, collaboration_details, status, flag_reason
                FROM songs
                WHERE ${where}
                ORDER BY ${order}
                LIMIT ? OFFSET ?
            `);
            const result = await stmt.bind(...params, safeLimit, safeOffset).all();

            const songs = (result.results || []).map(row => ({
                id: row.id,
                bvid: row.bvid,
                title: row.title || '未知标题',
                cover: row.cover_url || '',
                description: row.description || '',
                pubdate: row.pubdate || 0,
                duration: row.duration || 0,
                stats: {
                    view: row.stat_view || 0,
                    danmaku: row.stat_danmaku || 0,
                    reply: row.stat_reply || 0,
                    favorite: row.stat_favorite || 0,
                    coin: row.stat_coin || 0,
                    share: row.stat_share || 0,
                    like: row.stat_like || 0,
                },
                owner: {
                    name: row.owner_name || '',
                    mid: row.owner_mid || 0,
                    face: row.owner_face || '',
                },
                is_masterpiece: row.is_masterpiece === 1,
                is_national_team: row.is_national_team === 1,
                is_gods_descend: row.is_gods_descend === 1,
                is_legend: row.is_legend === 1,
                special_tags: row.special_tags ? JSON.parse(row.special_tags) : [],
                collaboration_details: row.collaboration_details,
                status: row.status,
                ...(adminList ? { flag_reason: row.flag_reason || '' } : {}),
            }));

            return jsonResponse(songs);
        } catch (error) {
            console.error('❌ /api/songs 错误:', error.message);
            return jsonResponse({ error: error.message }, 500);
        }
    }

    // ===== IP 归属地代理（转发到 ip9.com.cn，显式传递用户真实 IP）=====
    if (path.startsWith('/api/ip/')) {
        try {
            const userIP = request.headers.get('CF-Connecting-IP') || '';

            if (!userIP) {
                console.warn('⚠️ 无法获取 CF-Connecting-IP，可能运行在本地开发环境');
                return jsonResponse({
                    ret: 200,
                    data: {
                        ip: '127.0.0.1',
                        country: '中国',
                        prov: '黑龙江',
                        city: '绥化',
                        isp: '本地测试',
                    }
                });
            }

            const targetPath = path.replace('/api/ip', '');
            const queryChar = targetPath.includes('?') ? '&' : '?';
            const targetUrl = `https://ip9.com.cn${targetPath}${queryChar}ip=${encodeURIComponent(userIP)}`;

            const response = await fetch(targetUrl, {
                method: request.method,
                headers: {
                    'User-Agent': request.headers.get('User-Agent') || 'Mozilla/5.0',
                    'Referer': 'https://stardustinfinity.top',
                    'Accept': 'application/json',
                },
            });

            const data = await response.json();

            const newResponse = new Response(JSON.stringify(data), {
                status: response.status,
                statusText: response.statusText,
                headers: {
                    'Content-Type': 'application/json',
                    'Access-Control-Allow-Origin': '*',
                    'Access-Control-Allow-Methods': 'GET, OPTIONS',
                },
            });

            return newResponse;

        } catch (error) {
            console.error('❌ /api/ip/ 代理错误:', error.message);
            return jsonResponse({ error: 'IP 查询服务暂时不可用' }, 500);
        }
    }

    // ===== 1.1 GET /api/songs/count =====
    if ((path === '/api/songs/count' || path === '/api/admin/songs/count') && method === 'GET') {
        const adminList = path === '/api/admin/songs/count';
        if (adminList) {
            const denied = requirePermission(isAdmin, 'songs');
            if (denied) return denied;
        }
        try {
            const { where, params } = songFilter(url.searchParams, adminList);
            const stmt = env.DB.prepare(`SELECT COUNT(*) as total FROM songs WHERE ${where}`);
            const result = await stmt.bind(...params).first();
            return jsonResponse({ total: result?.total || 0 });
        } catch (error) {
            console.error('❌ /api/songs/count 错误:', error.message);
            return jsonResponse({ error: error.message }, 500);
        }
    }

    // ===== 1.5 GET /api/daily =====
    if (path === '/api/daily' && method === 'GET') {
        try {
            const stmt = env.DB.prepare(`
                SELECT id, title, content, source_url, cover_url, publish_date
                FROM daily
                WHERE status = 'published'
                ORDER BY publish_date DESC, id DESC
            `);
            const result = await stmt.all();
            return jsonResponse(result.results || []);
        } catch (error) {
            console.error('❌ /api/daily 错误:', error.message);
            return jsonResponse({ error: error.message }, 500);
        }
    }

    // ===== 公开标签列表 =====
    if (path === '/api/tags' && method === 'GET') {
        try {
            const result = await env.DB.prepare(
                'SELECT id, name, sort_order FROM tags ORDER BY sort_order ASC, id ASC'
            ).all();
            return jsonResponse(result.results || []);
        } catch (error) {
            console.error('❌ GET /api/tags 错误:', error.message);
            return jsonResponse({ error: error.message }, 500);
        }
    }

    // ===== 用户申请新标签 =====
    if (path === '/api/tags/request' && method === 'POST') {
        const userId = await getAuthenticatedUserId(request, env);
        if (!userId) return jsonResponse({ error: '请先登录' }, 401);

        try {
            const { name } = await request.json();
            if (!name || !String(name).trim()) {
                return jsonResponse({ error: '标签名不能为空' }, 400);
            }
            const trimmed = String(name).trim().slice(0, 32);

            const existing = await env.DB.prepare('SELECT id FROM tags WHERE name = ?').bind(trimmed).first();
            if (existing) return jsonResponse({ error: '标签已存在' }, 409);

            // 申请表（可选，如果你想审核）
            // 这里直接创建，管理员可在后台看到并清理
            const result = await env.DB.prepare(
                'INSERT INTO tags (name, sort_order) VALUES (?, 999)'
            ).bind(trimmed).run();

            return jsonResponse({ success: true, id: result.meta?.last_row_id, name: trimmed });
        } catch (error) {
            return jsonResponse({ error: error.message }, 500);
        }
    }

    // ===== 1.6 GET /api/fanart =====
    if (path === '/api/fanart' && method === 'GET') {
        try {
            const stmt = env.DB.prepare(`
                SELECT id, title, author, description, image_url, bilibili_url, source_url, type, tags, attachments
                FROM fanart
                WHERE status = 'published'
                ORDER BY created_at DESC
            `);
            const result = await stmt.all();
            return jsonResponse(result.results || []);
        } catch (error) {
            console.error('❌ /api/fanart 错误:', error.message);
            return jsonResponse({ error: error.message }, 500);
        }
    }

    // ===== 1.7 GET /api/shop =====
    if (path === '/api/shop' && method === 'GET') {
        try {
            const stmt = env.DB.prepare(`
                SELECT id, title, description, price, image_url, bilibili_url, xianyu_url, other_url, status
                FROM shop
                WHERE status IN ('waiting', 'shipped')
                ORDER BY created_at DESC
            `);
            const result = await stmt.all();
            return jsonResponse(result.results || []);
        } catch (error) {
            console.error('❌ /api/shop 错误:', error.message);
            return jsonResponse({ error: error.message }, 500);
        }
    }

    // ===== 3. POST /api/admin/verify =====
    if (path === '/api/admin/verify' && method === 'POST') {
        try {
            const body = await request.json();
            const username = body.username;
            const password = body.password;
            if (!env.TOKEN_SECRET) {
                return jsonResponse({ error: '服务未配置' }, 503);
            }

            const row = username
                ? await env.DB.prepare('SELECT id, username, password_hash, role, permissions FROM admins WHERE username = ?').bind(username).first()
                : null;

            const passwordOk = row
                ? await verifyPassword(password, row.password_hash)
                : await verifyPassword(password, DUMMY_PASSWORD_HASH);

            if (row && passwordOk) {
                const token = await signToken({
                    sub: row.id,
                    username: row.username,
                    role: 'admin',
                    exp: Date.now() + 24 * 60 * 60 * 1000,
                }, env);
                const profile = adminProfile({
                    sub: row.id,
                    username: row.username,
                    role: normalizeAdminRole(row.role),
                    permissions: parseAdminPermissions(row.permissions),
                });
                ctx.waitUntil(logAuditEvent(env, {
                    eventType: 'login_success', actorAdminId: row.id, actorUsername: row.username, request,
                }));
                return jsonResponse({ success: true, token, admin: profile });
            }

            ctx.waitUntil(logAuditEvent(env, {
                eventType: 'login_failure', actorUsername: username || null, request,
            }));
            return jsonResponse({ error: '用户名或密码错误' }, 401);
        } catch (error) {
            console.error('❌ /api/admin/verify 错误:', error.message);
            return jsonResponse({ error: error.message }, 400);
        }
    }

    // ===== 当前管理员档案（角色 + 权限范围）=====
    if (path === '/api/admin/me' && method === 'GET') {
        if (!isAdmin) return jsonResponse({ error: '未授权' }, 401);
        return jsonResponse(adminProfile(isAdmin));
    }

    // ===== 管理员：标签管理 =====
    if (path === '/api/admin/tags' && method === 'GET') {
        const denied = requirePermission(isAdmin, 'tags');
        if (denied) return denied;
        try {
            const result = await env.DB.prepare(
                'SELECT id, name, sort_order FROM tags ORDER BY sort_order ASC, id ASC'
            ).all();
            return jsonResponse(result.results || []);
        } catch (error) {
            return jsonResponse({ error: error.message }, 500);
        }
    }

    if (path === '/api/admin/tags' && method === 'POST') {
        const denied = requirePermission(isAdmin, 'tags');
        if (denied) return denied;
        try {
            const { name, sort_order } = await request.json();
            if (!name || !String(name).trim()) {
                return jsonResponse({ error: '标签名不能为空' }, 400);
            }
            const trimmed = String(name).trim().slice(0, 32);
            const existing = await env.DB.prepare('SELECT id FROM tags WHERE name = ?').bind(trimmed).first();
            if (existing) return jsonResponse({ error: '标签已存在' }, 409);

            const result = await env.DB.prepare(
                'INSERT INTO tags (name, sort_order) VALUES (?, ?)'
            ).bind(trimmed, sort_order || 0).run();

            return jsonResponse({ success: true, id: result.meta?.last_row_id });
        } catch (error) {
            return jsonResponse({ error: error.message }, 500);
        }
    }

    const adminTagMatch = path.match(/^\/api\/admin\/tags\/(\d+)$/);
    if (adminTagMatch && method === 'DELETE') {
        const denied = requirePermission(isAdmin, 'tags');
        if (denied) return denied;
        try {
            const id = adminTagMatch[1];
            await env.DB.prepare('DELETE FROM tags WHERE id = ?').bind(id).run();
            return jsonResponse({ success: true });
        } catch (error) {
            return jsonResponse({ error: error.message }, 500);
        }
    }

    // ===== 3.5 管理员账号管理 =====
    if (path === '/api/admin/admins' && method === 'POST') {
        const denied = requirePermission(isAdmin, 'admins');
        if (denied) return denied;
        try {
            const body = await request.json();
            const username = String(body.username || '').trim();
            const password = body.password;
            const role = normalizeAdminRole(body.role);
            // 普通管理员必须带明确的权限数组（空数组 = 无权限）；超级管理员始终全权
            const permissions = role === 'super'
                ? null
                : (Array.isArray(body.permissions) ? body.permissions : []);

            if (!username) {
                return jsonResponse({ error: '用户名不能为空' }, 400);
            }
            if (!password || String(password).length < 8) {
                return jsonResponse({ error: '密码至少 8 位' }, 400);
            }

            const existing = await env.DB.prepare('SELECT id FROM admins WHERE username = ?').bind(username).first();
            if (existing) {
                return jsonResponse({ error: '该用户名已存在' }, 409);
            }

            const passwordHash = await hashPassword(password);
            const result = await env.DB.prepare(
                'INSERT INTO admins (username, password_hash, role, permissions) VALUES (?, ?, ?, ?)'
            ).bind(username, passwordHash, role, serializeAdminPermissions(permissions)).run();

            ctx.waitUntil(logAuditEvent(env, {
                eventType: 'create', actorAdminId: isAdmin.sub, actorUsername: isAdmin.username,
                targetTable: 'admins', targetId: result.meta?.last_row_id,
                summary: { username, role, permissions }, request,
            }));

            return jsonResponse({ success: true, id: result.meta?.last_row_id, role, permissions });
        } catch (error) {
            console.error('❌ POST /api/admin/admins 错误:', error.message);
            return jsonResponse({ error: error.message }, 500);
        }
    }

    if (path === '/api/admin/admins' && method === 'GET') {
        const denied = requirePermission(isAdmin, 'admins');
        if (denied) return denied;
        try {
            const result = await env.DB.prepare(
                'SELECT id, username, role, permissions, created_at FROM admins ORDER BY id ASC'
            ).all();
            const list = (result.results || []).map((row) => ({
                id: row.id,
                username: row.username,
                role: normalizeAdminRole(row.role),
                permissions: parseAdminPermissions(row.permissions),
                allAccess: normalizeAdminRole(row.role) === 'super' || row.permissions === null,
                isSelf: isAdmin.sub === row.id,
                created_at: row.created_at,
            }));
            return jsonResponse(list);
        } catch (error) {
            console.error('❌ GET /api/admin/admins 错误:', error.message);
            return jsonResponse({ error: error.message }, 500);
        }
    }

    const adminUpdateMatch = path.match(/^\/api\/admin\/admins\/(\d+)$/);
    if (adminUpdateMatch && method === 'PUT') {
        const denied = requirePermission(isAdmin, 'admins');
        if (denied) return denied;
        try {
            const id = parseInt(adminUpdateMatch[1], 10);
            const body = await request.json();
            const target = await env.DB.prepare(
                'SELECT id, username, role, permissions FROM admins WHERE id = ?'
            ).bind(id).first();
            if (!target) {
                return jsonResponse({ error: '账号不存在' }, 404);
            }

            const targetRole = normalizeAdminRole(target.role);
            const targetPermissions = parseAdminPermissions(target.permissions);
            const nextRole = body.role !== undefined ? normalizeAdminRole(body.role) : targetRole;
            // 超级管理员始终全权；普通管理员不传 permissions 时沿用原值（旧账号 null = 全权保留）
            const nextPermissions = nextRole === 'super'
                ? null
                : (Array.isArray(body.permissions) ? body.permissions : targetPermissions);

            // 允许改自己的角色和权限，只要改完还有别人（或自己）保有全权即可
            const targetIsSuper = adminIsSuper({ role: targetRole, permissions: targetPermissions });
            const nextIsSuper = nextRole === 'super' || nextPermissions === null;
            if (targetIsSuper && !nextIsSuper) {
                const superRow = await env.DB.prepare(
                    "SELECT COUNT(*) AS n FROM admins WHERE role = 'super' OR permissions IS NULL"
                ).first();
                if ((superRow?.n || 0) <= 1) {
                    return jsonResponse({ error: '至少要保留一个超级管理员' }, 400);
                }
            }

            const updates = ['role = ?', 'permissions = ?'];
            const params = [nextRole, serializeAdminPermissions(nextPermissions)];
            if (body.password !== undefined) {
                if (!body.password || String(body.password).length < 8) {
                    return jsonResponse({ error: '密码至少 8 位' }, 400);
                }
                updates.push('password_hash = ?');
                params.push(await hashPassword(String(body.password)));
            }
            params.push(id);
            await env.DB.prepare(`UPDATE admins SET ${updates.join(', ')} WHERE id = ?`).bind(...params).run();

            ctx.waitUntil(logAuditEvent(env, {
                eventType: 'update', actorAdminId: isAdmin.sub, actorUsername: isAdmin.username,
                targetTable: 'admins', targetId: id,
                summary: { username: target.username, role: nextRole, permissions: nextPermissions }, request,
            }));

            return jsonResponse({ success: true, role: nextRole, permissions: nextPermissions });
        } catch (error) {
            console.error('❌ PUT /api/admin/admins 错误:', error.message);
            return jsonResponse({ error: error.message }, 500);
        }
    }

    const adminDeleteMatch = path.match(/^\/api\/admin\/admins\/(\d+)$/);
    if (adminDeleteMatch && method === 'DELETE') {
        const denied = requirePermission(isAdmin, 'admins');
        if (denied) return denied;
        try {
            const id = parseInt(adminDeleteMatch[1], 10);
            if (isAdmin.sub === id) {
                return jsonResponse({ error: '不能删除自己' }, 400);
            }

            const countRow = await env.DB.prepare('SELECT COUNT(*) AS n FROM admins').first();
            if ((countRow?.n || 0) <= 1) {
                return jsonResponse({ error: '不能删除最后一个管理员账号' }, 400);
            }

            const target = await env.DB.prepare('SELECT username, role, permissions FROM admins WHERE id = ?').bind(id).first();
            if (target && adminIsSuper({ role: normalizeAdminRole(target.role), permissions: parseAdminPermissions(target.permissions) })) {
                const superRow = await env.DB.prepare(
                    "SELECT COUNT(*) AS n FROM admins WHERE role = 'super' OR permissions IS NULL"
                ).first();
                if ((superRow?.n || 0) <= 1) {
                    return jsonResponse({ error: '至少要保留一个超级管理员' }, 400);
                }
            }

            const result = await env.DB.prepare('DELETE FROM admins WHERE id = ?').bind(id).run();
            if (result.meta?.changes === 0) {
                return jsonResponse({ error: '账号不存在' }, 404);
            }

            ctx.waitUntil(logAuditEvent(env, {
                eventType: 'delete', actorAdminId: isAdmin.sub, actorUsername: isAdmin.username,
                targetTable: 'admins', targetId: id,
                summary: { username: target?.username }, request,
            }));

            return jsonResponse({ success: true });
        } catch (error) {
            console.error('❌ DELETE /api/admin/admins 错误:', error.message);
            return jsonResponse({ error: error.message }, 500);
        }
    }

    // ===== 用户注册 =====
    if (path === '/api/register' && method === 'POST') {
        try {
            const body = await request.json();
            const { password, 'cf-turnstile-response': turnstileToken } = body;
            const username = normalizeUsername(body.username);
            const email = typeof body.email === 'string' ? body.email.trim() : '';
            const displayName = normalizeDisplayName(body.display_name);

            if (!isValidUsername(username)) {
                return jsonResponse({ error: '用户名需为 2–32 位字母、数字、下划线或短横线' }, 400);
            }
            if (!email) {
                return jsonResponse({ error: '邮箱不能为空' }, 400);
            }
            if (body.display_name != null && typeof body.display_name !== 'string') {
                return jsonResponse({ error: '显示名格式不正确' }, 400);
            }
            if (displayName && !isValidDisplayName(displayName)) {
                return jsonResponse({ error: '显示名需为 1–32 个字符且不能包含控制字符' }, 400);
            }

            if (!turnstileToken) {
                return jsonResponse({ error: '请完成人机验证' }, 400);
            }

            const turnstileResult = await verifyTurnstileToken(turnstileToken, env);
            if (!turnstileResult.success) {
                return jsonResponse({ error: '人机验证失败，请重试' }, 400);
            }

            const existing = await env.DB.prepare(
                'SELECT id FROM users WHERE username = ? COLLATE NOCASE OR email = ? COLLATE NOCASE'
            ).bind(username, email).first();

            if (existing) {
                return jsonResponse({ error: '用户名或邮箱已被注册' }, 409);
            }

            const passwordHash = await hashPassword(password);

            const result = await env.DB.prepare(
                'INSERT INTO users (username, display_name, email, password_hash) VALUES (?, ?, ?, ?)'
            ).bind(username, displayName || null, email, passwordHash).run();

            return jsonResponse({
                success: true,
                message: '注册成功',
                userId: result.meta?.last_row_id || null
            }, 201);

        } catch (error) {
            console.error('❌ /api/register 错误:', error.message);
            return jsonResponse({ error: error.message }, 500);
        }
    }

    // ===== 用户登录 =====
    if (path === '/api/login' && method === 'POST') {
        try {
            const body = await request.json();
            const { username, password } = body;
            const identifier = typeof username === 'string' ? username.trim() : '';

            if (!identifier || !password) {
                return jsonResponse({ error: '用户名或邮箱及密码不能为空' }, 400);
            }

            const matches = await env.DB.prepare(
                `SELECT id, username, COALESCE(display_name, username) AS display_name, password_hash
                 FROM users WHERE (username = ? COLLATE NOCASE OR email = ? COLLATE NOCASE)
                   AND deleted_at IS NULL LIMIT 2`
            ).bind(identifier, identifier).all();
            const user = matches.results?.length === 1 ? matches.results[0] : null;

            const scimState = user
                ? await env.DB.prepare('SELECT active FROM scim_user_state WHERE user_id = ?').bind(user.id).first()
                : null;

            if (!user || scimState?.active === 0) {
                return jsonResponse({ error: '用户名或密码错误' }, 401);
            }

            const passwordOk = await verifyPassword(password, user.password_hash);
            if (!passwordOk) {
                return jsonResponse({ error: '用户名或密码错误' }, 401);
            }

            const token = await signToken({
                sub: user.id,
                username: user.username,
                role: 'user',
                exp: Date.now() + 7 * 24 * 60 * 60 * 1000,
            }, env);

            return jsonResponse({
                success: true,
                token,
                user: { id: user.id, username: user.username, display_name: user.display_name },
                username_change_required: !isValidUsername(user.username),
            });

        } catch (error) {
            console.error('❌ /api/login 错误:', error.message);
            return jsonResponse({ error: error.message }, 500);
        }
    }

    // ===== 3.6 GET /api/admin/audit-logs =====
    if (path === '/api/admin/audit-logs' && method === 'GET') {
        const denied = requirePermission(isAdmin, 'audit');
        if (denied) return denied;
        try {
            const eventType = url.searchParams.get('event_type');
            const actor = url.searchParams.get('actor');
            const from = url.searchParams.get('from');
            const to = url.searchParams.get('to');
            const conditions = [], params = [];
            if (eventType) { conditions.push('event_type = ?'); params.push(eventType); }
            if (actor) { conditions.push('actor_username LIKE ?'); params.push(`%${actor}%`); }
            if (from) { conditions.push('created_at >= ?'); params.push(from); }
            if (to) { conditions.push('created_at <= ?'); params.push(`${to} 23:59:59`); }
            const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
            const stmt = env.DB.prepare(`
                SELECT id, event_type, actor_admin_id, actor_username, target_table, target_id, summary, ip_address, user_agent, created_at
                FROM audit_logs ${where} ORDER BY created_at DESC LIMIT 200
            `);
            const result = await stmt.bind(...params).all();
            return jsonResponse(result.results || []);
        } catch (error) {
            console.error('❌ GET /api/admin/audit-logs 错误:', error.message);
            return jsonResponse({ error: error.message }, 500);
        }
    }

    // ===== 4. POST /api/admin/songs =====
    if (path === '/api/admin/songs' && method === 'POST') {
        const denied = requirePermission(isAdmin, 'songs');
        if (denied) return denied;
        try {
            const body = await request.json();
            const { bvid, special_tags, collaboration_details, status, flag_reason,
                    is_masterpiece, is_national_team, is_gods_descend, is_legend,
                    cover, title, description, duration, pubdate, owner, stats, cover_url } = body;

            if (!bvid || !/^BV[a-zA-Z0-9]{10}$/.test(bvid)) {
                return jsonResponse({ error: 'bvid 格式不正确' }, 400);
            }
            if (!title || !String(title).trim()) {
                return jsonResponse({ error: '标题不能为空' }, 400);
            }

            let coverBase64 = null;
            if (cover) {
                const normalized = normalizeCoverBase64(cover);
                const check = validateCoverBase64(normalized);
                if (!check.ok) return jsonResponse({ error: check.error }, 400);
                coverBase64 = normalized;
            }

            const existStmt = env.DB.prepare('SELECT id FROM songs WHERE bvid = ?');
            const existing = await existStmt.bind(bvid).first();
            if (existing) {
                return jsonResponse({ error: '该歌曲已存在' }, 409);
            }

            const stmt = env.DB.prepare(`
                INSERT INTO songs (
                    bvid, title, cover_base64, cover_url, description, duration, pubdate,
                    owner_name, owner_mid, owner_face,
                    stat_view, stat_danmaku, stat_reply, stat_favorite, stat_coin, stat_share, stat_like,
                    snapshot_synced_at,
                    is_masterpiece, is_national_team, is_gods_descend, is_legend,
                    special_tags, collaboration_details, status, flag_reason
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, ?, ?, ?, ?, ?, ?, ?, ?)
            `);
            const result = await stmt.bind(
                bvid,
                title,
                coverBase64,
                cover_url || null,
                description || null,
                duration || 0,
                pubdate || 0,
                owner?.name || null,
                owner?.mid || null,
                owner?.face || null,
                stats?.view || 0,
                stats?.danmaku || 0,
                stats?.reply || 0,
                stats?.favorite || 0,
                stats?.coin || 0,
                stats?.share || 0,
                stats?.like || 0,
                is_masterpiece || 0,
                is_national_team || 0,
                is_gods_descend || 0,
                is_legend || 0,
                special_tags ? JSON.stringify(special_tags) : null,
                collaboration_details || null,
                status || 'published',
                flag_reason || null
            ).run();

            ctx.waitUntil(logAuditEvent(env, {
                eventType: 'create', actorAdminId: isAdmin.sub, actorUsername: isAdmin.username,
                targetTable: 'songs', targetId: result.meta?.last_row_id,
                summary: { bvid, title, status: status || 'published' },
                request,
            }));

            return jsonResponse({
                success: true,
                id: result.meta?.last_row_id || null,
                message: '添加成功'
            });
        } catch (error) {
            console.error('❌ POST /api/admin/songs 错误:', error.message);
            return jsonResponse({ error: error.message }, 500);
        }
    }

    // ===== 5. PUT /api/admin/songs/:id =====
    const putMatch = path.match(/^\/api\/admin\/songs\/(\d+)$/);
    if (putMatch && method === 'PUT') {
        const denied = requirePermission(isAdmin, 'songs');
        if (denied) return denied;
        try {
            const id = putMatch[1];
            const body = await request.json();
            const { special_tags, collaboration_details, status, flag_reason,
                    is_masterpiece, is_national_team, is_gods_descend, is_legend,
                    cover, title, description, duration, pubdate, owner, stats, cover_url } = body;

            let coverBase64 = null;
            if (cover) {
                const normalized = normalizeCoverBase64(cover);
                const check = validateCoverBase64(normalized);
                if (!check.ok) return jsonResponse({ error: check.error }, 400);
                coverBase64 = normalized;
            }
            const isSnapshotRefresh = title !== undefined;

            const stmt = env.DB.prepare(`
                UPDATE songs SET
                    title = COALESCE(?, title),
                    cover_base64 = COALESCE(?, cover_base64),
                    cover_url = COALESCE(?, cover_url),
                    description = COALESCE(?, description),
                    duration = COALESCE(?, duration),
                    pubdate = COALESCE(?, pubdate),
                    owner_name = COALESCE(?, owner_name),
                    owner_mid = COALESCE(?, owner_mid),
                    owner_face = COALESCE(?, owner_face),
                    stat_view = COALESCE(?, stat_view),
                    stat_danmaku = COALESCE(?, stat_danmaku),
                    stat_reply = COALESCE(?, stat_reply),
                    stat_favorite = COALESCE(?, stat_favorite),
                    stat_coin = COALESCE(?, stat_coin),
                    stat_share = COALESCE(?, stat_share),
                    stat_like = COALESCE(?, stat_like),
                    snapshot_synced_at = COALESCE(?, snapshot_synced_at),
                    is_masterpiece = ?,
                    is_national_team = ?,
                    is_gods_descend = ?,
                    is_legend = ?,
                    special_tags = ?,
                    collaboration_details = ?,
                    status = ?,
                    flag_reason = ?,
                    updated_at = CURRENT_TIMESTAMP
                WHERE id = ?
            `);
            const result = await stmt.bind(
                title ?? null,
                coverBase64,
                cover_url ?? null,
                description ?? null,
                duration ?? null,
                pubdate ?? null,
                owner?.name ?? null,
                owner?.mid ?? null,
                owner?.face ?? null,
                stats?.view ?? null,
                stats?.danmaku ?? null,
                stats?.reply ?? null,
                stats?.favorite ?? null,
                stats?.coin ?? null,
                stats?.share ?? null,
                stats?.like ?? null,
                isSnapshotRefresh ? new Date().toISOString() : null,
                is_masterpiece || 0,
                is_national_team || 0,
                is_gods_descend || 0,
                is_legend || 0,
                special_tags ? JSON.stringify(special_tags) : null,
                collaboration_details || null,
                status || 'published',
                flag_reason || null,
                id
            ).run();

            if (result.meta?.changes === 0) {
                return jsonResponse({ error: '歌曲不存在' }, 404);
            }

            ctx.waitUntil(logAuditEvent(env, {
                eventType: 'update', actorAdminId: isAdmin.sub, actorUsername: isAdmin.username,
                targetTable: 'songs', targetId: Number(id),
                summary: { title: title ?? null, status: status || 'published' },
                request,
            }));

            return jsonResponse({ success: true, message: '更新成功' });
        } catch (error) {
            console.error('❌ PUT /api/admin/songs 错误:', error.message);
            return jsonResponse({ error: error.message }, 500);
        }
    }

    // ===== 6. DELETE /api/admin/songs/:id =====
    const deleteMatch = path.match(/^\/api\/admin\/songs\/(\d+)$/);
    if (deleteMatch && method === 'DELETE') {
        const denied = requirePermission(isAdmin, 'songs');
        if (denied) return denied;
        try {
            const id = deleteMatch[1];
            const target = await env.DB.prepare('SELECT title FROM songs WHERE id = ?').bind(id).first();
            const stmt = env.DB.prepare(`
                UPDATE songs SET status = 'deleted', updated_at = CURRENT_TIMESTAMP
                WHERE id = ?
            `);
            const result = await stmt.bind(id).run();

            if (result.meta?.changes === 0) {
                return jsonResponse({ error: '歌曲不存在' }, 404);
            }

            ctx.waitUntil(logAuditEvent(env, {
                eventType: 'delete', actorAdminId: isAdmin.sub, actorUsername: isAdmin.username,
                targetTable: 'songs', targetId: Number(id),
                summary: { title: target?.title }, request,
            }));

            return jsonResponse({ success: true, message: '已删除' });
        } catch (error) {
            console.error('❌ DELETE /api/admin/songs 错误:', error.message);
            return jsonResponse({ error: error.message }, 500);
        }
    }

    // ===== 上传图片到 R2 =====
    if (path === '/api/upload' && method === 'POST') {
        const userId = await getAuthenticatedUserId(request, env);
        if (!userId) {
            return jsonResponse({ error: '请先登录' }, 401);
        }

        try {
            const formData = await request.formData();
            const file = formData.get('file');
            if (!file) {
                return jsonResponse({ error: '没有上传文件' }, 400);
            }

            if (file.size > 15 * 1024 * 1024) {
                return jsonResponse({ error: '文件大小不能超过15MB' }, 400);
            }

            const validTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
            if (!validTypes.includes(file.type)) {
                return jsonResponse({ error: '只支持 JPEG、PNG、WEBP、GIF 格式' }, 400);
            }

            const ext = file.name.split('.').pop() || 'jpg';
            const timestamp = Date.now();
            const uniqueId = crypto.randomUUID();
            const key = `uploads/${userId}/${timestamp}_${uniqueId}.${ext}`;

            await env.R2_BUCKET.put(key, file.stream(), {
                httpMetadata: { contentType: file.type },
            });

            const url = `https://stardustinfinity.top/${key}`;

            return jsonResponse({ success: true, url, key });

        } catch (error) {
            console.error('❌ /api/upload 错误:', error.message);
            return jsonResponse({ error: error.message }, 500);
        }
    }

    // ===== 上传附件到 R2（用 SHA-256 命名）=====
    if (path === '/api/upload-attachment' && method === 'POST') {
        const userId = await getAuthenticatedUserId(request, env);
        if (!userId) {
            return jsonResponse({ error: '请先登录' }, 401);
        }

        try {
            const formData = await request.formData();
            const file = formData.get('file');
            if (!file) {
                return jsonResponse({ error: '没有上传文件' }, 400);
            }

            if (file.size > ATTACHMENT_MAX_SIZE) {
                return jsonResponse({ error: `文件大小不能超过 ${ATTACHMENT_LIMIT_TEXT}` }, 400);
            }

            const originalName = file.name || 'attachment';
            const ext = originalName.split('.').pop()?.toLowerCase() || '';
            if (!ATTACHMENT_ALLOWED_EXT.has(ext)) {
                return jsonResponse({ error: `不允许上传 .${ext} 类型的文件` }, 400);
            }

            const arrayBuffer = await file.arrayBuffer();
            const hashBuffer = await crypto.subtle.digest('SHA-256', arrayBuffer);
            const hashArray = new Uint8Array(hashBuffer);
            const hashHex = Array.from(hashArray).map((b) => b.toString(16).padStart(2, '0')).join('');

            const key = `attachments/${hashHex}.${ext}`;

            const existing = await env.R2_BUCKET.head(key);
            if (!existing) {
                await env.R2_BUCKET.put(key, arrayBuffer, {
                    httpMetadata: {
                        contentType: file.type || 'application/octet-stream',
                        contentDisposition: `attachment; filename="${encodeURIComponent(originalName)}"`,
                    },
                });
            }

            const url = `https://stardustinfinity.top/${key}`;

            return jsonResponse({
                success: true,
                url,
                key,
                hash: hashHex,
                name: originalName,
                size: file.size,
            });

        } catch (error) {
            console.error('❌ /api/upload-attachment 错误:', error.message);
            return jsonResponse({ error: error.message }, 500);
        }
    }

    // ===== 大文件分片上传（R2 multipart）=====
    // 单请求体远小于 Worker 上限，500MB 以内的附件都能传
    if (path === '/api/upload-attachment/multipart/init' && method === 'POST') {
        const userId = await getAuthenticatedUserId(request, env);
        if (!userId) {
            return jsonResponse({ error: '请先登录' }, 401);
        }

        try {
            const body = await request.json();
            const originalName = String(body?.name || '').slice(0, 200);
            const size = Number(body?.size);
            const ext = originalName.split('.').pop()?.toLowerCase() || '';

            if (!ATTACHMENT_ALLOWED_EXT.has(ext)) {
                return jsonResponse({ error: `不允许上传 .${ext} 类型的文件` }, 400);
            }
            if (!Number.isFinite(size) || size <= 0) {
                return jsonResponse({ error: '文件大小不合法' }, 400);
            }
            if (size > ATTACHMENT_MAX_SIZE) {
                return jsonResponse({ error: `文件大小不能超过 ${ATTACHMENT_LIMIT_TEXT}` }, 400);
            }

            const key = `attachments/${crypto.randomUUID()}.${ext}`;
            const upload = await env.R2_BUCKET.createMultipartUpload(key, {
                httpMetadata: {
                    contentType: String(body?.type || 'application/octet-stream').slice(0, 100),
                    contentDisposition: `attachment; filename="${encodeURIComponent(originalName)}"`,
                },
            });

            return jsonResponse({
                success: true,
                key,
                uploadId: upload.uploadId,
                partSize: ATTACHMENT_PART_SIZE,
                name: originalName,
            });
        } catch (error) {
            console.error('❌ multipart init 错误:', error.message);
            return jsonResponse({ error: error.message }, 500);
        }
    }

    if (path === '/api/upload-attachment/multipart/part' && method === 'PUT') {
        const userId = await getAuthenticatedUserId(request, env);
        if (!userId) {
            return jsonResponse({ error: '请先登录' }, 401);
        }

        try {
            const key = url.searchParams.get('key') || '';
            const uploadId = url.searchParams.get('uploadId') || '';
            const partNumber = Number(url.searchParams.get('partNumber'));

            if (!key.startsWith('attachments/') || key.includes('..') || !uploadId) {
                return jsonResponse({ error: '分片参数不合法' }, 400);
            }
            if (!Number.isInteger(partNumber) || partNumber < 1 || partNumber > ATTACHMENT_MAX_PARTS) {
                return jsonResponse({ error: '分片序号不合法' }, 400);
            }

            const buffer = await request.arrayBuffer();
            if (buffer.byteLength === 0) {
                return jsonResponse({ error: '分片内容为空' }, 400);
            }
            if (buffer.byteLength > ATTACHMENT_PART_SIZE) {
                return jsonResponse({ error: '分片过大' }, 413);
            }

            const upload = env.R2_BUCKET.resumeMultipartUpload(key, uploadId);
            const part = await upload.uploadPart(partNumber, buffer);

            return jsonResponse({ success: true, partNumber: part.partNumber, etag: part.etag });
        } catch (error) {
            console.error('❌ multipart part 错误:', error.message);
            return jsonResponse({ error: error.message }, 500);
        }
    }

    if (path === '/api/upload-attachment/multipart/complete' && method === 'POST') {
        const userId = await getAuthenticatedUserId(request, env);
        if (!userId) {
            return jsonResponse({ error: '请先登录' }, 401);
        }

        try {
            const body = await request.json();
            const key = String(body?.key || '');
            const uploadId = String(body?.uploadId || '');
            const parts = Array.isArray(body?.parts) ? body.parts : [];

            if (!key.startsWith('attachments/') || key.includes('..') || !uploadId) {
                return jsonResponse({ error: '参数不合法' }, 400);
            }
            if (parts.length === 0 || parts.length > ATTACHMENT_MAX_PARTS) {
                return jsonResponse({ error: '分片数量不合法' }, 400);
            }

            const uploadedParts = parts
                .map((p) => ({ partNumber: Number(p?.partNumber), etag: String(p?.etag || '') }))
                .filter((p) => Number.isInteger(p.partNumber) && p.partNumber > 0 && p.etag)
                .sort((a, b) => a.partNumber - b.partNumber);

            if (uploadedParts.length !== parts.length) {
                return jsonResponse({ error: '分片信息不完整' }, 400);
            }

            const upload = env.R2_BUCKET.resumeMultipartUpload(key, uploadId);
            const object = await upload.complete(uploadedParts);

            const originalName = String(body?.name || key.split('/').pop() || 'attachment').slice(0, 200);
            const declaredSize = Number(body?.size);

            return jsonResponse({
                success: true,
                url: `https://stardustinfinity.top/${key}`,
                key,
                hash: null,
                name: originalName,
                size: object?.size ?? (Number.isFinite(declaredSize) ? declaredSize : null),
            });
        } catch (error) {
            console.error('❌ multipart complete 错误:', error.message);
            return jsonResponse({ error: error.message }, 500);
        }
    }

    if (path === '/api/upload-attachment/multipart/abort' && method === 'POST') {
        const userId = await getAuthenticatedUserId(request, env);
        if (!userId) {
            return jsonResponse({ error: '请先登录' }, 401);
        }

        try {
            const body = await request.json();
            const key = String(body?.key || '');
            const uploadId = String(body?.uploadId || '');
            if (!key.startsWith('attachments/') || !uploadId) {
                return jsonResponse({ error: '参数不合法' }, 400);
            }
            const upload = env.R2_BUCKET.resumeMultipartUpload(key, uploadId);
            await upload.abort();
            return jsonResponse({ success: true });
        } catch (error) {
            console.error('❌ multipart abort 错误:', error.message);
            return jsonResponse({ error: error.message }, 500);
        }
    }

    // ===== R2 直传：签发预签名 PUT 地址 =====
    // 浏览器直接 PUT 到 R2，字节不经过 Worker，单文件可到 500MB
    if (path === '/api/upload-attachment/presign' && method === 'POST') {
        const userId = await getAuthenticatedUserId(request, env);
        if (!userId) {
            return jsonResponse({ error: '请先登录' }, 401);
        }

        try {
            const body = await request.json();
            const originalName = String(body?.name || '').slice(0, 200);
            const size = Number(body?.size);
            const ext = originalName.split('.').pop()?.toLowerCase() || '';

            if (!ATTACHMENT_ALLOWED_EXT.has(ext)) {
                return jsonResponse({ error: `不允许上传 .${ext} 类型的文件` }, 400);
            }
            if (!Number.isFinite(size) || size <= 0) {
                return jsonResponse({ error: '文件大小不合法' }, 400);
            }
            if (size > ATTACHMENT_MAX_SIZE) {
                return jsonResponse({ error: `文件大小不能超过 ${ATTACHMENT_LIMIT_TEXT}` }, 400);
            }

            const accountId = env.R2_ACCOUNT_ID;
            const accessKeyId = env.R2_ACCESS_KEY_ID;
            const secretAccessKey = env.R2_SECRET_ACCESS_KEY;
            const bucket = env.R2_BUCKET_NAME || 'stardust-uploads';

            if (!accountId || !accessKeyId || !secretAccessKey) {
                // 没有配置直传凭据：告诉前端回退到分片上传
                return jsonResponse({
                    error: '未配置 R2 直传凭据（R2_ACCESS_KEY_ID / R2_SECRET_ACCESS_KEY）',
                    code: 'DIRECT_UPLOAD_DISABLED',
                }, 501);
            }

            const key = `attachments/${crypto.randomUUID()}.${ext}`;
            const uploadUrl = await presignR2Put({
                accountId, accessKeyId, secretAccessKey, bucket, key,
            });

            return jsonResponse({
                success: true,
                mode: 'direct',
                uploadUrl,
                key,
                name: originalName,
                size,
                expiresIn: R2_PRESIGN_EXPIRES,
            });
        } catch (error) {
            console.error('❌ presign 错误:', error.message);
            return jsonResponse({ error: error.message }, 500);
        }
    }

    // ===== R2 直传：确认对象已落桶 =====
    if (path === '/api/upload-attachment/confirm' && method === 'POST') {
        const userId = await getAuthenticatedUserId(request, env);
        if (!userId) {
            return jsonResponse({ error: '请先登录' }, 401);
        }

        try {
            const body = await request.json();
            const key = String(body?.key || '');
            if (!key.startsWith('attachments/') || key.includes('..')) {
                return jsonResponse({ error: '参数不合法' }, 400);
            }

            const ext = key.split('.').pop()?.toLowerCase() || '';
            if (!ATTACHMENT_ALLOWED_EXT.has(ext)) {
                return jsonResponse({ error: `不允许上传 .${ext} 类型的文件` }, 400);
            }

            const head = await env.R2_BUCKET.head(key);
            if (!head) {
                return jsonResponse({ error: '文件还没传完' }, 409);
            }
            if (head.size > ATTACHMENT_MAX_SIZE) {
                await env.R2_BUCKET.delete(key);
                return jsonResponse({ error: `文件大小不能超过 ${ATTACHMENT_LIMIT_TEXT}` }, 400);
            }

            const name = String(body?.name || key.split('/').pop()).slice(0, 200);

            return jsonResponse({
                success: true,
                mode: 'direct',
                url: `https://stardustinfinity.top/${key}`,
                key,
                hash: null,
                name,
                size: head.size,
            });
        } catch (error) {
            console.error('❌ confirm 错误:', error.message);
            return jsonResponse({ error: error.message }, 500);
        }
    }

    // ===== GET /api/fanart/:id =====
    if (path.startsWith('/api/fanart/') && method === 'GET') {
        const id = path.split('/').pop();
        if (!id || isNaN(id)) {
            return jsonResponse({ error: 'Invalid ID' }, 400);
        }
        try {
            const stmt = env.DB.prepare('SELECT * FROM fanart WHERE id = ? AND status = "published"');
            const result = await stmt.bind(id).first();
            if (!result) {
                return jsonResponse({ error: 'Not Found' }, 404);
            }
            return jsonResponse(result);
        } catch (error) {
            console.error('❌ /api/fanart/:id 错误:', error.message);
            return jsonResponse({ error: error.message }, 500);
        }
    }

    // ===== 公开用户资料 =====
    const publicUserMatch = path.match(/^\/api\/users\/(\d+)$/);
    if (publicUserMatch && method === 'GET') {
        const id = publicUserMatch[1];
        try {
            const user = await env.DB.prepare(`
                SELECT id, username, COALESCE(display_name, username) AS display_name,
                       avatar_url, bio, created_at
                FROM users
                WHERE id = ? AND deleted_at IS NULL
            `).bind(id).first();

            if (!user) return jsonResponse({ error: '用户不存在或已注销' }, 404);

            const [fanart, shop] = await Promise.all([
                env.DB.prepare(`
                    SELECT id, title, image_url, type, created_at
                    FROM fanart
                    WHERE user_id = ? AND status = 'published'
                    ORDER BY created_at DESC
                `).bind(id).all(),
                env.DB.prepare(`
                    SELECT id, title, image_url, price, created_at
                    FROM shop
                    WHERE user_id = ? AND status IN ('waiting', 'shipped')
                    ORDER BY created_at DESC
                `).bind(id).all(),
            ]);

            return jsonResponse({
                ...user,
                fanart: fanart.results || [],
                shop: shop.results || [],
            });
        } catch (error) {
            console.error('❌ GET /api/users/:id 错误:', error.message);
            return jsonResponse({ error: error.message }, 500);
        }
    }


    // ===== 用户信息 API =====
    if (path === '/api/user/profile' && method === 'GET') {
        const userId = await getAuthenticatedUserId(request, env);
        if (!userId) {
            return jsonResponse({ error: '未登录' }, 401);
        }

        try {
            const user = await env.DB.prepare(`
                SELECT id, username, COALESCE(display_name, username) AS display_name, email, avatar_url, bio, created_at,
                    (SELECT COUNT(*) FROM fanart WHERE user_id = users.id) as fanart_count,
                    (SELECT COUNT(*) FROM shop WHERE user_id = users.id) as shop_count
                FROM users WHERE id = ?
            `).bind(userId).first();

            if (!user) {
                return jsonResponse({ error: '用户不存在' }, 404);
            }

            const usernameChangeRequired = !isValidUsername(user.username);
            return jsonResponse({
                ...user,
                username_change_required: usernameChangeRequired,
                suggested_username: usernameChangeRequired ? await suggestAvailableUsername(env.DB, user) : null,
            });
        } catch (error) {
            console.error('❌ GET /api/user/profile 错误:', error.message);
            return jsonResponse({ error: error.message }, 500);
        }
    }

    if (path === '/api/user/username' && method === 'PUT') {
        const userId = await getAuthenticatedUserId(request, env);
        if (!userId) return jsonResponse({ error: '未登录' }, 401);

        const body = await request.json().catch(() => ({}));
        const username = normalizeUsername(body?.username);
        if (!isValidUsername(username)) {
            return jsonResponse({ error: '用户名需为 2–32 位字母、数字、下划线或短横线' }, 400);
        }

        try {
            const user = await env.DB.prepare('SELECT id, username, display_name FROM users WHERE id = ?').bind(userId).first();
            if (!user) return jsonResponse({ error: '用户不存在' }, 404);
            if (username.toLowerCase() === String(user.username).toLowerCase()) {
                return jsonResponse({ error: '新用户名与当前用户名相同' }, 400);
            }

            const existing = await env.DB.prepare('SELECT id FROM users WHERE username = ? COLLATE NOCASE AND id <> ?').bind(username, userId).first();
            if (existing) return jsonResponse({ error: '用户名已被占用' }, 409);

            const result = await env.DB.prepare(`
                UPDATE users
                SET username = ?, display_name = CASE WHEN display_name IS NULL AND instr(username, '@') = 0 THEN username ELSE display_name END,
                    updated_at = CURRENT_TIMESTAMP
                WHERE id = ? AND username = ?
            `).bind(username, userId, user.username).run();
            if (result.meta?.changes !== 1) return jsonResponse({ error: '用户名已发生变化，请刷新后重试' }, 409);

            return jsonResponse({ success: true, username, display_name: user.display_name || (user.username.includes('@') ? username : user.username) });
        } catch (error) {
            if (String(error?.message).includes('UNIQUE constraint failed')) return jsonResponse({ error: '用户名已被占用' }, 409);
            console.error('❌ PUT /api/user/username 错误:', error.message);
            return jsonResponse({ error: '修改用户名失败' }, 500);
        }
    }

    // ===== 更新用户资料（当前仅头像）=====
    if (path === '/api/user/profile' && method === 'PUT') {
        const userId = await getAuthenticatedUserId(request, env);
        if (!userId) {
            return jsonResponse({ error: '未登录' }, 401);
        }

        try {
            const body = await request.json().catch(() => ({}));
            const updates = {};
            const errors = [];

            // 头像：null / 空串表示清除
            if ('avatar_url' in body) {
                const raw = body.avatar_url;
                if (raw === null || raw === undefined || (typeof raw === 'string' && !raw.trim())) {
                    updates.avatar_url = null;
                } else if (typeof raw !== 'string') {
                    errors.push('头像地址格式不正确');
                } else {
                    const trimmed = raw.trim();
                    const isOwnUpload = trimmed.startsWith('/uploads/');
                    const isHttps = /^https:\/\/[^\s]+$/i.test(trimmed);
                    if (trimmed.length > 500) errors.push('头像地址过长');
                    else if (!isOwnUpload && !isHttps) errors.push('头像地址必须以 /uploads/ 或 https:// 开头');
                    else updates.avatar_url = trimmed;
                }
            }

            // 简介：null / 空串表示清空，上限 200 字
            if ('bio' in body) {
                const raw = body.bio;
                if (raw === null || raw === undefined) {
                    updates.bio = null;
                } else if (typeof raw !== 'string') {
                    errors.push('简介格式不正确');
                } else {
                    const trimmed = raw.trim();
                    if (trimmed.length > 200) errors.push('简介不能超过 200 字');
                    else updates.bio = trimmed || null;
                }
            }

            // 显示名：null / 空串表示回退为用户名
            if ('display_name' in body) {
                const raw = body.display_name;
                if (raw === null || raw === undefined || (typeof raw === 'string' && !raw.trim())) {
                    updates.display_name = null;
                } else if (typeof raw !== 'string') {
                    errors.push('显示名格式不正确');
                } else {
                    const normalized = normalizeDisplayName(raw);
                    if (!normalized || !isValidDisplayName(normalized)) {
                        errors.push('显示名需为 1–32 个字符且不能包含控制字符');
                    } else {
                        updates.display_name = normalized;
                    }
                }
            }

            if (errors.length > 0) return jsonResponse({ error: errors[0] }, 400);
            if (Object.keys(updates).length === 0) return jsonResponse({ error: '没有需要更新的内容' }, 400);

            const assignments = Object.keys(updates).map(key => `${key} = ?`).join(', ');
            await env.DB.prepare(
                `UPDATE users SET ${assignments}, updated_at = CURRENT_TIMESTAMP WHERE id = ?`
            ).bind(...Object.values(updates), userId).run();

            const saved = await env.DB.prepare(
                'SELECT avatar_url, bio, COALESCE(display_name, username) AS display_name FROM users WHERE id = ?'
            ).bind(userId).first();

            return jsonResponse({ success: true, ...saved });
        } catch (error) {
            console.error('❌ PUT /api/user/profile 错误:', error.message);
            return jsonResponse({ error: error.message }, 500);
        }
    }

    // ===== 修改密码 =====
    if (path === '/api/user/password' && method === 'PUT') {
        const userId = await getAuthenticatedUserId(request, env);
        if (!userId) return jsonResponse({ error: '未登录' }, 401);

        const body = await request.json().catch(() => ({}));
        const currentPassword = typeof body?.current_password === 'string' ? body.current_password : '';
        const newPassword = typeof body?.new_password === 'string' ? body.new_password : '';

        if (!currentPassword || !newPassword) {
            return jsonResponse({ error: '当前密码和新密码都不能为空' }, 400);
        }
        if (newPassword.length < 6) {
            return jsonResponse({ error: '新密码至少 6 位' }, 400);
        }
        if (newPassword.length > 128) {
            return jsonResponse({ error: '新密码过长' }, 400);
        }
        if (newPassword === currentPassword) {
            return jsonResponse({ error: '新密码不能与当前密码相同' }, 400);
        }

        try {
            const user = await env.DB.prepare('SELECT id, password_hash FROM users WHERE id = ?').bind(userId).first();
            if (!user) return jsonResponse({ error: '用户不存在' }, 404);

            const passwordOk = await verifyPassword(currentPassword, user.password_hash);
            if (!passwordOk) return jsonResponse({ error: '当前密码不正确' }, 401);

            const passwordHash = await hashPassword(newPassword);
            await env.DB.prepare(
                'UPDATE users SET password_hash = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?'
            ).bind(passwordHash, userId).run();

            return jsonResponse({ success: true, message: '密码已更新' });
        } catch (error) {
            console.error('❌ PUT /api/user/password 错误:', error.message);
            return jsonResponse({ error: '修改密码失败' }, 500);
        }
    }

    // ===== 注销账号（匿名化：释放用户名与邮箱，保留投稿/评论的归属占位）=====
    if (path === '/api/user/account' && method === 'DELETE') {
        const userId = await getAuthenticatedUserId(request, env);
        if (!userId) return jsonResponse({ error: '未登录' }, 401);

        const body = await request.json().catch(() => ({}));
        const password = typeof body?.password === 'string' ? body.password : '';
        if (!password) {
            return jsonResponse({ error: '请输入当前密码以确认注销' }, 400);
        }

        try {
            const user = await env.DB.prepare(
                'SELECT id, password_hash, deleted_at FROM users WHERE id = ?'
            ).bind(userId).first();
            if (!user) return jsonResponse({ error: '用户不存在' }, 404);
            if (user.deleted_at) return jsonResponse({ error: '账号已注销' }, 409);

            const passwordOk = await verifyPassword(password, user.password_hash);
            if (!passwordOk) return jsonResponse({ error: '密码不正确' }, 401);

            await env.DB.prepare(`
                UPDATE users
                SET username = ?, display_name = ?, email = ?, password_hash = ?,
                    avatar_url = NULL, bio = NULL, deleted_at = CURRENT_TIMESTAMP,
                    updated_at = CURRENT_TIMESTAMP
                WHERE id = ?
            `).bind(
                `deleted_${userId}`,
                '已注销用户',
                `deleted_${userId}@deleted.invalid`,
                'deleted',
                userId
            ).run();

            return jsonResponse({ success: true, message: '账号已注销' });
        } catch (error) {
            console.error('❌ DELETE /api/user/account 错误:', error.message);
            return jsonResponse({ error: '注销失败' }, 500);
        }
    }

    // ===== 用户同人投稿列表 =====
    if (path === '/api/user/fanart' && method === 'GET') {
        const userId = await getAuthenticatedUserId(request, env);
        if (!userId) {
            return jsonResponse({ error: '未登录' }, 401);
        }

        try {
            const result = await env.DB.prepare(`
                SELECT id, title, author, description, image_url, bilibili_url, source_url, type, status, created_at ,  attachments
                FROM fanart WHERE user_id = ? ORDER BY created_at DESC
            `).bind(userId).all();

            return jsonResponse(result.results || []);
        } catch (error) {
            console.error('❌ GET /api/user/fanart 错误:', error.message);
            return jsonResponse({ error: error.message }, 500);
        }
    }

    // ===== 用户量贩投稿列表 =====
    if (path === '/api/user/shop' && method === 'GET') {
        const userId = await getAuthenticatedUserId(request, env);
        if (!userId) {
            return jsonResponse({ error: '未登录' }, 401);
        }

        try {
            const result = await env.DB.prepare(`
                SELECT id, title, description, price, image_url, bilibili_url, xianyu_url, other_url, status, ship_time, created_at
                FROM shop WHERE user_id = ? ORDER BY created_at DESC
            `).bind(userId).all();

            return jsonResponse(result.results || []);
        } catch (error) {
            console.error('❌ GET /api/user/shop 错误:', error.message);
            return jsonResponse({ error: error.message }, 500);
        }
    }

    // ===== GET /api/shop/:id =====
    if (path.startsWith('/api/shop/') && method === 'GET') {
        const id = path.split('/').pop();
        if (!id || isNaN(id)) {
            return jsonResponse({ error: 'Invalid ID' }, 400);
        }
        try {
            const stmt = env.DB.prepare("SELECT * FROM shop WHERE id = ? AND status IN ('waiting', 'shipped')");
            const result = await stmt.bind(id).first();
            if (!result) {
                return jsonResponse({ error: 'Not Found' }, 404);
            }
            return jsonResponse(result);
        } catch (error) {
            console.error('❌ /api/shop/:id 错误:', error.message);
            return jsonResponse({ error: error.message }, 500);
        }
    }

    // ===== 同人投稿（新版：使用 images 数组） =====
    if (path === '/api/contributions/fanart' && method === 'POST') {
        const payload = await getAuthenticatedUser(request, env, 'user');
        let userId = payload?.sub || null;
        let username = null;
        if (payload) username = payload.display_name;
        if (!userId) {
            return jsonResponse({ error: '请先登录' }, 401);
        }

        try {
            const body = await request.json();
                        const { title, author, description, type, bilibili_url, source_url, images, tags, attachments } = body;
            const tagsJson = Array.isArray(tags) && tags.length > 0 ? JSON.stringify(tags.slice(0, 10)) : null;


            // 附件校验
            let attachmentsJson = null;
            if (Array.isArray(attachments) && attachments.length > 0) {
                if (attachments.length > ATTACHMENT_MAX_COUNT) {
                    return jsonResponse({ error: `最多只能上传 ${ATTACHMENT_MAX_COUNT} 个附件` }, 400);
                }
                const cleaned = [];
                for (const a of attachments) {
                    if (!a || typeof a !== 'object') continue;
                    const { url, name, size } = a;
                    if (typeof url !== 'string' || !url.startsWith('https://stardustinfinity.top/attachments/')) {
                        return jsonResponse({ error: '附件地址不合法' }, 400);
                    }
                    const ext = String(name || '').split('.').pop()?.toLowerCase() || '';
                    if (!ATTACHMENT_ALLOWED_EXT.has(ext)) {
                        return jsonResponse({ error: `不允许上传 .${ext} 类型的文件` }, 400);
                    }
                    if (typeof size !== 'number' || size > ATTACHMENT_MAX_SIZE) {
                        return jsonResponse({ error: '附件大小超限' }, 400);
                    }
                    cleaned.push({
                        url,
                        name: String(name).slice(0, 200),
                        size,
                    });
                }
                attachmentsJson = cleaned.length > 0 ? JSON.stringify(cleaned) : null;
            }

            if (!images || images.length === 0) {
                return jsonResponse({ error: '图片不能为空' }, 400);
            }

            const finalTitle = (title || '').trim() || '无题';
            const finalAuthor = (author || '').trim() || username || '匿名';
            const firstImage = images[0] || '';
            const imagesJson = JSON.stringify(images);
            const stmt = env.DB.prepare(`
                 INSERT INTO fanart (title, author, description, image_url, bilibili_url, source_url, type, status, images, user_id, tags, attachments)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `);
            const result = await stmt.bind(
                finalTitle,
                finalAuthor,
                description || null,
                firstImage,
                bilibili_url || null,
                source_url || null,
                type || 'illust',
                'pending',
                imagesJson,
                userId,
                tagsJson,
                attachmentsJson
            ).run();

            return jsonResponse({
                success: true,
                id: result.meta?.last_row_id || null,
                message: '投稿成功，等待审核'
            }, 201);

        } catch (error) {
            console.error('❌ /api/contributions/fanart 错误:', error.message);
            return jsonResponse({ error: error.message }, 500);
        }
    }

    // ===== 量贩投稿 =====
    if (path === '/api/contributions/shop' && method === 'POST') {
        const userId = await getAuthenticatedUserId(request, env);
        if (!userId) {
            return jsonResponse({ error: '请先登录' }, 401);
        }

        try {
            const body = await request.json();
            const { title, description, price, xianyu_url, other_url, bilibili_url, ship_time, images } = body;

            if (!title || !title.trim()) {
                return jsonResponse({ error: '标题不能为空' }, 400);
            }
            if (!price || !price.trim()) {
                return jsonResponse({ error: '价格不能为空' }, 400);
            }
            if (!images || images.length === 0) {
                return jsonResponse({ error: '图片不能为空' }, 400);
            }
            const hasXianyu = !!(xianyu_url && xianyu_url.trim());
            const hasOther = !!(other_url && other_url.trim());
            if (!hasXianyu && !hasOther) {
                return jsonResponse({ error: '闲鱼链接和其他平台购买链接至少填写一个' }, 400);
            }
            if (!ship_time) {
                return jsonResponse({ error: '发车时间不能为空' }, 400);
            }

            const firstImage = images[0] || '';
            const imagesJson = JSON.stringify(images);

            const stmt = env.DB.prepare(`
                INSERT INTO shop (title, description, price, image_url, xianyu_url, other_url, bilibili_url, status, ship_time, images, user_id)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `);
            const result = await stmt.bind(
                title.trim(),
                description || null,
                price.trim(),
                firstImage,
                hasXianyu ? xianyu_url.trim() : null,
                hasOther ? other_url.trim() : null,
                bilibili_url || null,
                'pending',
                ship_time,
                imagesJson,
                userId
            ).run();

            return jsonResponse({
                success: true,
                id: result.meta?.last_row_id || null,
                message: '投稿成功，等待审核'
            }, 201);

        } catch (error) {
            console.error('❌ /api/contributions/shop 错误:', error.message);
            return jsonResponse({ error: error.message }, 500);
        }
    }

    // ===== 公开访问 R2 对象（图片 / 附件）=====
    if ((path.startsWith('/uploads/') || path.startsWith('/attachments/')) && (method === 'GET' || method === 'HEAD')) {
        try {
            const key = path.slice(1);
            const isAttachment = path.startsWith('/attachments/');
            const defaultType = isAttachment ? 'application/octet-stream' : 'image/jpeg';
            const range = parseRangeHeader(request.headers.get('Range'));

            // 普通 GET（绝大多数图片请求）：一次 get 就够，保持原有开销
            if (!range && method === 'GET') {
                const object = await env.R2_BUCKET.get(key);
                if (!object || !object.body) {
                    return new Response('Not Found', { status: 404 });
                }
                const headers = new Headers({
                    'Content-Type': object.httpMetadata?.contentType || defaultType,
                    'Accept-Ranges': 'bytes',
                    'Cache-Control': isAttachment
                        ? 'public, max-age=31536000, immutable'
                        : 'public, max-age=86400',
                });
                if (object.httpMetadata?.contentDisposition) {
                    headers.set('Content-Disposition', object.httpMetadata.contentDisposition);
                }
                return new Response(object.body, { status: 200, headers });
            }

            const head = await env.R2_BUCKET.head(key);
            if (!head) {
                return new Response('Not Found', { status: 404 });
            }

            const headers = new Headers({
                'Content-Type': head.httpMetadata?.contentType || defaultType,
                'Accept-Ranges': 'bytes',
                'Cache-Control': isAttachment
                    ? 'public, max-age=31536000, immutable'
                    : 'public, max-age=86400',
                'ETag': head.httpEtag,
                'Last-Modified': head.uploaded.toUTCString(),
            });
            if (head.httpMetadata?.contentDisposition) {
                headers.set('Content-Disposition', head.httpMetadata.contentDisposition);
            }

            // Range 请求：视频等大文件可拖动进度
            if (range) {
                const start = range.offset !== undefined
                    ? range.offset
                    : Math.max(0, head.size - (range.suffix || 0));
                const maxLength = head.size - start;
                const length = range.length !== undefined
                    ? Math.min(range.length, maxLength)
                    : maxLength;

                if (start >= head.size || start < 0 || length <= 0) {
                    return new Response('Range Not Satisfiable', {
                        status: 416,
                        headers: { 'Content-Range': `bytes */${head.size}` },
                    });
                }

                headers.set('Content-Range', `bytes ${start}-${start + length - 1}/${head.size}`);
                if (method === 'HEAD') {
                    headers.set('Content-Length', String(length));
                    return new Response(null, { status: 206, headers });
                }

                const object = await env.R2_BUCKET.get(key, { range: { offset: start, length } });
                if (!object || !object.body) {
                    return new Response('Not Found', { status: 404 });
                }
                return new Response(object.body, { status: 206, headers });
            }

            headers.set('Content-Length', String(head.size));
            return new Response(null, { status: 200, headers });
        } catch (error) {
            console.error('❌ R2 对象读取失败:', error.message);
            return new Response('Error', { status: 500 });
        }
    }

    // ===== 获取待审核列表 =====
    if (path === '/api/admin/pending' && method === 'GET') {
        const denied = requirePermission(isAdmin, 'review');
        if (denied) return denied;
        try {
            const fanartStmt = env.DB.prepare(`
                SELECT id, 'fanart' as type, title, author, description, image_url, created_at
                FROM fanart WHERE status = 'pending'
            `);
            const shopStmt = env.DB.prepare(`
                SELECT id, 'shop' as type, title, '' as author, description, image_url, created_at
                FROM shop WHERE status = 'pending'
            `);
            const fanart = await fanartStmt.all();
            const shop = await shopStmt.all();
            const results = [...(fanart.results || []), ...(shop.results || [])];
            results.sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
            return jsonResponse(results);
        } catch (error) {
            console.error('❌ /api/admin/pending 错误:', error.message);
            return jsonResponse({ error: error.message }, 500);
        }
    }

    // ===== 审核通过 =====
    const approveMatch = path.match(/^\/api\/admin\/pending\/(fanart|shop)\/(\d+)$/);
    if (approveMatch && method === 'PUT') {
        const denied = requirePermission(isAdmin, 'review');
        if (denied) return denied;
        try {
            const type = approveMatch[1];
            const id = approveMatch[2];
            const table = type === 'fanart' ? 'fanart' : 'shop';
            const approvedStatus = type === 'fanart' ? 'published' : 'waiting';

            const item = await env.DB.prepare(`
                SELECT t.title, t.user_id, u.email
                FROM ${table} t
                JOIN users u ON t.user_id = u.id
                WHERE t.id = ? AND t.status = 'pending'
            `).bind(id).first();

            if (!item) {
                return jsonResponse({ error: '记录不存在或已处理' }, 404);
            }

            const stmt = env.DB.prepare(`UPDATE ${table} SET status = ? WHERE id = ? AND status = 'pending'`);
            const result = await stmt.bind(approvedStatus, id).run();

            if (result.meta?.changes === 0) {
                return jsonResponse({ error: '记录不存在或已处理' }, 404);
            }

            if (item.email) {
                const title = item.title || '无题';
                await sendEmail(
                    item.email,
                    '✅ 投稿已通过审核',
                    `<p>您的投稿《${title}》已通过审核，现已发布到星尘粉丝站。</p>`,
                    env
                );
            }

            return jsonResponse({ success: true, message: '已通过' });
        } catch (error) {
            console.error('❌ 审核通过错误:', error.message);
            return jsonResponse({ error: error.message }, 500);
        }
    }

    // ===== 审核驳回 =====
    const rejectMatch = path.match(/^\/api\/admin\/pending\/(fanart|shop)\/(\d+)$/);
    if (rejectMatch && method === 'DELETE') {
        const denied = requirePermission(isAdmin, 'review');
        if (denied) return denied;
        try {
            const type = rejectMatch[1];
            const id = rejectMatch[2];
            const table = type === 'fanart' ? 'fanart' : 'shop';

            const item = await env.DB.prepare(`
                SELECT t.title, t.user_id, u.email
                FROM ${table} t
                JOIN users u ON t.user_id = u.id
                WHERE t.id = ? AND t.status = 'pending'
            `).bind(id).first();

            if (!item) {
                return jsonResponse({ error: '记录不存在或已处理' }, 404);
            }

            const body = await request.json().catch(() => ({}));
            const reason = body.reason || '未提供具体理由';

            const stmt = env.DB.prepare(`DELETE FROM ${table} WHERE id = ? AND status = 'pending'`);
            const result = await stmt.bind(id).run();

            if (result.meta?.changes === 0) {
                return jsonResponse({ error: '记录不存在或已处理' }, 404);
            }

            if (item.email) {
                const title = item.title || '不予通过';
                await sendEmail(
                    item.email,
                    '投稿被驳回',
                    `<p>您的投稿《${title}》未通过审核。<br/>理由：${reason}</p>`,
                    env
                );
            }

            return jsonResponse({ success: true, message: '已驳回' });
        } catch (error) {
            console.error('❌ 审核驳回错误:', error.message);
            return jsonResponse({ error: error.message }, 500);
        }
    }

    // ===== 7. 吸尘器日报 API =====
    if (path === '/api/admin/daily' && method === 'GET') {
        const denied = requirePermission(isAdmin, 'daily');
        if (denied) return denied;
        try {
            const stmt = env.DB.prepare('SELECT * FROM daily ORDER BY publish_date DESC, id DESC');
            const result = await stmt.all();
            return jsonResponse(result.results || []);
        } catch (error) {
            console.error('❌ daily GET 错误:', error.message);
            return jsonResponse({ error: error.message }, 500);
        }
    }

    if (path === '/api/admin/daily' && method === 'POST') {
        const denied = requirePermission(isAdmin, 'daily');
        if (denied) return denied;
        try {
            const { title, content, source_url, cover_url, publish_date, status } = await request.json();
            const stmt = env.DB.prepare(`
                INSERT INTO daily (title, content, source_url, cover_url, publish_date, status)
                VALUES (?, ?, ?, ?, ?, ?)
            `);
            const result = await stmt.bind(title, content, source_url || null, cover_url || null, publish_date || null, status || 'published').run();
            ctx.waitUntil(logAuditEvent(env, {
                eventType: 'create', actorAdminId: isAdmin.sub, actorUsername: isAdmin.username,
                targetTable: 'daily', targetId: result.meta?.last_row_id,
                summary: { title, publish_date: publish_date || null, status: status || 'published' },
                request,
            }));
            return jsonResponse({ success: true, id: result.meta?.last_row_id });
        } catch (error) {
            console.error('❌ daily POST 错误:', error.message);
            return jsonResponse({ error: error.message }, 500);
        }
    }

    const dailyPutMatch = path.match(/^\/api\/admin\/daily\/(\d+)$/);
    if (dailyPutMatch && method === 'PUT') {
        const denied = requirePermission(isAdmin, 'daily');
        if (denied) return denied;
        try {
            const id = dailyPutMatch[1];
            const { title, content, source_url, cover_url, publish_date, status } = await request.json();
            const stmt = env.DB.prepare(`
                UPDATE daily SET title = ?, content = ?, source_url = ?, cover_url = ?, publish_date = ?, status = ?, updated_at = CURRENT_TIMESTAMP
                WHERE id = ?
            `);
            await stmt.bind(title, content, source_url || null, cover_url || null, publish_date || null, status || 'published', id).run();
            ctx.waitUntil(logAuditEvent(env, {
                eventType: 'update', actorAdminId: isAdmin.sub, actorUsername: isAdmin.username,
                targetTable: 'daily', targetId: Number(id),
                summary: { title, publish_date: publish_date || null, status: status || 'published' },
                request,
            }));
            return jsonResponse({ success: true });
        } catch (error) {
            console.error('❌ daily PUT 错误:', error.message);
            return jsonResponse({ error: error.message }, 500);
        }
    }

    const dailyDeleteMatch = path.match(/^\/api\/admin\/daily\/(\d+)$/);
    if (dailyDeleteMatch && method === 'DELETE') {
        const denied = requirePermission(isAdmin, 'daily');
        if (denied) return denied;
        try {
            const id = dailyDeleteMatch[1];
            const target = await env.DB.prepare('SELECT title FROM daily WHERE id = ?').bind(id).first();
            const stmt = env.DB.prepare('DELETE FROM daily WHERE id = ?');
            await stmt.bind(id).run();
            ctx.waitUntil(logAuditEvent(env, {
                eventType: 'delete', actorAdminId: isAdmin.sub, actorUsername: isAdmin.username,
                targetTable: 'daily', targetId: Number(id),
                summary: { title: target?.title }, request,
            }));
            return jsonResponse({ success: true });
        } catch (error) {
            console.error('❌ daily DELETE 错误:', error.message);
            return jsonResponse({ error: error.message }, 500);
        }
    }

    // ===== 8. 同人作品 API =====
    if (path === '/api/admin/fanart' && method === 'GET') {
        const denied = requirePermission(isAdmin, 'fanart');
        if (denied) return denied;
        try {
            const stmt = env.DB.prepare('SELECT * FROM fanart ORDER BY created_at DESC');
            const result = await stmt.all();
            return jsonResponse(result.results || []);
        } catch (error) {
            console.error('❌ fanart GET 错误:', error.message);
            return jsonResponse({ error: error.message }, 500);
        }
    }

    if (path === '/api/admin/fanart' && method === 'POST') {
        const denied = requirePermission(isAdmin, 'fanart');
        if (denied) return denied;
        try {
            const { title, author, description, image_url, bilibili_url, source_url, type, status, tags, attachments } = await request.json();
            const tagsJson = Array.isArray(tags) && tags.length > 0 ? JSON.stringify(tags.slice(0, 10)) : null;
            const attachmentsJson = Array.isArray(attachments) && attachments.length > 0
                ? JSON.stringify(attachments.slice(0, ATTACHMENT_MAX_COUNT))
                : null;
            const stmt = env.DB.prepare(`
                INSERT INTO fanart (title, author, description, image_url, bilibili_url, source_url, type, status, tags, attachments)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `);
            const result = await stmt.bind(title, author || null, description || null, image_url || null, bilibili_url || null, source_url || null, type || 'illust', status || 'published', tagsJson, attachmentsJson).run();
            ctx.waitUntil(logAuditEvent(env, {
                eventType: 'create', actorAdminId: isAdmin.sub, actorUsername: isAdmin.username,
                targetTable: 'fanart', targetId: result.meta?.last_row_id,
                summary: { title, author: author || null, type: type || 'illust', status: status || 'published' },
                request,
            }));
            return jsonResponse({ success: true, id: result.meta?.last_row_id });
        } catch (error) {
            console.error('❌ fanart POST 错误:', error.message);
            return jsonResponse({ error: error.message }, 500);
        }
    }

    const fanartPutMatch = path.match(/^\/api\/admin\/fanart\/(\d+)$/);
    if (fanartPutMatch && method === 'PUT') {
        const denied = requirePermission(isAdmin, 'fanart');
        if (denied) return denied;
        try {
            const id = fanartPutMatch[1];
            const { title, author, description, image_url, bilibili_url, source_url, type, status, tags, attachments } = await request.json();
            const tagsJson = Array.isArray(tags) && tags.length > 0 ? JSON.stringify(tags.slice(0, 10)) : null;
            const attachmentsJson = Array.isArray(attachments) && attachments.length > 0
                ? JSON.stringify(attachments.slice(0, ATTACHMENT_MAX_COUNT))
                : null;
            const stmt = env.DB.prepare(`
                UPDATE fanart SET title = ?, author = ?, description = ?, image_url = ?, bilibili_url = ?, source_url = ?, type = ?, status = ?, tags = ?, attachments = ?, updated_at = CURRENT_TIMESTAMP
                WHERE id = ?
            `);
            await stmt.bind(title, author || null, description || null, image_url || null, bilibili_url || null, source_url || null, type || 'illust', status || 'published', tagsJson, attachmentsJson, id).run();
            ctx.waitUntil(logAuditEvent(env, {
                eventType: 'update', actorAdminId: isAdmin.sub, actorUsername: isAdmin.username,
                targetTable: 'fanart', targetId: Number(id),
                summary: { title, author: author || null, type: type || 'illust', status: status || 'published' },
                request,
            }));
            return jsonResponse({ success: true });
        } catch (error) {
            console.error('❌ fanart PUT 错误:', error.message);
            return jsonResponse({ error: error.message }, 500);
        }
    }

    const fanartDeleteMatch = path.match(/^\/api\/admin\/fanart\/(\d+)$/);
    if (fanartDeleteMatch && method === 'DELETE') {
        const denied = requirePermission(isAdmin, 'fanart');
        if (denied) return denied;
        try {
            const id = fanartDeleteMatch[1];
            const target = await env.DB.prepare('SELECT title FROM fanart WHERE id = ?').bind(id).first();
            const stmt = env.DB.prepare('DELETE FROM fanart WHERE id = ?');
            await stmt.bind(id).run();
            ctx.waitUntil(logAuditEvent(env, {
                eventType: 'delete', actorAdminId: isAdmin.sub, actorUsername: isAdmin.username,
                targetTable: 'fanart', targetId: Number(id),
                summary: { title: target?.title }, request,
            }));
            return jsonResponse({ success: true });
        } catch (error) {
            console.error('❌ fanart DELETE 错误:', error.message);
            return jsonResponse({ error: error.message }, 500);
        }
    }

    // ===== 9. 量贩商品 API =====
    if (path === '/api/admin/shop' && method === 'GET') {
        const denied = requirePermission(isAdmin, 'shop');
        if (denied) return denied;
        try {
            const stmt = env.DB.prepare('SELECT * FROM shop ORDER BY created_at DESC');
            const result = await stmt.all();
            return jsonResponse(result.results || []);
        } catch (error) {
            console.error('❌ shop GET 错误:', error.message);
            return jsonResponse({ error: error.message }, 500);
        }
    }

    if (path === '/api/admin/shop' && method === 'POST') {
        const denied = requirePermission(isAdmin, 'shop');
        if (denied) return denied;
        try {
            const { title, description, price, image_url, bilibili_url, xianyu_url, other_url, status } = await request.json();
            const stmt = env.DB.prepare(`
                INSERT INTO shop (title, description, price, image_url, bilibili_url, xianyu_url, other_url, status)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            `);
            const result = await stmt.bind(title, description || null, price || null, image_url || null, bilibili_url || null, xianyu_url || null, other_url || null, status || 'waiting').run();
            ctx.waitUntil(logAuditEvent(env, {
                eventType: 'create', actorAdminId: isAdmin.sub, actorUsername: isAdmin.username,
                targetTable: 'shop', targetId: result.meta?.last_row_id,
                summary: { title, price: price || null, status: status || 'waiting' },
                request,
            }));
            return jsonResponse({ success: true, id: result.meta?.last_row_id });
        } catch (error) {
            console.error('❌ shop POST 错误:', error.message);
            return jsonResponse({ error: error.message }, 500);
        }
    }

    const shopPutMatch = path.match(/^\/api\/admin\/shop\/(\d+)$/);
    if (shopPutMatch && method === 'PUT') {
        const denied = requirePermission(isAdmin, 'shop');
        if (denied) return denied;
        try {
            const id = shopPutMatch[1];
            const { title, description, price, image_url, bilibili_url, xianyu_url, other_url, status } = await request.json();
            const stmt = env.DB.prepare(`
                UPDATE shop SET title = ?, description = ?, price = ?, image_url = ?, bilibili_url = ?, xianyu_url = ?, other_url = ?, status = ?, updated_at = CURRENT_TIMESTAMP
                WHERE id = ?
            `);
            await stmt.bind(title, description || null, price || null, image_url || null, bilibili_url || null, xianyu_url || null, other_url || null, status || 'waiting', id).run();
            ctx.waitUntil(logAuditEvent(env, {
                eventType: 'update', actorAdminId: isAdmin.sub, actorUsername: isAdmin.username,
                targetTable: 'shop', targetId: Number(id),
                summary: { title, price: price || null, status: status || 'waiting' },
                request,
            }));
            return jsonResponse({ success: true });
        } catch (error) {
            console.error('❌ shop PUT 错误:', error.message);
            return jsonResponse({ error: error.message }, 500);
        }
    }

    // ============================================================
    // 评论 API
    // ============================================================

    if (path === '/api/comments' && method === 'GET') {
        try {
            const targetType = url.searchParams.get('target_type');
            const targetId = parseInt(url.searchParams.get('target_id') || '0');
            if (!targetType || !targetId) {
                return jsonResponse({ error: '缺少 target_type 或 target_id' }, 400);
            }

            const stmt = env.DB.prepare(`
                SELECT c.id, c.user_id, c.parent_id, c.content, c.created_at,
                       COALESCE(u.display_name, u.username) AS username, u.avatar_url
                FROM comments c
                JOIN users u ON c.user_id = u.id
                WHERE c.target_type = ? AND c.target_id = ? AND c.status = 'published'
                ORDER BY c.created_at ASC
            `);
            const result = await stmt.bind(targetType, targetId).all();
            return jsonResponse(result.results || []);
        } catch (error) {
            console.error('❌ GET /api/comments 错误:', error.message);
            return jsonResponse({ error: error.message }, 500);
        }
    }

    if (path === '/api/comments' && method === 'POST') {
        const userId = await getAuthenticatedUserId(request, env);
        if (!userId) return jsonResponse({ error: '请先登录' }, 401);

        try {
            const { target_type, target_id, content, parent_id } = await request.json();
            if (!target_type || !target_id || !content || !content.trim()) {
                return jsonResponse({ error: '参数不完整' }, 400);
            }
            if (content.length > 2000) {
                return jsonResponse({ error: '评论内容过长' }, 400);
            }

            const stmt = env.DB.prepare(`
                INSERT INTO comments (user_id, target_type, target_id, parent_id, content)
                VALUES (?, ?, ?, ?, ?)
            `);
            const result = await stmt.bind(userId, target_type, target_id, parent_id || null, content.trim()).run();

            return jsonResponse({
                success: true,
                id: result.meta?.last_row_id || null,
            }, 201);
        } catch (error) {
            console.error('❌ POST /api/comments 错误:', error.message);
            return jsonResponse({ error: error.message }, 500);
        }
    }

    const commentDeleteMatch = path.match(/^\/api\/comments\/(\d+)$/);
    if (commentDeleteMatch && method === 'DELETE') {
        const userId = await getAuthenticatedUserId(request, env);
        if (!userId) return jsonResponse({ error: '请先登录' }, 401);

        try {
            const id = commentDeleteMatch[1];
            const comment = await env.DB.prepare('SELECT user_id FROM comments WHERE id = ?').bind(id).first();
            if (!comment) return jsonResponse({ error: '评论不存在' }, 404);

            const isAdminUser = await getAuthenticatedUser(request, env, 'admin');
            if (comment.user_id !== userId && !isAdminUser) {
                return jsonResponse({ error: '无权删除' }, 403);
            }

            await env.DB.prepare('UPDATE comments SET status = ? WHERE id = ?').bind('deleted', id).run();
            return jsonResponse({ success: true });
        } catch (error) {
            console.error('❌ DELETE /api/comments 错误:', error.message);
            return jsonResponse({ error: error.message }, 500);
        }
    }

    // ============================================================
    // 点赞 API
    // ============================================================

    if (path === '/api/likes' && method === 'GET') {
        try {
            const targetType = url.searchParams.get('target_type');
            const targetId = parseInt(url.searchParams.get('target_id') || '0');
            if (!targetType || !targetId) {
                return jsonResponse({ error: '缺少参数' }, 400);
            }

            const countRow = await env.DB.prepare(`
                SELECT COUNT(*) as total FROM likes WHERE target_type = ? AND target_id = ?
            `).bind(targetType, targetId).first();

            let userLiked = false;
            const userId = await getAuthenticatedUserId(request, env);
            if (userId) {
                const likeRow = await env.DB.prepare(`
                    SELECT id FROM likes WHERE user_id = ? AND target_type = ? AND target_id = ?
                `).bind(userId, targetType, targetId).first();
                userLiked = !!likeRow;
            }

            return jsonResponse({ count: countRow?.total || 0, userLiked });
        } catch (error) {
            console.error('❌ GET /api/likes 错误:', error.message);
            return jsonResponse({ error: error.message }, 500);
        }
    }

    if (path === '/api/likes' && method === 'POST') {
        const userId = await getAuthenticatedUserId(request, env);
        if (!userId) return jsonResponse({ error: '请先登录' }, 401);

        try {
            const { target_type, target_id } = await request.json();
            if (!target_type || !target_id) {
                return jsonResponse({ error: '参数不完整' }, 400);
            }

            await env.DB.prepare(`
                INSERT OR IGNORE INTO likes (user_id, target_type, target_id) VALUES (?, ?, ?)
            `).bind(userId, target_type, target_id).run();

            const countRow = await env.DB.prepare(`
                SELECT COUNT(*) as total FROM likes WHERE target_type = ? AND target_id = ?
            `).bind(target_type, target_id).first();

            return jsonResponse({ success: true, count: countRow?.total || 0 });
        } catch (error) {
            console.error('❌ POST /api/likes 错误:', error.message);
            return jsonResponse({ error: error.message }, 500);
        }
    }

    if (path === '/api/likes' && method === 'DELETE') {
        const userId = await getAuthenticatedUserId(request, env);
        if (!userId) return jsonResponse({ error: '请先登录' }, 401);

        try {
            const { target_type, target_id } = await request.json();
            if (!target_type || !target_id) {
                return jsonResponse({ error: '参数不完整' }, 400);
            }

            await env.DB.prepare(`
                DELETE FROM likes WHERE user_id = ? AND target_type = ? AND target_id = ?
            `).bind(userId, target_type, target_id).run();

            const countRow = await env.DB.prepare(`
                SELECT COUNT(*) as total FROM likes WHERE target_type = ? AND target_id = ?
            `).bind(target_type, target_id).first();

            return jsonResponse({ success: true, count: countRow?.total || 0 });
        } catch (error) {
            console.error('❌ DELETE /api/likes 错误:', error.message);
            return jsonResponse({ error: error.message }, 500);
        }
    }

    // ============================================================
    // 论坛 API
    // ============================================================

    if (path === '/api/forum/boards' && method === 'GET') {
        try {
            const result = await env.DB.prepare(`
                SELECT b.id, b.name, b.slug, b.description, b.icon, b.sort_order,
                       (SELECT COUNT(*) FROM forum_threads t WHERE t.board_id = b.id AND t.status = 'published') as thread_count,
                       (SELECT COUNT(*) FROM forum_posts p JOIN forum_threads t2 ON p.thread_id = t2.id WHERE t2.board_id = b.id AND p.status = 'published') as post_count
                FROM forum_boards b
                WHERE b.status = 'active'
                ORDER BY b.sort_order ASC
            `).all();
            return jsonResponse(result.results || []);
        } catch (error) {
            console.error('❌ GET /api/forum/boards 错误:', error.message);
            return jsonResponse({ error: error.message }, 500);
        }
    }

    if (path === '/api/forum/threads' && method === 'GET') {
        try {
            const boardId = parseInt(url.searchParams.get('board_id') || '0');
            const page = Math.max(parseInt(url.searchParams.get('page') || '1'), 1);
            const limit = Math.min(Math.max(parseInt(url.searchParams.get('limit') || '20'), 1), 50);
            const offset = (page - 1) * limit;

            let whereClause = "WHERE t.status = 'published'";
            let params = [];
            if (boardId) {
                whereClause += ' AND t.board_id = ?';
                params.push(boardId);
            }

            const stmt = env.DB.prepare(`
                SELECT t.id, t.board_id, t.title, t.is_pinned, t.is_locked,
                       t.view_count, t.reply_count, t.like_count,
                       t.created_at, t.last_reply_at,
                       COALESCE(u.display_name, u.username) AS username,
                       b.name as board_name, b.slug as board_slug
                FROM forum_threads t
                JOIN users u ON t.user_id = u.id
                JOIN forum_boards b ON t.board_id = b.id
                ${whereClause}
                ORDER BY t.is_pinned DESC, t.last_reply_at DESC, t.created_at DESC
                LIMIT ? OFFSET ?
            `);
            const result = await stmt.bind(...params, limit, offset).all();

            const countStmt = env.DB.prepare(`
                SELECT COUNT(*) as total FROM forum_threads t ${whereClause}
            `);
            const countRow = await countStmt.bind(...params).first();

            return jsonResponse({
                threads: result.results || [],
                total: countRow?.total || 0,
                page,
                limit,
            });
        } catch (error) {
            console.error('❌ GET /api/forum/threads 错误:', error.message);
            return jsonResponse({ error: error.message }, 500);
        }
    }

    const threadDetailMatch = path.match(/^\/api\/forum\/threads\/(\d+)$/);
    if (threadDetailMatch && method === 'GET') {
        try {
            const id = threadDetailMatch[1];
            const thread = await env.DB.prepare(`
                SELECT t.*, COALESCE(u.display_name, u.username) AS username,
                       b.name as board_name, b.slug as board_slug
                FROM forum_threads t
                JOIN users u ON t.user_id = u.id
                JOIN forum_boards b ON t.board_id = b.id
                WHERE t.id = ? AND t.status = 'published'
            `).bind(id).first();

            if (!thread) return jsonResponse({ error: '主题不存在' }, 404);

            await env.DB.prepare('UPDATE forum_threads SET view_count = view_count + 1 WHERE id = ?').bind(id).run();

            const posts = await env.DB.prepare(`
                SELECT p.id, p.user_id, p.parent_id, p.content, p.floor_number, p.like_count,
                       p.created_at, COALESCE(u.display_name, u.username) AS username
                FROM forum_posts p
                JOIN users u ON p.user_id = u.id
                WHERE p.thread_id = ? AND p.status = 'published'
                ORDER BY p.created_at ASC
            `).bind(id).all();

            return jsonResponse({
                thread,
                posts: posts.results || [],
            });
        } catch (error) {
            console.error('❌ GET /api/forum/threads/:id 错误:', error.message);
            return jsonResponse({ error: error.message }, 500);
        }
    }

    if (path === '/api/forum/threads' && method === 'POST') {
        const userId = await getAuthenticatedUserId(request, env);
        if (!userId) return jsonResponse({ error: '请先登录' }, 401);

        try {
            const { board_id, title, content } = await request.json();
            if (!board_id || !title || !title.trim() || !content || !content.trim()) {
                return jsonResponse({ error: '参数不完整' }, 400);
            }
            if (title.length > 200) {
                return jsonResponse({ error: '标题过长' }, 400);
            }

            const board = await env.DB.prepare('SELECT id FROM forum_boards WHERE id = ? AND status = ?').bind(board_id, 'active').first();
            if (!board) return jsonResponse({ error: '版块不存在' }, 404);

            const stmt = env.DB.prepare(`
                INSERT INTO forum_threads (board_id, user_id, title, content, last_reply_at, last_reply_user_id)
                VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP, ?)
            `);
            const result = await stmt.bind(board_id, userId, title.trim(), content.trim(), userId).run();

            return jsonResponse({
                success: true,
                id: result.meta?.last_row_id || null,
            }, 201);
        } catch (error) {
            console.error('❌ POST /api/forum/threads 错误:', error.message);
            return jsonResponse({ error: error.message }, 500);
        }
    }

    if (path === '/api/forum/posts' && method === 'POST') {
        const userId = await getAuthenticatedUserId(request, env);
        if (!userId) return jsonResponse({ error: '请先登录' }, 401);

        try {
            const { thread_id, content, parent_id } = await request.json();
            if (!thread_id || !content || !content.trim()) {
                return jsonResponse({ error: '参数不完整' }, 400);
            }

            const thread = await env.DB.prepare('SELECT id, is_locked FROM forum_threads WHERE id = ? AND status = ?').bind(thread_id, 'published').first();
            if (!thread) return jsonResponse({ error: '主题不存在' }, 404);
            if (thread.is_locked) return jsonResponse({ error: '该主题已锁定' }, 403);

            const floorRow = await env.DB.prepare('SELECT COUNT(*) as total FROM forum_posts WHERE thread_id = ?').bind(thread_id).first();
            const floorNumber = (floorRow?.total || 0) + 1;

            const stmt = env.DB.prepare(`
                INSERT INTO forum_posts (thread_id, user_id, parent_id, content, floor_number)
                VALUES (?, ?, ?, ?, ?)
            `);
            const result = await stmt.bind(thread_id, userId, parent_id || null, content.trim(), floorNumber).run();

            await env.DB.prepare(`
                UPDATE forum_threads SET reply_count = reply_count + 1, last_reply_at = CURRENT_TIMESTAMP, last_reply_user_id = ? WHERE id = ?
            `).bind(userId, thread_id).run();

            return jsonResponse({
                success: true,
                id: result.meta?.last_row_id || null,
                floor_number: floorNumber,
            }, 201);
        } catch (error) {
            console.error('❌ POST /api/forum/posts 错误:', error.message);
            return jsonResponse({ error: error.message }, 500);
        }
    }

    // ===== 管理特别感谢（写入 R2） =====
    if (path === '/api/admin/thanks' && method === 'PUT') {
        const denied = requirePermission(isAdmin, 'thanks');
        if (denied) return denied;
        try {
            const body = await request.json();
            const data = body.data;
            if (!Array.isArray(data)) {
                return jsonResponse({ error: '数据格式错误，需要数组' }, 400);
            }
            for (const item of data) {
                if (!item.name || typeof item.name !== 'string') {
                    return jsonResponse({ error: '每个致谢必须有 name 字段' }, 400);
                }
            }
            const content = JSON.stringify(data, null, 2);
            await env.R2_BUCKET.put('special-thanks.json', content, {
                httpMetadata: { contentType: 'application/json' },
            });
            return jsonResponse({ success: true, message: '保存成功' });
        } catch (error) {
            console.error('❌ 保存特别感谢失败:', error.message);
            return jsonResponse({ error: error.message }, 500);
        }
    }

    const shopDeleteMatch = path.match(/^\/api\/admin\/shop\/(\d+)$/);
    if (shopDeleteMatch && method === 'DELETE') {
        const denied = requirePermission(isAdmin, 'shop');
        if (denied) return denied;
        try {
            const id = shopDeleteMatch[1];
            const target = await env.DB.prepare('SELECT title FROM shop WHERE id = ?').bind(id).first();
            const stmt = env.DB.prepare('DELETE FROM shop WHERE id = ?');
            await stmt.bind(id).run();
            ctx.waitUntil(logAuditEvent(env, {
                eventType: 'delete', actorAdminId: isAdmin.sub, actorUsername: isAdmin.username,
                targetTable: 'shop', targetId: Number(id),
                summary: { title: target?.title }, request,
            }));
            return jsonResponse({ success: true });
        } catch (error) {
            console.error('❌ shop DELETE 错误:', error.message);
            return jsonResponse({ error: error.message }, 500);
        }
    }

    // ===== 静态 JSON 文件（特别致谢） =====
    if (path === '/special-thanks.json' && method === 'GET') {
        try {
            const object = await env.R2_BUCKET.get('special-thanks.json');
            if (!object) {
                return jsonResponse({ error: 'Not Found' }, 404);
            }
            const content = await object.text();
            return new Response(content, {
                headers: {
                    'Content-Type': 'application/json',
                    'Access-Control-Allow-Origin': '*',
                    'Cache-Control': 'public, max-age=3600',
                }
            });
        } catch (error) {
            console.error('❌ 读取 special-thanks.json 失败:', error.message);
            return jsonResponse({ error: 'Internal Server Error' }, 500);
        }
    }

    // Let the Workers Static Assets binding serve the SPA entry for direct
    // history URLs such as /omew and /starmap.
    if ((method === 'GET' || method === 'HEAD') && !path.startsWith('/api/')) {
        return env.ASSETS.fetch(request);
    }

    return jsonResponse({ error: 'Not Found' }, 404);
}

// ============================================================
// 工具函数
// ============================================================
async function verifyTurnstileToken(token, env) {
    const formData = new FormData();
    formData.append('secret', env.TURNSTILE_SECRET);
    formData.append('response', token);

    const response = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
        method: 'POST',
        body: formData,
    });

    return response.json();
}

async function sendEmail(to, subject, html, env) {
    const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${env.RESEND_API_KEY}`,
            'Content-Type': 'application/json; charset=UTF-8',
        },
        body: JSON.stringify({
            from: '星尘粉丝站 <noreply@stardustinfinity.top>',
            to: [to],
            subject: subject,
            html: html,
        }),
    });
    if (!res.ok) {
        const error = await res.text();
        console.error('❌ 邮件发送失败:', error);
        throw new Error(error);
    }
    return res.json();
}

function base64UrlEncodeBytes(bytes) {
    let binary = '';
    for (let i = 0; i < bytes.length; i++) {
        binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function base64UrlEncodeString(str) {
    return base64UrlEncodeBytes(new TextEncoder().encode(str));
}

function base64UrlDecodeToBytes(str) {
    str = str.replace(/-/g, '+').replace(/_/g, '/');
    while (str.length % 4) str += '=';
    const binary = atob(str);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
        bytes[i] = binary.charCodeAt(i);
    }
    return bytes;
}

function base64UrlDecodeToString(str) {
    return new TextDecoder().decode(base64UrlDecodeToBytes(str));
}

function encodeBase64(bytes) {
    if (typeof bytes.toBase64 === 'function') {
        return bytes.toBase64();
    }
    return base64UrlEncodeBytes(bytes).replace(/-/g, '+').replace(/_/g, '/');
}

function decodeBase64ToBytes(str) {
    if (typeof Uint8Array.fromBase64 === 'function') {
        return Uint8Array.fromBase64(str);
    }
    const binary = atob(str);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
        bytes[i] = binary.charCodeAt(i);
    }
    return bytes;
}

function normalizeCoverBase64(input) {
    if (!input || typeof input !== 'string') return null;
    const m = input.match(/^data:image\/[a-zA-Z0-9.+-]+;base64,(.*)$/s);
    return m ? m[1] : input;
}

function validateCoverBase64(raw) {
    if (raw.length > 1_500_000) {
        return { ok: false, error: '封面数据过大，请检查前端压缩逻辑' };
    }
    try {
        const bytes = decodeBase64ToBytes(raw);
        const magic = String.fromCharCode(...bytes.slice(0, 4));
        const format = String.fromCharCode(...bytes.slice(8, 12));
        if (bytes.length < 12 || magic !== 'RIFF' || format !== 'WEBP') {
            return { ok: false, error: '封面必须是有效的 WebP 数据' };
        }
    } catch {
        return { ok: false, error: '封面 base64 解码失败' };
    }
    return { ok: true };
}

async function importHmacKey(env, secret = env.TOKEN_SECRET) {
    return crypto.subtle.importKey(
        'raw',
        new TextEncoder().encode(secret),
        { name: 'HMAC', hash: 'SHA-256' },
        false,
        ['sign', 'verify']
    );
}

async function signToken(payload, env, secret = env.TOKEN_SECRET) {
    const payloadPart = base64UrlEncodeString(JSON.stringify(payload));
    const key = await importHmacKey(env, secret);
    const signatureBuf = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(payloadPart));
    const signaturePart = base64UrlEncodeBytes(new Uint8Array(signatureBuf));
    return `${payloadPart}.${signaturePart}`;
}

async function getAuthenticatedUser(request, env, expectedRole) {
    const authorization = request.headers.get('Authorization') || '';
    let token = authorization.startsWith('Bearer ') ? authorization.slice(7).trim() : '';

    if (!token) {
        const cookie = request.headers.get('Cookie') || '';
        const authCookie = cookie.split(';').map(part => part.trim()).find(part => part.startsWith('authToken='));
        if (authCookie) {
            try {
                token = decodeURIComponent(authCookie.slice('authToken='.length));
            } catch {
                token = '';
            }
        }
    }

    if (!token) return null;
    const payload = await verifyToken(token, env);
    if (payload?.role !== expectedRole) return null;
    if (expectedRole === 'user') {
        const user = await env.DB.prepare(`
            SELECT u.username, COALESCE(u.display_name, u.username) AS display_name, s.active, u.deleted_at
            FROM users u LEFT JOIN scim_user_state s ON s.user_id = u.id WHERE u.id = ?
        `).bind(payload.sub).first();
        if (!user || user.active === 0 || user.deleted_at) return null;
        return { ...payload, username: user.username, display_name: user.display_name };
    }

    // 管理员：每次请求回查账号，删除账号或调整权限可以立即生效（不必等 token 过期）
    if (expectedRole === 'admin') {
        const row = await env.DB.prepare(
            'SELECT id, username, role, permissions FROM admins WHERE id = ?'
        ).bind(payload.sub).first();
        if (!row) return null;
        return {
            sub: payload.sub,
            exp: payload.exp,
            username: row.username,
            role: normalizeAdminRole(row.role),
            permissions: parseAdminPermissions(row.permissions),
        };
    }

    return payload;
}

async function getAuthenticatedUserId(request, env) {
    const payload = await getAuthenticatedUser(request, env, 'user');
    return payload?.sub || null;
}

async function suggestAvailableUsername(db, user) {
    const preferred = usernameCandidate(user.username, user.id);
    const fallback = `user_${user.id}`;
    for (let attempt = 0; attempt < 100; attempt += 1) {
        const candidate = attempt === 0 ? preferred : attempt === 1 ? fallback : `${fallback}_${attempt}`;
        if (!isValidUsername(candidate)) continue;
        const existing = await db.prepare('SELECT id FROM users WHERE username = ? COLLATE NOCASE AND id <> ?').bind(candidate, user.id).first();
        if (!existing) return candidate;
    }
    throw new Error('无法生成可用用户名');
}

async function verifyToken(token, env) {
    try {
        if (!env.TOKEN_SECRET) return false;

        const parts = token.split('.');
        if (parts.length !== 2) return false;
        const [payloadPart, signaturePart] = parts;

        const key = await importHmacKey(env);
        const signatureBytes = base64UrlDecodeToBytes(signaturePart);
        const payloadBytes = new TextEncoder().encode(payloadPart);

        const valid = await crypto.subtle.verify('HMAC', key, signatureBytes, payloadBytes);
        if (!valid) return false;

        const payload = JSON.parse(base64UrlDecodeToString(payloadPart));
        if (!(payload.exp > Date.now())) return false;
        return payload;
    } catch {
        return false;
    }
}

const PBKDF2_ITERATIONS = 50_000;

async function hashPassword(password, iterations = PBKDF2_ITERATIONS) {
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const keyMaterial = await crypto.subtle.importKey(
        'raw', new TextEncoder().encode(password), { name: 'PBKDF2' }, false, ['deriveBits']
    );
    const derivedBits = await crypto.subtle.deriveBits(
        { name: 'PBKDF2', salt, iterations, hash: 'SHA-256' }, keyMaterial, 256
    );
    return `pbkdf2-sha256$${iterations}$${encodeBase64(salt)}$${encodeBase64(new Uint8Array(derivedBits))}`;
}

async function verifyPassword(password, encoded) {
    try {
        const [algo, iterStr, saltB64, hashB64] = encoded.split('$');
        if (algo !== 'pbkdf2-sha256') return false;
        const iterations = parseInt(iterStr, 10);
        const salt = decodeBase64ToBytes(saltB64);
        const expected = decodeBase64ToBytes(hashB64);
        const keyMaterial = await crypto.subtle.importKey(
            'raw', new TextEncoder().encode(password), { name: 'PBKDF2' }, false, ['deriveBits']
        );
        const derivedBits = await crypto.subtle.deriveBits(
            { name: 'PBKDF2', salt, iterations, hash: 'SHA-256' }, keyMaterial, expected.length * 8
        );
        const actual = new Uint8Array(derivedBits);
        if (actual.length !== expected.length) return false;
        return crypto.subtle.timingSafeEqual(actual, expected);
    } catch {
        return false;
    }
}

const DUMMY_PASSWORD_HASH = 'pbkdf2-sha256$50000$5odBT/N538xlVrDF/a45bQ==$UjyWXvGUTYv1q1mx6ejZ+fX0hYR8v1eQFt8nq5eRopU=';

async function logAuditEvent(env, { eventType, actorAdminId = null, actorUsername = null, targetTable = null, targetId = null, summary = null, request }) {
    try {
        await env.DB.prepare(`
            INSERT INTO audit_logs (event_type, actor_admin_id, actor_username, target_table, target_id, summary, ip_address, user_agent)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `).bind(
            eventType, actorAdminId, actorUsername, targetTable, targetId,
            summary ? JSON.stringify(summary) : null,
            request.headers.get('CF-Connecting-IP') || null,
            request.headers.get('User-Agent') || null,
        ).run();
    } catch (e) {
        console.error('❌ 审计日志写入失败:', e.message);
    }
}