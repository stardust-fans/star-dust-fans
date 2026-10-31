import { createRouter, createWebHashHistory } from 'vue-router';
import SongsModule from '../modules/SongsModule.vue';
import DailyModule from '../modules/DailyModule.vue';
import FanartModule from '../modules/FanartModule.vue';
import ShopModule from '../modules/ShopModule.vue';
import AuditLogModule from '../modules/AuditLogModule.vue';
import AdminsModule from '../modules/AdminsModule.vue';
import PendingModule from '../modules/PendingModule.vue';
import TagsModule from '../modules/TagsModule.vue';
import { useAdminAuth } from '../composables/useAdminAuth.js';
import { NAV_ITEMS, scopeOfRoute } from '../navItems.js';

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
        { path: '/pending', name: 'pending', component: PendingModule },
        { path: '/thanks', name: 'thanks', component: () => import('../modules/ThanksModule.vue') },
        { path: '/tags', name: 'tags', component: TagsModule },
    ],
});

// 权限守卫：没有该模块权限就不让进，跳到第一个有权限的页面
router.beforeEach((to) => {
    const { admin, can } = useAdminAuth();
    const scope = scopeOfRoute(to.name);
    if (!scope) return true;
    // 权限档案还没拉回来时先放行，App 会在加载完后兜底
    if (!admin.value) return true;
    if (can(scope)) return true;

    const fallback = NAV_ITEMS.find((item) => can(item.scope));
    return fallback ? { name: fallback.key } : true;
});

export default router;
