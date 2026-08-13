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

        // ===== 1. GET /api/songs - 获取歌曲列表（公开，直接读取快照，不再实时拉取B站） =====
        if (path === '/api/songs' && method === 'GET') {
            try {
                const stmt = env.DB.prepare(`
                    SELECT id, bvid, title, cover_base64, description, duration, pubdate,
                           owner_name, owner_mid, owner_face,
                           stat_view, stat_danmaku, stat_reply, stat_favorite, stat_coin, stat_share, stat_like,
                           is_masterpiece, is_national_team, is_gods_descend,
                           special_tags, collaboration_details, status
                    FROM songs
                    WHERE status = 'published'
                    ORDER BY id DESC
                `);
                const result = await stmt.all();
                const songs = (result.results || []).map(row => ({
                    id: row.id,
                    bvid: row.bvid,
                    title: row.title || '未知标题',
                    cover: row.cover_base64 ? `data:image/webp;base64,${row.cover_base64}` : '',
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
                    special_tags: row.special_tags ? JSON.parse(row.special_tags) : [],
                    collaboration_details: row.collaboration_details,
                    status: row.status,
                }));
                return jsonResponse(songs);
            } catch (error) {
                console.error('❌ /api/songs 错误:', error.message);
                return jsonResponse({ error: error.message }, 500);
            }
        }

                // ===== 1.5 GET /api/daily - 获取已发布的日报（公开） =====
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

        // ===== 1.6 GET /api/fanart - 获取已发布的同人作品（公开） =====
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

        // ===== 1.7 GET /api/shop - 获取已发布的商品（公开） =====
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

        // ===== 2. GET /api/songs/bili/:bvid - 获取B站视频信息（预览用，含封面原始字节） =====
        const biliMatch = path.match(/^\/api\/songs\/bili\/(BV[a-zA-Z0-9]{10})$/);
        if (biliMatch && method === 'GET') {
            const bvid = biliMatch[1];
            try {
                const biliData = await fetchBiliInfo(bvid);
                if (!biliData) {
                    return jsonResponse({ error: 'B站视频不存在或已删除' }, 404);
                }

                let pic_base64 = null;
                if (biliData.pic) {
                    try {
                        const imgRes = await fetch(biliData.pic, {
                            headers: {
                                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                                'Referer': 'https://www.bilibili.com/',
                            }
                        });
                        if (imgRes.ok) {
                            const bytes = new Uint8Array(await imgRes.arrayBuffer());
                            const mime = imgRes.headers.get('content-type') || 'image/jpeg';
                            pic_base64 = `data:${mime};base64,${encodeBase64(bytes)}`;
                        }
                    } catch (e) {
                        console.error(`封面拉取失败 (${bvid}):`, e.message);
                    }
                }

                return jsonResponse({ ...biliData, pic_base64 });
            } catch (error) {
                console.error('❌ /api/songs/bili 错误:', error.message);
                return jsonResponse({ error: error.message }, 500);
            }
        }

        // ===== 3. POST /api/admin/verify - 验证管理员密码 =====
        if (path === '/api/admin/verify' && method === 'POST') {
            try {
                const body = await request.json();
                const password = body.password;
                const ADMIN_PASSWORD = env.ADMIN_PASSWORD;
                if (!ADMIN_PASSWORD) {
                    return jsonResponse({ error: '服务未配置' }, 503);
                }

                if (password === ADMIN_PASSWORD) {
                    if (!env.TOKEN_SECRET) {
                        return jsonResponse({ error: '服务未配置' }, 503);
                    }
                    const token = await signToken({
                        exp: Date.now() + 24 * 60 * 60 * 1000,
                        role: 'admin'
                    }, env);
                    return jsonResponse({ success: true, token });
                }
                return jsonResponse({ error: '密码错误' }, 401);
            } catch (error) {
                console.error('❌ /api/admin/verify 错误:', error.message);
                return jsonResponse({ error: error.message }, 400);
            }
        }

        // ===== 4. POST /api/admin/songs - 添加歌曲（含标题/封面/统计数字快照） =====
        if (path === '/api/admin/songs' && method === 'POST') {
            if (!isAdmin) return jsonResponse({ error: '未授权' }, 401);
            try {
                const body = await request.json();
                const { bvid, special_tags, collaboration_details, status, flag_reason,
                        is_masterpiece, is_national_team, is_gods_descend,
                        cover, title, description, duration, pubdate, owner, stats } = body;

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
                        bvid, title, cover_base64, description, duration, pubdate,
                        owner_name, owner_mid, owner_face,
                        stat_view, stat_danmaku, stat_reply, stat_favorite, stat_coin, stat_share, stat_like,
                        snapshot_synced_at,
                        is_masterpiece, is_national_team, is_gods_descend,
                        special_tags, collaboration_details, status, flag_reason
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, ?, ?, ?, ?, ?, ?, ?)
                `);
                const result = await stmt.bind(
                    bvid,
                    title,
                    coverBase64,
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
                    special_tags ? JSON.stringify(special_tags) : null,
                    collaboration_details || null,
                    status || 'published',
                    flag_reason || null
                ).run();

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

        // ===== 5. PUT /api/admin/songs/:id - 更新歌曲（快照字段可选，未提供的保留原值） =====
        const putMatch = path.match(/^\/api\/admin\/songs\/(\d+)$/);
        if (putMatch && method === 'PUT') {
            if (!isAdmin) return jsonResponse({ error: '未授权' }, 401);
            try {
                const id = putMatch[1];
                const body = await request.json();
                const { special_tags, collaboration_details, status, flag_reason,
                        is_masterpiece, is_national_team, is_gods_descend,
                        cover, title, description, duration, pubdate, owner, stats } = body;

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
                    special_tags ? JSON.stringify(special_tags) : null,
                    collaboration_details || null,
                    status || 'published',
                    flag_reason || null,
                    id
                ).run();

                if (result.meta?.changes === 0) {
                    return jsonResponse({ error: '歌曲不存在' }, 404);
                }

                return jsonResponse({ success: true, message: '更新成功' });
            } catch (error) {
                console.error('❌ PUT /api/admin/songs 错误:', error.message);
                return jsonResponse({ error: error.message }, 500);
            }
        }

        // ===== 6. DELETE /api/admin/songs/:id - 删除歌曲 =====
        const deleteMatch = path.match(/^\/api\/admin\/songs\/(\d+)$/);
        if (deleteMatch && method === 'DELETE') {
            if (!isAdmin) return jsonResponse({ error: '未授权' }, 401);
            try {
                const id = deleteMatch[1];
                const stmt = env.DB.prepare(`
                    UPDATE songs SET status = 'deleted', updated_at = CURRENT_TIMESTAMP
                    WHERE id = ?
                `);
                const result = await stmt.bind(id).run();

                if (result.meta?.changes === 0) {
                    return jsonResponse({ error: '歌曲不存在' }, 404);
                }

                return jsonResponse({ success: true, message: '已删除' });
            } catch (error) {
                console.error('❌ DELETE /api/admin/songs 错误:', error.message);
                return jsonResponse({ error: error.message }, 500);
            }
        }

        // ============================================================
        // ===== 7. 吸尘器日报 API =====
        // ============================================================

        // GET /api/admin/daily
        if (path === '/api/admin/daily' && method === 'GET') {
            if (!isAdmin) return jsonResponse({ error: '未授权' }, 401);
            try {
                console.log('📊 查询 daily 表...');
                const stmt = env.DB.prepare('SELECT * FROM daily ORDER BY publish_date DESC, id DESC');
                const result = await stmt.all();
                console.log('✅ daily 查询成功，共', result.results?.length || 0, '条');
                return jsonResponse(result.results || []);
            } catch (error) {
                console.error('❌ daily GET 错误:', error.message);
                console.error('❌ 错误堆栈:', error.stack);
                return jsonResponse({ error: error.message }, 500);
            }
        }

        // POST /api/admin/daily
        if (path === '/api/admin/daily' && method === 'POST') {
            if (!isAdmin) return jsonResponse({ error: '未授权' }, 401);
            try {
                const { title, content, source_url, cover_url, publish_date, status } = await request.json();
                const stmt = env.DB.prepare(`
                    INSERT INTO daily (title, content, source_url, cover_url, publish_date, status)
                    VALUES (?, ?, ?, ?, ?, ?)
                `);
                const result = await stmt.bind(title, content, source_url || null, cover_url || null, publish_date || null, status || 'published').run();
                return jsonResponse({ success: true, id: result.meta?.last_row_id });
            } catch (error) {
                console.error('❌ daily POST 错误:', error.message);
                return jsonResponse({ error: error.message }, 500);
            }
        }

        // PUT /api/admin/daily/:id
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
                return jsonResponse({ success: true });
            } catch (error) {
                console.error('❌ daily PUT 错误:', error.message);
                return jsonResponse({ error: error.message }, 500);
            }
        }

        // DELETE /api/admin/daily/:id
        const dailyDeleteMatch = path.match(/^\/api\/admin\/daily\/(\d+)$/);
        if (dailyDeleteMatch && method === 'DELETE') {
            if (!isAdmin) return jsonResponse({ error: '未授权' }, 401);
            try {
                const id = dailyDeleteMatch[1];
                const stmt = env.DB.prepare('DELETE FROM daily WHERE id = ?');
                await stmt.bind(id).run();
                return jsonResponse({ success: true });
            } catch (error) {
                console.error('❌ daily DELETE 错误:', error.message);
                return jsonResponse({ error: error.message }, 500);
            }
        }

        // ============================================================
        // ===== 8. 同人作品 API =====
        // ============================================================

        // GET /api/admin/fanart
        if (path === '/api/admin/fanart' && method === 'GET') {
            if (!isAdmin) return jsonResponse({ error: '未授权' }, 401);
            try {
                console.log('📊 查询 fanart 表...');
                const stmt = env.DB.prepare('SELECT * FROM fanart ORDER BY created_at DESC');
                const result = await stmt.all();
                console.log('✅ fanart 查询成功，共', result.results?.length || 0, '条');
                return jsonResponse(result.results || []);
            } catch (error) {
                console.error('❌ fanart GET 错误:', error.message);
                console.error('❌ 错误堆栈:', error.stack);
                return jsonResponse({ error: error.message }, 500);
            }
        }

        // POST /api/admin/fanart
        if (path === '/api/admin/fanart' && method === 'POST') {
            if (!isAdmin) return jsonResponse({ error: '未授权' }, 401);
            try {
                const { title, author, description, image_url, bilibili_url, source_url, type, status } = await request.json();
                const stmt = env.DB.prepare(`
                    INSERT INTO fanart (title, author, description, image_url, bilibili_url, source_url, type, status)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                `);
                const result = await stmt.bind(title, author || null, description || null, image_url || null, bilibili_url || null, source_url || null, type || 'illust', status || 'published').run();
                return jsonResponse({ success: true, id: result.meta?.last_row_id });
            } catch (error) {
                console.error('❌ fanart POST 错误:', error.message);
                return jsonResponse({ error: error.message }, 500);
            }
        }

        // PUT /api/admin/fanart/:id
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
                return jsonResponse({ success: true });
            } catch (error) {
                console.error('❌ fanart PUT 错误:', error.message);
                return jsonResponse({ error: error.message }, 500);
            }
        }

        // DELETE /api/admin/fanart/:id
        const fanartDeleteMatch = path.match(/^\/api\/admin\/fanart\/(\d+)$/);
        if (fanartDeleteMatch && method === 'DELETE') {
            if (!isAdmin) return jsonResponse({ error: '未授权' }, 401);
            try {
                const id = fanartDeleteMatch[1];
                const stmt = env.DB.prepare('DELETE FROM fanart WHERE id = ?');
                await stmt.bind(id).run();
                return jsonResponse({ success: true });
            } catch (error) {
                console.error('❌ fanart DELETE 错误:', error.message);
                return jsonResponse({ error: error.message }, 500);
            }
        }

        // ============================================================
        // ===== 9. 量贩商品 API =====
        // ============================================================

        // GET /api/admin/shop
        if (path === '/api/admin/shop' && method === 'GET') {
            if (!isAdmin) return jsonResponse({ error: '未授权' }, 401);
            try {
                console.log('📊 查询 shop 表...');
                const stmt = env.DB.prepare('SELECT * FROM shop ORDER BY created_at DESC');
                const result = await stmt.all();
                console.log('✅ shop 查询成功，共', result.results?.length || 0, '条');
                return jsonResponse(result.results || []);
            } catch (error) {
                console.error('❌ shop GET 错误:', error.message);
                console.error('❌ 错误堆栈:', error.stack);
                return jsonResponse({ error: error.message }, 500);
            }
        }

        // POST /api/admin/shop
        if (path === '/api/admin/shop' && method === 'POST') {
            if (!isAdmin) return jsonResponse({ error: '未授权' }, 401);
            try {
                const { title, description, price, image_url, bilibili_url, xianyu_url, status } = await request.json();
                const stmt = env.DB.prepare(`
                    INSERT INTO shop (title, description, price, image_url, bilibili_url, xianyu_url, status)
                    VALUES (?, ?, ?, ?, ?, ?, ?)
                `);
                const result = await stmt.bind(title, description || null, price || null, image_url || null, bilibili_url || null, xianyu_url || null, status || 'waiting').run();
                return jsonResponse({ success: true, id: result.meta?.last_row_id });
            } catch (error) {
                console.error('❌ shop POST 错误:', error.message);
                return jsonResponse({ error: error.message }, 500);
            }
        }

        // PUT /api/admin/shop/:id
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
                return jsonResponse({ success: true });
            } catch (error) {
                console.error('❌ shop PUT 错误:', error.message);
                return jsonResponse({ error: error.message }, 500);
            }
        }

        // DELETE /api/admin/shop/:id
        const shopDeleteMatch = path.match(/^\/api\/admin\/shop\/(\d+)$/);
        if (shopDeleteMatch && method === 'DELETE') {
            if (!isAdmin) return jsonResponse({ error: '未授权' }, 401);
            try {
                const id = shopDeleteMatch[1];
                const stmt = env.DB.prepare('DELETE FROM shop WHERE id = ?');
                await stmt.bind(id).run();
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

// 标准 base64（非 url-safe），用于图片数据。优先用运行时原生方法（无 JS 逐字节循环），
// 老运行时回退到手写实现——图片字节量比 token 大得多，逐字节循环会真实吃掉 CPU 预算。
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

// 上限约 1.5MB base64（对应 ~1.1MB 二进制），远高于预期的 20-60KB 压缩目标，
// 只是兜底防御，真正的尺寸控制在前端 Canvas 转码阶段。
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
        return payload.exp > Date.now();
    } catch {
        return false;
    }
}

async function fetchBiliInfo(bvid) {
    const url = `https://api.bilibili.com/x/web-interface/view?bvid=${bvid}`;
    try {
        const response = await fetch(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                'Referer': 'https://www.bilibili.com/',
            }
        });
        const data = await response.json();
        if (data.code === 0) {
            return data.data;
        }
        console.error(`B站API错误 (${bvid}):`, data.message);
        return null;
    } catch (error) {
        console.error(`请求失败 (${bvid}):`, error.message);
        return null;
    }
}

