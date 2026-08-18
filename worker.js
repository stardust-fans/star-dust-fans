// worker.js
export default {
    async fetch(request, env, ctx) {
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

        const authHeader = request.headers.get('Authorization');
        let isAdmin = false;
        if (authHeader && authHeader.startsWith('Bearer ')) {
            const token = authHeader.slice(7);
            isAdmin = await verifyToken(token, env);
        }

        // ===== 1. GET /api/songs - 分页获取歌曲列表 =====
        if (path === '/api/songs' && method === 'GET') {
            try {
                const stmt = env.DB.prepare(`
                    SELECT id, bvid, title, cover_base64, cover_url, description, duration, pubdate,
                           owner_name, owner_mid, owner_face,
                           stat_view, stat_danmaku, stat_reply, stat_favorite, stat_coin, stat_share, stat_like,
                           is_masterpiece, is_national_team, is_gods_descend, is_legend,
                           special_tags, collaboration_details, status
                    FROM songs
                    WHERE status = 'published'
                    ORDER BY id ASC
                    LIMIT ? OFFSET ?
                `);
                const result = await stmt.bind(safeLimit, offset).all();

                const countStmt = env.DB.prepare('SELECT COUNT(*) as total FROM songs WHERE status = "published"');
                const countResult = await countStmt.first();

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
                }));

                return jsonResponse({
                    data: songs,
                    total: countResult?.total || 0,
                    limit: safeLimit,
                    offset: offset,
                    hasMore: (offset + safeLimit) < (countResult?.total || 0)
                });
            } catch (error) {
                console.error('❌ /api/songs 错误:', error.message);
                return jsonResponse({ error: error.message }, 500);
            }
        }

        // ===== 1.1 GET /api/songs/count - 获取歌曲总数（轻量） =====
        if (path === '/api/songs/count' && method === 'GET') {
            try {
                const stmt = env.DB.prepare('SELECT COUNT(*) as total FROM songs WHERE status = "published"');
                const result = await stmt.first();
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

        // ===== 1.6 GET /api/fanart =====
        if (path === '/api/fanart' && method === 'GET') {
            try {
                const stmt = env.DB.prepare(`
                    SELECT id, title, author, description, image_url, bilibili_url, source_url, type
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
                    SELECT id, title, description, price, image_url, bilibili_url, xianyu_url, status
                    FROM shop
                    WHERE status = 'waiting' OR status = 'shipped'
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
                    ? await env.DB.prepare('SELECT id, username, password_hash FROM admins WHERE username = ?').bind(username).first()
                    : null;

                const passwordOk = row
                    ? await verifyPassword(password, row.password_hash)
                    : await verifyPassword(password, DUMMY_PASSWORD_HASH);

                if (row && passwordOk) {
                    const token = await signToken({
                        sub: row.id,
                        username: row.username,
                        exp: Date.now() + 24 * 60 * 60 * 1000,
                    }, env);
                    ctx.waitUntil(logAuditEvent(env, {
                        eventType: 'login_success', actorAdminId: row.id, actorUsername: row.username, request,
                    }));
                    return jsonResponse({ success: true, token });
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

        // ===== 3.5 管理员账号管理 =====
        if (path === '/api/admin/admins' && method === 'POST') {
            if (!isAdmin) return jsonResponse({ error: '未授权' }, 401);
            try {
                const { username, password } = await request.json();
                if (!username || !String(username).trim()) {
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
                    'INSERT INTO admins (username, password_hash) VALUES (?, ?)'
                ).bind(username, passwordHash).run();

                ctx.waitUntil(logAuditEvent(env, {
                    eventType: 'create', actorAdminId: isAdmin.sub, actorUsername: isAdmin.username,
                    targetTable: 'admins', targetId: result.meta?.last_row_id,
                    summary: { username }, request,
                }));

                return jsonResponse({ success: true, id: result.meta?.last_row_id });
            } catch (error) {
                console.error('❌ POST /api/admin/admins 错误:', error.message);
                return jsonResponse({ error: error.message }, 500);
            }
        }

        if (path === '/api/admin/admins' && method === 'GET') {
            if (!isAdmin) return jsonResponse({ error: '未授权' }, 401);
            try {
                const result = await env.DB.prepare('SELECT id, username, created_at FROM admins ORDER BY id ASC').all();
                return jsonResponse(result.results || []);
            } catch (error) {
                console.error('❌ GET /api/admin/admins 错误:', error.message);
                return jsonResponse({ error: error.message }, 500);
            }
        }

        const adminDeleteMatch = path.match(/^\/api\/admin\/admins\/(\d+)$/);
        if (adminDeleteMatch && method === 'DELETE') {
            if (!isAdmin) return jsonResponse({ error: '未授权' }, 401);
            try {
                const id = parseInt(adminDeleteMatch[1], 10);
                if (isAdmin.sub === id) {
                    return jsonResponse({ error: '不能删除自己' }, 400);
                }

                const countRow = await env.DB.prepare('SELECT COUNT(*) AS n FROM admins').first();
                if ((countRow?.n || 0) <= 1) {
                    return jsonResponse({ error: '不能删除最后一个管理员账号' }, 400);
                }

                const target = await env.DB.prepare('SELECT username FROM admins WHERE id = ?').bind(id).first();
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

        // ===== 3.6 GET /api/admin/audit-logs =====
        if (path === '/api/admin/audit-logs' && method === 'GET') {
            if (!isAdmin) return jsonResponse({ error: '未授权' }, 401);
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
            if (!isAdmin) return jsonResponse({ error: '未授权' }, 401);
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
            if (!isAdmin) return jsonResponse({ error: '未授权' }, 401);
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
            if (!isAdmin) return jsonResponse({ error: '未授权' }, 401);
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

        // ===== 7. 吸尘器日报 API =====
        if (path === '/api/admin/daily' && method === 'GET') {
            if (!isAdmin) return jsonResponse({ error: '未授权' }, 401);
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
            if (!isAdmin) return jsonResponse({ error: '未授权' }, 401);
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
            if (!isAdmin) return jsonResponse({ error: '未授权' }, 401);
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
            if (!isAdmin) return jsonResponse({ error: '未授权' }, 401);
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
            if (!isAdmin) return jsonResponse({ error: '未授权' }, 401);
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
            if (!isAdmin) return jsonResponse({ error: '未授权' }, 401);
            try {
                const { title, author, description, image_url, bilibili_url, source_url, type, status } = await request.json();
                const stmt = env.DB.prepare(`
                    INSERT INTO fanart (title, author, description, image_url, bilibili_url, source_url, type, status)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                `);
                const result = await stmt.bind(title, author || null, description || null, image_url || null, bilibili_url || null, source_url || null, type || 'illust', status || 'published').run();
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
            if (!isAdmin) return jsonResponse({ error: '未授权' }, 401);
            try {
                const id = fanartPutMatch[1];
                const { title, author, description, image_url, bilibili_url, source_url, type, status } = await request.json();
                const stmt = env.DB.prepare(`
                    UPDATE fanart SET title = ?, author = ?, description = ?, image_url = ?, bilibili_url = ?, source_url = ?, type = ?, status = ?, updated_at = CURRENT_TIMESTAMP
                    WHERE id = ?
                `);
                await stmt.bind(title, author || null, description || null, image_url || null, bilibili_url || null, source_url || null, type || 'illust', status || 'published', id).run();
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
            if (!isAdmin) return jsonResponse({ error: '未授权' }, 401);
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
            if (!isAdmin) return jsonResponse({ error: '未授权' }, 401);
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
            if (!isAdmin) return jsonResponse({ error: '未授权' }, 401);
            try {
                const { title, description, price, image_url, bilibili_url, xianyu_url, status } = await request.json();
                const stmt = env.DB.prepare(`
                    INSERT INTO shop (title, description, price, image_url, bilibili_url, xianyu_url, status)
                    VALUES (?, ?, ?, ?, ?, ?, ?)
                `);
                const result = await stmt.bind(title, description || null, price || null, image_url || null, bilibili_url || null, xianyu_url || null, status || 'waiting').run();
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
            if (!isAdmin) return jsonResponse({ error: '未授权' }, 401);
            try {
                const id = shopPutMatch[1];
                const { title, description, price, image_url, bilibili_url, xianyu_url, status } = await request.json();
                const stmt = env.DB.prepare(`
                    UPDATE shop SET title = ?, description = ?, price = ?, image_url = ?, bilibili_url = ?, xianyu_url = ?, status = ?, updated_at = CURRENT_TIMESTAMP
                    WHERE id = ?
                `);
                await stmt.bind(title, description || null, price || null, image_url || null, bilibili_url || null, xianyu_url || null, status || 'waiting', id).run();
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

        const shopDeleteMatch = path.match(/^\/api\/admin\/shop\/(\d+)$/);
        if (shopDeleteMatch && method === 'DELETE') {
            if (!isAdmin) return jsonResponse({ error: '未授权' }, 401);
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

        return jsonResponse({ error: 'Not Found' }, 404);
    }
};

// ============================================================
// 工具函数
// ============================================================

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

async function importHmacKey(env) {
    return crypto.subtle.importKey(
        'raw',
        new TextEncoder().encode(env.TOKEN_SECRET),
        { name: 'HMAC', hash: 'SHA-256' },
        false,
        ['sign', 'verify']
    );
}

async function signToken(payload, env) {
    const payloadPart = base64UrlEncodeString(JSON.stringify(payload));
    const key = await importHmacKey(env);
    const signatureBuf = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(payloadPart));
    const signaturePart = base64UrlEncodeBytes(new Uint8Array(signatureBuf));
    return `${payloadPart}.${signaturePart}`;
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