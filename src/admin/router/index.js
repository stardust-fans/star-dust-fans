import { createRouter, createWebHashHistory } from 'vue-router';
import SongsModule from '../modules/SongsModule.vue';
import DailyModule from '../modules/DailyModule.vue';
import FanartModule from '../modules/FanartModule.vue';
import ShopModule from '../modules/ShopModule.vue';
import AuditLogModule from '../modules/AuditLogModule.vue';
import AdminsModule from '../modules/AdminsModule.vue';

// Hash 路由：# 之后的部分不发到服务器，绕开 Cloudflare assets.not_found_handling
// 只支持单一全局回退目标（公开站 index.html）的限制，硬刷新后台深链接不会误回退到公开站。
const router = createRouter({
    history: createWebHashHistory(),
    linkExactActiveClass: 'active',
    routes: [
        { path: '/', redirect: '/songs' },
        { path: '/songs', name: 'songs', component: SongsModule },
        { path: '/daily', name: 'daily', component: DailyModule },
        { path: '/fanart', name: 'fanart', component: FanartModule },
        { path: '/shop', name: 'shop', component: ShopModule },
        { path: '/audit-log', name: 'audit-log', component: AuditLogModule },
        { path: '/admins', name: 'admins', component: AdminsModule },
        { path: '/:pathMatch(.*)*', redirect: '/songs' },
    ],
});

export default router;
