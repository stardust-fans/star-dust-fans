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

        // ===== 1. GET /api/songs - 获取歌曲列表（公开） =====
        if (path === '/api/songs' && method === 'GET') {
            try {
                const data = await getCachedSongs(env, ctx);
                return data;
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

        // ===== 2. GET /api/songs/bili/:bvid - 获取B站视频信息 =====
        const biliMatch = path.match(/^\/api\/songs\/bili\/(BV[a-zA-Z0-9]{10})$/);
        if (biliMatch && method === 'GET') {
            const bvid = biliMatch[1];
            try {
                const biliData = await fetchBiliInfo(bvid);
                if (biliData) {
                    return jsonResponse(biliData);
                }
                return jsonResponse({ error: 'B站视频不存在或已删除' }, 404);
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

        // ===== 4. POST /api/admin/songs - 添加歌曲 =====
        if (path === '/api/admin/songs' && method === 'POST') {
            if (!isAdmin) return jsonResponse({ error: '未授权' }, 401);
            try {
                const body = await request.json();
                const { bvid, special_tags, collaboration_details, status, flag_reason,
                        is_masterpiece, is_national_team, is_gods_descend } = body;

                const existStmt = env.DB.prepare('SELECT id FROM songs WHERE bvid = ?');
                const existing = await existStmt.bind(bvid).first();
                if (existing) {
                    return jsonResponse({ error: '该歌曲已存在' }, 409);
                }

                const stmt = env.DB.prepare(`
                    INSERT INTO songs (
                        bvid, is_masterpiece, is_national_team, is_gods_descend,
                        special_tags, collaboration_details, status, flag_reason
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                `);
                const result = await stmt.bind(
                    bvid,
                    is_masterpiece || 0,
                    is_national_team || 0,
                    is_gods_descend || 0,
                    special_tags ? JSON.stringify(special_tags) : null,
                    collaboration_details || null,
                    status || 'published',
                    flag_reason || null
                ).run();

                await clearCache(env);
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

        // ===== 5. PUT /api/admin/songs/:id - 更新歌曲 =====
        const putMatch = path.match(/^\/api\/admin\/songs\/(\d+)$/);
        if (putMatch && method === 'PUT') {
            if (!isAdmin) return jsonResponse({ error: '未授权' }, 401);
            try {
                const id = putMatch[1];
                const body = await request.json();
                const { special_tags, collaboration_details, status, flag_reason,
                        is_masterpiece, is_national_team, is_gods_descend } = body;

                const stmt = env.DB.prepare(`
                    UPDATE songs SET
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

                await clearCache(env);
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

                await clearCache(env);
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

async function fetchSongsAndEnrich(env) {
    const stmt = env.DB.prepare(`
        SELECT id, bvid, is_masterpiece, is_national_team,
               is_gods_descend, special_tags, collaboration_details
        FROM songs
        WHERE status = 'published'
        ORDER BY id DESC
    `);
    const songs = await stmt.all();

    const enriched = await Promise.all(
        songs.results.map(async (song) => {
            const biliData = await fetchBiliInfo(song.bvid);
            return {
                id: song.id,
                bvid: song.bvid,
                title: biliData?.title || '未知标题',
                cover: biliData?.pic || '',
                description: biliData?.desc || '',
                pubdate: biliData?.pubdate || 0,
                duration: biliData?.duration || 0,
                stats: biliData?.stat || {},
                owner: biliData?.owner || {},
                is_masterpiece: song.is_masterpiece === 1,
                is_national_team: song.is_national_team === 1,
                is_gods_descend: song.is_gods_descend === 1,
                special_tags: song.special_tags ? JSON.parse(song.special_tags) : [],
                collaboration_details: song.collaboration_details,
                status: 'published',
            };
        })
    );

    return enriched;
}

async function getCachedSongs(env, ctx) {
    const cache = caches.default;
    const cacheKey = 'https://api.stardustinfinity.top/songs-cache';

    const cached = await cache.match(cacheKey);
    if (cached) {
        const data = await cached.json();
        return Response.json(data, {
            headers: {
                'Access-Control-Allow-Origin': '*',
                'Cache-Control': 'max-age=300',
            }
        });
    }

    const songs = await fetchSongsAndEnrich(env);
    const response = Response.json(songs, {
        headers: {
            'Access-Control-Allow-Origin': '*',
            'Cache-Control': 'max-age=300',
        }
    });

    ctx.waitUntil(cache.put(cacheKey, response.clone()));
    return response;
}

async function clearCache(env) {
    const cache = caches.default;
    const cacheKey = 'https://api.stardustinfinity.top/songs-cache';
    await cache.delete(cacheKey);
}