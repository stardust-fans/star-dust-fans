import { createRouter, createWebHistory } from 'vue-router';
import { PAGE_TITLE_MAP } from '../../shared/constants.js';
import HomeView from '../views/HomeView.vue';
import VideosView from '../views/VideosView.vue';
import DailyView from '../views/DailyView.vue';
import FanartView from '../views/FanartView.vue';
import ShopView from '../views/ShopView.vue';
import StarmapView from '../views/StarmapView.vue';
import AboutView from '../views/AboutView.vue';

const router = createRouter({
    history: createWebHistory(),
    linkExactActiveClass: 'active',
    scrollBehavior: () => ({ top: 0, behavior: 'smooth' }),
    routes: [
        { path: '/', name: 'home', component: HomeView },
        { path: '/videos', name: 'videos', component: VideosView },
        { path: '/daily', name: 'daily', component: DailyView },
        { path: '/fanart', name: 'fanart', component: FanartView },
        { path: '/shop', name: 'shop', component: ShopView },
        // fullBleed：整幅铺满，不渲染底部栏与站点背景
        { path: '/starmap', name: 'starmap', component: StarmapView, meta: { fullBleed: true } },
        { path: '/about', name: 'about', component: AboutView },
        { path: '/:pathMatch(.*)*', redirect: '/' },
    ],
});

router.afterEach((to) => {
    document.title = PAGE_TITLE_MAP[to.name] || '星尘粉丝站';
});

export default router;
