<template>
  <footer class="footer">
    <div class="footer-container">
      <p class="footer-egg" @click="handleEggClick">✦ 众星为你· 皆降为尘 ✦</p>
    </div>
  </footer>
</template>

<script setup>
import { useToast } from '../composables/useToast.js';

const { showToast } = useToast();

const CLICKS_TO_ENTER = 5;
const RESET_DELAY_MS = 1500;

let clickCount = 0;
let resetTimer = null;

function handleEggClick() {
  clickCount += 1;
  clearTimeout(resetTimer);

  const remaining = CLICKS_TO_ENTER - clickCount;
  if (remaining === 2) {
    showToast('再点击两次进入管理登陆面板', 'info');
  } else if (remaining === 1) {
    showToast('再点击一次进入管理登陆面板', 'info');
  } else if (remaining <= 0) {
    window.location.href = '/admin/';
    return;
  }

  resetTimer = setTimeout(() => {
    clickCount = 0;
  }, RESET_DELAY_MS);
}
</script>
