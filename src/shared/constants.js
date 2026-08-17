export const FANART_TYPE_LABELS = {
    illust: '插画',
    video: '视频',
    fiction: '小说',
    music: '音乐',
};

export const SONG_STATUS_LABELS = {
    published: '已发布',
    flagged: '⚠️ 已标记',
    hidden: '🔒 隐藏',
    deleted: '🗑️ 已删除',
};

export const AUDIT_EVENT_LABELS = {
    login_success: '登录成功',
    login_failure: '登录失败',
    create: '新建',
    update: '更新',
    delete: '删除',
};

export const AUDIT_TARGET_TABLE_LABELS = {
    songs: '歌曲',
    daily: '日报',
    fanart: '同人作品',
    shop: '量贩商品',
    admins: '管理员账户',
};

// 播放量等级门槛：借鉴日本 VOCALOID 社区"殿堂入り/伝説入り"惯例
export const MASTERPIECE_VIEW_THRESHOLD = 100000; // 殿堂曲：播放量 ≥ 10万
export const LEGEND_VIEW_THRESHOLD = 1000000; // 传说曲：播放量 ≥ 100万

export const PAGE_TITLE_MAP = {
    home: '星尘 · 永远闪耀',
    videos: '视频 · 星尘粉丝站',
    fanart: '同人 · 星尘粉丝站',
    shop: '量贩 · 星尘粉丝站',
    daily: '吸尘器日报 · 星尘粉丝站',
    starmap: '星图 · 星尘粉丝站',
    about: '关于 · 星尘粉丝站',
};
