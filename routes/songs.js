// routes/songs.js
function createSongsRouter(adapter) {
    const router = require('express').Router();

    // GET /api/songs - 获取所有已发布的歌曲列表
    router.get('/', async (req, res, next) => {
        try {
            const sql = `
                SELECT id, title, bilibili_url, type, release_date,
                       cover_url, is_masterpiece, is_national_team,
                       is_gods_descend, special_tags
                FROM songs
                WHERE status = 'published'
                ORDER BY release_date DESC
            `;
            // 注意：adapter.query 可能是异步（D1）或同步（SQLite），统一用 await 处理
            const songs = await adapter.query(sql);
            res.json(songs);
        } catch (error) {
            next(error);
        }
    });

    // GET /api/songs/:id - 获取单首歌曲详情
    router.get('/:id', async (req, res, next) => {
        try {
            const { id } = req.params;
            const sql = `
                SELECT id, title, bilibili_url, type, release_date,
                       cover_url, is_masterpiece, is_national_team,
                       is_gods_descend, special_tags, collaboration_details,
                       status, flag_reason, flag_details, flag_link
                FROM songs
                WHERE id = ?
            `;
            const song = await adapter.queryOne(sql, [id]);

            if (!song) {
                return res.status(404).json({ error: '歌曲未找到' });
            }

            res.json(song);
        } catch (error) {
            next(error);
        }
    });

    return router;
}

module.exports = createSongsRouter;