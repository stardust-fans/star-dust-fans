// ============================================================
// 星尘粉丝站 - 主逻辑（完整版）
// ============================================================

(function() {
    'use strict';

    // ---------- 配置 ----------
    const API_BASE = '/api';

    // ---------- DOM ----------
    const contentEl = document.getElementById('content');
    const navLinks = document.querySelectorAll('.nav-menu a');
    const navToggle = document.getElementById('navToggle');
    const navMenu = document.getElementById('navMenu');

    // ---------- 状态 ----------
    let allSongs = [];

    // ---------- 工具函数 ----------
    function formatNumber(num) {
        if (!num) return '0';
        if (num >= 10000) return (num / 10000).toFixed(1) + '万';
        return num.toLocaleString();
    }

    function formatDuration(seconds) {
        if (!seconds) return '--:--';
        const m = Math.floor(seconds / 60);
        const s = seconds % 60;
        return `${m}:${s.toString().padStart(2, '0')}`;
    }

    function formatDate(timestamp) {
        if (!timestamp) return '未知';
        const d = new Date(timestamp * 1000);
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    }

    function escapeHtml(str) {
        if (str === null || str === undefined) return '';
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    function getTagClass(tag) {
        const map = {
            '殿堂曲': 'masterpiece',
            '传说曲': 'masterpiece',
            '神调教': 'custom',
            '国风': 'custom',
            '出道曲': 'custom',
        };
        return map[tag] || 'custom';
    }

    // ---------- 通用 API 请求 ----------
    async function fetchAPI(endpoint) {
        try {
            const response = await fetch(`${API_BASE}${endpoint}`);
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            return await response.json();
        } catch (error) {
            console.error(`获取 ${endpoint} 失败:`, error);
            return [];
        }
    }

    // ---------- 渲染：歌曲卡片 ----------
    function renderSongCard(song) {
        const tags = song.special_tags || [];
        const coverUrl = song.cover || '';

        let tagHtml = '';
        if (song.is_masterpiece) tagHtml += `<span class="tag masterpiece">🏆 殿堂曲</span>`;
        if (song.is_national_team) tagHtml += `<span class="tag national">🏛️ 国家队</span>`;
        if (song.is_gods_descend) tagHtml += `<span class="tag gods">⭐ 众神下凡</span>`;
        tags.forEach(t => {
            if (typeof t === 'string') {
                tagHtml += `<span class="tag ${getTagClass(t)}">${escapeHtml(t)}</span>`;
            }
        });

        return `
            <div class="song-card">
                <div class="cover-wrapper">
                    ${coverUrl ? `<img class="cover" src="${escapeHtml(coverUrl)}" alt="${escapeHtml(song.title)}" loading="lazy" referrerpolicy="no-referrer" onerror="this.style.display='none'" />` : ''}
                    ${!coverUrl ? `<div class="cover-placeholder">🎵</div>` : ''}
                </div>
                <div class="info">
                    <h3><a href="https://www.bilibili.com/video/${song.bvid}" target="_blank" rel="noopener">${escapeHtml(song.title)}</a></h3>
                    <div class="meta">
                        <span class="stat"><i class="fas fa-play"></i> ${formatNumber(song.stats?.view)}</span>
                        <span class="stat"><i class="fas fa-thumbs-up"></i> ${formatNumber(song.stats?.like)}</span>
                        <span class="stat"><i class="fas fa-clock"></i> ${formatDuration(song.duration)}</span>
                        <span class="stat"><i class="fas fa-calendar"></i> ${formatDate(song.pubdate)}</span>
                    </div>
                    ${tagHtml ? `<div class="tags">${tagHtml}</div>` : ''}
                </div>
            </div>
        `;
    }

    // ---------- 渲染：主页 ----------
    function renderHomePage(songs) {
        const featuredSongs = songs.slice(0, 6);

        return `
            <section class="hero-section">
                <div class="hero-bg"></div>
                <div class="hero-content">
                    <div class="hero-text">
                        <div class="hero-badge">✦ VOCALOID 中文虚拟歌姬</div>
                        <h1 class="hero-title">星尘</h1>
                        <p class="hero-subtitle">众星因你，皆降为尘</p>
                        <p class="hero-desc">
                            诞生于宇宙高次位面"以太之海"，<br />
                            用歌声连接星辰与大地。
                        </p>
                        <div class="hero-info">
                            <span>🎂 8月12日 · 狮子座</span>
                            <span>📏 160cm · 16岁</span>
                            <span>🌈 #9999FF · #FFFF00</span>
                        </div>
                        <div class="hero-actions">
                            <a href="#songs" class="btn-hero-primary">🎵 听歌</a>
                            <a href="#about" class="btn-hero-secondary">了解更多</a>
                        </div>
                    </div>
                    <div class="hero-visual">
                        <div class="hero-stardust">✦</div>
                    </div>
                </div>
            </section>

            <section class="section" id="songs">
                <div class="section-header">
                    <h2 class="section-title">🎵 最新歌曲</h2>
                    <p class="section-subtitle">收录 ${songs.length} 首星尘的歌声</p>
                </div>
                ${featuredSongs.length > 0 ? `
                    <div class="card-grid">
                        ${featuredSongs.map(song => renderSongCard(song)).join('')}
                    </div>
                    ${songs.length > 6 ? `<div style="text-align:center;margin-top:20px;"><a href="#" data-page="videos" class="btn-hero-secondary" style="display:inline-block;">查看全部 ${songs.length} 首 →</a></div>` : ''}
                ` : `
                    <div class="empty-state">
                        <i class="fas fa-music"></i>
                        <p>暂无歌曲数据，请稍后再来~</p>
                    </div>
                `}
            </section>

            <section class="section" id="about">
                <div class="section-header">
                    <h2 class="section-title">✦ 关于星尘</h2>
                    <p class="section-subtitle">VOCALOID 中文虚拟歌姬 · 用爱发电</p>
                </div>
                <div class="about-grid">
                    <div class="about-card">
                        <h3>🎤 声库</h3>
                        <p>北京福托科技开发 · VOCALOID 中文声库<br />声源：茶理理 · 2016年2月20日发售</p>
                    </div>
                    <div class="about-card">
                        <h3>🎂 生日</h3>
                        <p>8月12日 · 狮子座<br />16岁 · 身高 160cm</p>
                    </div>
                    <div class="about-card">
                        <h3>🌈 代表色</h3>
                        <p>钴蓝 #9999FF · 黄 #FFFF00<br />「众星因你，皆降为尘」</p>
                    </div>
                    <div class="about-card">
                        <h3>🌌 世界观</h3>
                        <p>诞生于宇宙高次位面"以太之海"<br />头发由以太构成，能发出钴蓝色光晕</p>
                    </div>
                </div>
            </section>
        `;
    }

    // ---------- 渲染：视频页 ----------
    function renderVideosPage(songs) {
        if (!songs || songs.length === 0) {
            return `
                <div class="page-header">
                    <h1 class="page-title">🎬 视频</h1>
                    <p class="page-subtitle">星尘的歌声与影像</p>
                </div>
                <div class="empty-state">
                    <i class="fas fa-music"></i>
                    <p>暂无歌曲数据</p>
                </div>
            `;
        }

        return `
            <div class="page-header">
                <h1 class="page-title">🎬 视频</h1>
                <p class="page-subtitle">星尘的歌声与影像 · 共 ${songs.length} 首</p>
            </div>
            <div class="card-grid">
                ${songs.map(song => renderSongCard(song)).join('')}
            </div>
        `;
    }

    // ---------- 渲染：吸尘器日报 ----------
    function renderDailyPage(items) {
        if (!items || items.length === 0) {
            return `
                <div class="page-header">
                    <h1 class="page-title">📰 吸尘器日报</h1>
                    <p class="page-subtitle">今日份的星尘资讯</p>
                </div>
                <div class="empty-state">
                    <i class="fas fa-newspaper"></i>
                    <p>暂无日报，敬请期待~</p>
                </div>
            `;
        }

        return `
            <div class="page-header">
                <h1 class="page-title">📰 吸尘器日报</h1>
                <p class="page-subtitle">星尘的最新动态 · 共 ${items.length} 条</p>
            </div>
            <div class="daily-list">
                ${items.map(item => `
                    <div class="daily-card">
                        ${item.cover_url ? `<img class="daily-cover" src="${escapeHtml(item.cover_url)}" alt="${escapeHtml(item.title)}" referrerpolicy="no-referrer" onerror="this.style.display='none'" />` : ''}
                        <div class="daily-body">
                            <div class="daily-meta">
                                <span class="daily-date">${escapeHtml(item.publish_date || '')}</span>
                            </div>
                            <h3>${escapeHtml(item.title)}</h3>
                            <p>${escapeHtml(item.content || '')}</p>
                            ${item.source_url ? `<a href="${escapeHtml(item.source_url)}" target="_blank" class="link">查看原文 →</a>` : ''}
                        </div>
                    </div>
                `).join('')}
            </div>
        `;
    }

    // ---------- 渲染：同人作品 ----------
    function renderFanartPage(items) {
        if (!items || items.length === 0) {
            return `
                <div class="page-header">
                    <h1 class="page-title">🎨 同人</h1>
                    <p class="page-subtitle">来自吸尘器的爱</p>
                </div>
                <div class="empty-state">
                    <i class="fas fa-palette"></i>
                    <p>暂无同人作品，欢迎投稿~</p>
                </div>
            `;
        }

        const typeMap = { illust: '插画', video: '视频', fiction: '小说', music: '音乐' };

        return `
            <div class="page-header">
                <h1 class="page-title">🎨 同人</h1>
                <p class="page-subtitle">来自吸尘器的爱 · 共 ${items.length} 件作品</p>
            </div>
            <div class="card-grid">
                ${items.map(item => `
                    <div class="fanart-card">
                        ${item.image_url ? `<img class="fanart-image" src="${escapeHtml(item.image_url)}" alt="${escapeHtml(item.title)}" referrerpolicy="no-referrer" onerror="this.style.display='none'" />` : ''}
                        <div class="fanart-info">
                            <div class="fanart-type">${typeMap[item.type] || item.type || '插画'}</div>
                            <h3>${escapeHtml(item.title)}</h3>
                            <p class="fanart-author">✎ ${escapeHtml(item.author || '匿名')}</p>
                            ${item.description ? `<p class="fanart-desc">${escapeHtml(item.description)}</p>` : ''}
                            <div class="fanart-links">
                                ${item.bilibili_url ? `<a href="${escapeHtml(item.bilibili_url)}" target="_blank" class="link">B站观看</a>` : ''}
                                ${item.source_url ? `<a href="${escapeHtml(item.source_url)}" target="_blank" class="link">查看原帖</a>` : ''}
                            </div>
                        </div>
                    </div>
                `).join('')}
            </div>
        `;
    }

    // ---------- 渲染：量贩 ----------
    function renderShopPage(items) {
        if (!items || items.length === 0) {
            return `
                <div class="page-header">
                    <h1 class="page-title">🛒 量贩</h1>
                    <p class="page-subtitle">星尘周边 · 专辑</p>
                </div>
                <div class="empty-state">
                    <i class="fas fa-store"></i>
                    <p>暂无商品，敬请期待~</p>
                </div>
            `;
        }

        return `
            <div class="page-header">
                <h1 class="page-title">🛒 量贩</h1>
                <p class="page-subtitle">星尘周边 · 共 ${items.length} 件</p>
            </div>
            <div class="card-grid">
                ${items.map(item => `
                    <div class="shop-card">
                        ${item.image_url ? `<img class="shop-image" src="${escapeHtml(item.image_url)}" alt="${escapeHtml(item.title)}" referrerpolicy="no-referrer" onerror="this.style.display='none'" />` : ''}
                        <div class="shop-info">
                            <h3>${escapeHtml(item.title)}</h3>
                            ${item.description ? `<p class="shop-desc">${escapeHtml(item.description)}</p>` : ''}
                            <div class="shop-meta">
                                <span class="shop-price">${escapeHtml(item.price || '价格待定')}</span>
                                <span class="shop-status ${item.status === 'shipped' ? 'status-shipped' : 'status-waiting'}">${item.status === 'shipped' ? '🚀 已发车' : '⏳ 等待发车'}</span>
                            </div>
                            <div class="shop-links">
                                ${item.bilibili_url ? `<a href="${escapeHtml(item.bilibili_url)}" target="_blank" class="link">B站</a>` : ''}
                                ${item.xianyu_url ? `<a href="${escapeHtml(item.xianyu_url)}" target="_blank" class="link">闲鱼</a>` : ''}
                            </div>
                        </div>
                    </div>
                `).join('')}
            </div>
        `;
    }

    // ---------- 页面路由 ----------
    function getPageData(page) {
        const pages = {
            home: {
                title: '星尘',
                render: () => renderHomePage(allSongs)
            },
            videos: {
                title: '视频',
                render: () => renderVideosPage(allSongs)
            },
            daily: {
                title: '吸尘器日报',
                render: async () => {
                    const data = await fetchAPI('/daily');
                    return renderDailyPage(data);
                }
            },
            fanart: {
                title: '同人',
                render: async () => {
                    const data = await fetchAPI('/fanart');
                    return renderFanartPage(data);
                }
            },
            shop: {
                title: '量贩',
                render: async () => {
                    const data = await fetchAPI('/shop');
                    return renderShopPage(data);
                }
            }
        };
        return pages[page] || pages.home;
    }

    // ---------- 导航 ----------
    async function navigateTo(page) {
        navLinks.forEach(link => {
            link.classList.remove('active');
            if (link.dataset.page === page) {
                link.classList.add('active');
            }
        });

        const pageData = getPageData(page);
        // 因为 daily/fanart/shop 的 render 是 async，需要 await
        const html = await pageData.render();
        contentEl.innerHTML = html;

        const titleMap = {
            home: '星尘 · 永远闪耀',
            videos: '视频 · 星尘粉丝站',
            fanart: '同人 · 星尘粉丝站',
            shop: '量贩 · 星尘粉丝站',
            daily: '吸尘器日报 · 星尘粉丝站'
        };
        document.title = titleMap[page] || '星尘粉丝站';

        window.scrollTo({ top: 0, behavior: 'smooth' });
        navMenu.classList.remove('open');
    }

    // ---------- 加载数据 ----------
    async function loadSongs() {
        try {
            const response = await fetch(`${API_BASE}/songs`);
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            const data = await response.json();
            allSongs = data || [];
            return allSongs;
        } catch (error) {
            console.error('加载歌曲数据失败:', error);
            allSongs = [];
            return [];
        }
    }

    // ---------- 启动 ----------
    async function init() {
        contentEl.innerHTML = `<div class="loading">⏳ 加载中...</div>`;
        await loadSongs();
        navigateTo('home');

        navLinks.forEach(link => {
            link.addEventListener('click', function(e) {
                e.preventDefault();
                const page = this.dataset.page;
                if (page) navigateTo(page);
            });
        });

        navToggle.addEventListener('click', () => navMenu.classList.toggle('open'));
        document.addEventListener('click', (e) => {
            if (!e.target.closest('.navbar')) navMenu.classList.remove('open');
        });

        contentEl.addEventListener('click', (e) => {
            const target = e.target.closest('[data-page]');
            if (target) {
                e.preventDefault();
                navigateTo(target.dataset.page);
            }
        });

        console.log('✦ 星尘粉丝站已启动');
        console.log(`📊 共加载 ${allSongs.length} 首歌曲`);
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

})();