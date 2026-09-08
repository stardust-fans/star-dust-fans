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
  if (remaining === 6) {
    showToast('喂！', 'info');
  } else if (remaining === 5) {
    showToast('别点我了！', 'info');
  } else if (remaining === 4) {
    showToast('欸嘿嘿嘿嘿~', 'info');
  } else if (remaining === 3) {
    showToast('杂鱼杂鱼，即便是发现彩蛋也进不去的杂鱼呢~', 'info');
  } else if (remaining === 2) {
    showToast('我不服输，哼！', 'info');
  } else if (remaining === 1) {
    showToast('你赢了喵....', 'info');
  } else if (remaining <= 0) {
    window.location.href = '/aspirateur/';
    return;
  }

  resetTimer = setTimeout(() => {
    clickCount = 0;
  }, RESET_DELAY_MS);
}
</script>
