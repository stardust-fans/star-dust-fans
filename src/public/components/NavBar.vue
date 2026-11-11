<template>
  <nav class="navbar">
    <div class="nav-container">
      <RouterLink to="/" class="nav-brand">
        <img
          class="nav-brand-logo"
          src="/logo.svg"
          alt=""
          width="26"
          height="26"
        />
        星尘
        <span
          class="nav-brand-mark"
          role="button"
          tabindex="0"
          title="切换站点"
          @click.prevent.stop="openStations"
          @keydown.enter.prevent.stop="openStations"
          @keydown.space.prevent.stop="openStations"
        >吸尘器聚集地</span>
      </RouterLink>
      <ul class="nav-menu" :class="{ open: menuOpen }">
        <li><RouterLink to="/" @click="closeMenu">{{ copy.nav.home }}</RouterLink></li>
        <li><RouterLink to="/videos" @click="closeMenu">{{ copy.nav.videos }}</RouterLink></li>
        <li><RouterLink to="/lyrics" @click="closeMenu">{{ copy.nav.lyrics }}</RouterLink></li>
        <li><RouterLink to="/fanart" @click="closeMenu">{{ copy.nav.fanart }}</RouterLink></li>
        <li><RouterLink to="/shop" @click="closeMenu">{{ copy.nav.shop }}</RouterLink></li>
        <li><RouterLink to="/daily" @click="closeMenu">{{ copy.nav.daily }}</RouterLink></li>
        <li><RouterLink to="/starmap" @click="closeMenu">{{ copy.nav.starmap }}</RouterLink></li>
        <li><RouterLink to="/omew" @click="closeMenu">{{ copy.nav.forum }}</RouterLink></li>
        <li><RouterLink to="/about" @click="closeMenu">{{ copy.nav.about }}</RouterLink></li>
        <li v-if="!user">
          <RouterLink to="/login" @click="closeMenu">登录</RouterLink>
        </li>
        <li v-else>
          <RouterLink to="/user" class="nav-user" @click="closeMenu">
            {{ user.display_name || user.username }}
          </RouterLink>
        </li>
      </ul>
      <button
        class="nav-toggle"
        aria-label="菜单"
        @click="menuOpen = !menuOpen"
      >
        <span></span><span></span><span></span>
      </button>
    </div>
  </nav>

  <StationSwitcher v-model:open="stationsOpen" />
</template>

<script setup>
import { ref, computed, watch, onMounted } from "vue";
import { useRoute, useRouter } from "vue-router";
import { useLogin } from "../composables/useLogin.js";
import { useSite } from "../composables/useSite.js";
import StationSwitcher from "./StationSwitcher.vue";
import { siteCopy } from "../../shared/sites.js";

const route = useRoute();
const router = useRouter();
const menuOpen = ref(false);
const stationsOpen = ref(false);
const { getUser, refreshUser } = useLogin();
const { site } = useSite();

// 导航文案随站点走，没写 copy 的站回落尘站
const copy = computed(() => siteCopy(site.value?.key));

function openStations() {
  stationsOpen.value = true;
}

const user = ref(getUser());

onMounted(async () => {
  const current = await refreshUser().catch(() => null);
  if (current) {
    user.value = current;
    if (current.username_change_required && !["login", "register", "change-username"].includes(route.name)) {
      router.replace({ name: "change-username", query: { return_to: route.fullPath } });
    }
  }
});

function closeMenu() {
  menuOpen.value = false;
}

watch(
  () => route.fullPath,
  () => {
    menuOpen.value = false;
  },
);
</script>
