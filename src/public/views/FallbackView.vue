<template>
  <main class="fallback-page">
    <img class="fallback-image" :src="guideImage" alt="" />
    <h1 class="fallback-title">{{ config.title }}</h1>
    <p class="fallback-desc">{{ config.desc }}</p>
  </main>
</template>

<script setup>
import { computed } from "vue";
import { useRoute } from "vue-router";
import guideImage from "../assets/fallback-guide.png";

const route = useRoute();

const reasons = {
  "auth-required": {
    title: "需要先登录",
    desc: "你访问的页面需要登录后才能查看。",
  },
  "admin-only": {
    title: "仅限管理员访问",
    desc: "你的账号没有管理员权限，无法进入这个页面。",
  },
  "not-found": {
    title: "这条轨道不存在",
    desc: "你要找的页面可能已被移除、改名，或者链接输错了。",
  },
  "resource-missing": {
    title: "这个资源已经不在了",
    desc: "你访问的内容可能已被删除，或者尚未通过审核。",
  },
  "session-expired": {
    title: "登录已过期",
    desc: "为了安全起见，你的登录状态已经失效，请重新登录。",
  },
  "unknown-error": {
    title: "遇到了未知问题",
    desc: "页面遇到了一点小状况，请稍后重试。",
  },
  "session-expired": {
    title: "登录已过期",
    desc: "为了安全起见，登录状态已经失效，请重新登录。",
 },
 "admin-only": {
    title: "仅限管理员访问",
    desc: "你的账号没有管理员权限，无法进入这个页面。",
 },
"server-error": {
    title: "服务器故障",
    desc: "我们的服务暂时出了点问题，请稍后重试。",
 },
};

const fallbackConfig = {
  title: "这里暂时无法访问",
  desc: "页面遇到了一点小状况，请稍后重试。",
};

const config = computed(() => reasons[route.query.reason] || fallbackConfig);
</script>

<style scoped>
.fallback-page {
  position: fixed; inset: 0;
  background: #ffffff;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 2rem;
  text-align: center;
}

.fallback-image {
  width: 220px;
  max-width: 60vw;
  height: auto;
  margin-bottom: 2rem;
}

.fallback-title {
  font-size: 1.6rem;
  font-weight: 600;
  color: #1a1a1a;
  margin: 0 0 0.8rem;
}

.fallback-desc {
  font-size: 0.95rem;
  color: #666666;
  line-height: 1.7;
  margin: 0;
  max-width: 420px;
}
</style>