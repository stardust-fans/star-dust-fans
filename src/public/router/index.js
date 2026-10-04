import { createRouter, createWebHistory } from "vue-router";
import { PAGE_TITLE_MAP } from "../../shared/constants.js";
import HomeView from "../views/HomeView.vue";
import VideosView from "../views/VideosView.vue";
import DailyView from "../views/DailyView.vue";
import FanartView from "../views/FanartView.vue";
import ShopView from "../views/ShopView.vue";
import StarmapView from "../views/StarmapView.vue";
import OmewView from "../views/OmewView.vue";
import AboutView from "../views/AboutView.vue";
import RegisterView from "../views/RegisterView.vue";
import LoginView from "../views/LoginView.vue";
import ChangeUsernameView from "../views/ChangeUsernameView.vue";
import FanartDetail from "../views/FanartDetail.vue";
import ShopDetail from "../views/ShopDetail.vue";
import GuideView from "../views/GuideView.vue";
import UserView from "../views/UserView.vue";
import EasterEggView from "../views/EasterEggView.vue";
import { API_BASE } from "../../shared/api.js";
import FallbackView from "../views/FallbackView.vue";

const router = createRouter({
  history: createWebHistory(),
  linkExactActiveClass: "active",
  scrollBehavior: () => ({
    top: 0,
    behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches
      ? "auto"
      : "smooth",
  }),
  routes: [
    { path: "/", name: "home", component: HomeView },
    { path: "/videos", name: "videos", component: VideosView },
    { path: "/daily", name: "daily", component: DailyView },
    { path: "/fanart", name: "fanart", component: FanartView },
    { path: "/shop", name: "shop", component: ShopView },
    // fullBleed：整幅铺满，不渲染底部栏与站点背景
    {
      path: "/starmap",
      name: "starmap",
      component: StarmapView,
      meta: { fullBleed: true },
    },
    {
      path: "/omew",
      name: "omew",
      component: OmewView,
      meta: { fullBleed: true, requiresAuth: true },
    },
    { path: "/about", name: "about", component: AboutView },
    { path: "/login", name: "login", component: LoginView },
    { path: "/change-username", name: "change-username", component: ChangeUsernameView, meta: { requiresAuth: true } },
    { path: "/register", name: "register", component: RegisterView },
    { path: "/fanart/:id", name: "fanart-detail", component: FanartDetail },
    { path: "/shop/:id", name: "shop-detail", component: ShopDetail },
    { path: "/guide", name: "guide", component: GuideView },
    {
      path: "/user",
      name: "user",
      component: UserView,
      meta: { requiresAuth: true },
    },
    {
    path: "/fallback",
    name: "Fallback",
    component: FallbackView,
    meta: { title: "无法访问", fullBleed: true, hideChrome: true },
    },
    {
      path: "/aspirateur",
      name: "aspirateur",
      component: EasterEggView,
      meta: { fullBleed: true, hideChrome: true },
    },
    { path: "/:pathMatch(.*)*", redirect: "/" },
  ],
});

router.beforeEach(async (to) => {
  if (!to.meta.requiresAuth) return true;
  const authCookie = document.cookie
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith("authToken="));
  if (!authCookie) return { name: "login", query: { return_to: to.fullPath } };
  let token;
  try {
    token = decodeURIComponent(authCookie.slice("authToken=".length));
  } catch {
    return { name: "login", query: { return_to: to.fullPath } };
  }
  try {
    const response = await fetch(`${API_BASE}/user/profile`, { headers: { Authorization: `Bearer ${token}` } });
    if (response.status === 401) return { name: "login", query: { return_to: to.fullPath } };
    if (response.ok && (await response.json()).username_change_required && to.name !== "change-username") {
      return { name: "change-username", query: { return_to: to.fullPath } };
    }
  } catch {
    return true;
  }
  return true;
});

router.afterEach((to) => {
  document.title = PAGE_TITLE_MAP[to.name] || "星尘粉丝站";
});

export default router;
